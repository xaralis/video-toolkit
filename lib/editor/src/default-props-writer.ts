import { Project, SyntaxKind } from 'ts-morph';
import type {
  ArrayLiteralExpression,
  JsxAttribute,
  JsxOpeningElement,
  JsxSelfClosingElement,
  Node,
  ObjectLiteralExpression,
  PropertyAssignment,
} from 'ts-morph';

type CompositionEl = JsxSelfClosingElement | JsxOpeningElement;

/**
 * Evaluates a JSON-shaped literal expression node (object/array/string/number/boolean/null,
 * optionally negative numbers) without executing any code. This intentionally does NOT use
 * `eval`/`new Function` on the expression text: `readDefaultProps` will later be used by the
 * save endpoint to read back arbitrary `Root.tsx` source, and that source must never be
 * executed as JS. Any node kind outside this literal grammar (identifiers, function calls,
 * template expressions with substitutions, etc.) throws instead of silently running it.
 */
function evaluateLiteral(node: Node): unknown {
  switch (node.getKind()) {
    case SyntaxKind.ObjectLiteralExpression: {
      const obj = node.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      // Build on a null-prototype object so a literal key named "__proto__" (or any other
      // Object.prototype accessor) becomes an ordinary own data property via [[Set]] instead of
      // triggering the inherited `__proto__` setter and reassigning the result's prototype. The
      // final spread copies every own enumerable property (including a key literally named
      // "__proto__") onto a normal plain object via [[DefineOwnProperty]], not [[Set]] — matching
      // JSON.parse's semantics of always producing a real own data property.
      const result: Record<string, unknown> = Object.create(null);
      for (const prop of obj.getProperties()) {
        if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
          throw new Error(
            `readDefaultProps: unsupported object member "${prop.getText()}" (only plain "key: value" properties are supported).`,
          );
        }
        const nameNode = prop.getNameNode();
        let key: string;
        if (nameNode.isKind(SyntaxKind.StringLiteral)) {
          key = nameNode.getLiteralValue();
        } else if (nameNode.isKind(SyntaxKind.Identifier)) {
          key = nameNode.getText();
        } else {
          throw new Error(
            `readDefaultProps: unsupported object member "${prop.getText()}" (computed property names are not supported; only plain "key: value" properties are supported).`,
          );
        }
        result[key] = evaluateLiteral(prop.getInitializerOrThrow());
      }
      return { ...result };
    }
    case SyntaxKind.ArrayLiteralExpression: {
      const arr = node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
      return arr.getElements().map((el) => evaluateLiteral(el));
    }
    case SyntaxKind.StringLiteral:
      return node.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
    case SyntaxKind.NoSubstitutionTemplateLiteral:
      return node.asKindOrThrow(SyntaxKind.NoSubstitutionTemplateLiteral).getLiteralValue();
    case SyntaxKind.NumericLiteral:
      return node.asKindOrThrow(SyntaxKind.NumericLiteral).getLiteralValue();
    case SyntaxKind.TrueKeyword:
      return true;
    case SyntaxKind.FalseKeyword:
      return false;
    case SyntaxKind.NullKeyword:
      return null;
    case SyntaxKind.PrefixUnaryExpression: {
      const unary = node.asKindOrThrow(SyntaxKind.PrefixUnaryExpression);
      if (unary.getOperatorToken() === SyntaxKind.MinusToken) {
        const operand = evaluateLiteral(unary.getOperand());
        if (typeof operand === 'number') return -operand;
      }
      throw new Error(`readDefaultProps: unsupported expression "${node.getText()}".`);
    }
    case SyntaxKind.ParenthesizedExpression:
      return evaluateLiteral(node.asKindOrThrow(SyntaxKind.ParenthesizedExpression).getExpression());
    case SyntaxKind.AsExpression:
      // `X as const` / `X as SomeType` are type-only at runtime; the value is the inner
      // expression. Unwrapping and evaluating that is safe — still no code execution.
      return evaluateLiteral(node.asKindOrThrow(SyntaxKind.AsExpression).getExpression());
    case SyntaxKind.SatisfiesExpression:
      // `X satisfies T` is likewise type-only at runtime.
      return evaluateLiteral(node.asKindOrThrow(SyntaxKind.SatisfiesExpression).getExpression());
    default:
      throw new Error(`readDefaultProps: unsupported expression "${node.getText()}".`);
  }
}

function compositionElements(sf: ReturnType<Project['createSourceFile']>): CompositionEl[] {
  return [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ].filter((el) => el.getTagNameNode().getText() === 'Composition');
}

function idOf(el: CompositionEl): string | undefined {
  const attr = el.getAttributes().find(
    (a): a is JsxAttribute =>
      a.getKind() === SyntaxKind.JsxAttribute &&
      (a as JsxAttribute).getNameNode().getText() === 'id',
  );
  const init = attr?.getInitializer();
  if (!init) return undefined;
  if (init.getKind() === SyntaxKind.StringLiteral) {
    return init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
  }
  const expr = init.asKind(SyntaxKind.JsxExpression)?.getExpression();
  return expr?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
}

function findDefaultPropsAttr(source: string, compositionId?: string): JsxAttribute {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile('Root.tsx', source, { overwrite: true });
  let comps = compositionElements(sf);
  if (comps.length === 0) {
    throw new Error('rewriteDefaultProps: no <Composition> element found in source.');
  }
  if (compositionId) {
    comps = comps.filter((el) => idOf(el) === compositionId);
    if (comps.length === 0) {
      throw new Error(`rewriteDefaultProps: no <Composition> with id="${compositionId}".`);
    }
  } else if (comps.length > 1) {
    throw new Error(
      'rewriteDefaultProps: multiple <Composition> elements; pass opts.compositionId to disambiguate.',
    );
  }
  const attr = comps[0].getAttributes().find(
    (a): a is JsxAttribute =>
      a.getKind() === SyntaxKind.JsxAttribute &&
      (a as JsxAttribute).getNameNode().getText() === 'defaultProps',
  );
  if (!attr) {
    throw new Error('rewriteDefaultProps: <Composition> has no defaultProps attribute.');
  }
  return attr;
}

export function rewriteDefaultProps(
  source: string,
  props: unknown,
  opts: { compositionId?: string } = {},
): string {
  const attr = findDefaultPropsAttr(source, opts.compositionId);
  const json = JSON.stringify(props, null, 2);
  attr.setInitializer(`{${json}}`);
  return attr.getSourceFile().getFullText();
}

export function readDefaultProps(
  source: string,
  opts: { compositionId?: string } = {},
): unknown {
  const attr = findDefaultPropsAttr(source, opts.compositionId);
  const expr = attr
    .getInitializer()
    ?.asKind(SyntaxKind.JsxExpression)
    ?.getExpression();
  if (!expr) {
    throw new Error('readDefaultProps: defaultProps initializer is not a JSX expression.');
  }
  // The literal may be either JSON produced by rewriteDefaultProps (double-quoted keys) or a
  // hand-written JS object literal (unquoted keys, single-quoted strings) for compositions that
  // haven't been rewritten yet — plain JSON.parse only handles the former. Walk the already-
  // parsed AST instead of JSON.parse'ing or eval'ing the source text.
  return evaluateLiteral(expr);
}

type PathSegment = string | number;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return a === b;
}

/**
 * Walks `oldVal`/`newVal` in parallel and collects the paths (object keys / array indices) of
 * every leaf that actually changed. A "leaf" here is either a genuine scalar difference, or a
 * whole object/array whose *shape* changed (a key was added/removed, or an array's length
 * changed) — those are intentionally NOT recursed into further, because there is no source AST
 * node to surgically edit for "a property that doesn't exist yet" or "the 3rd element of an
 * array that now has 2 elements". Callers replace the whole node at that path instead. This is
 * the "array length change ⇒ whole-array replace" limitation called out on
 * `updateDefaultPropsSurgically`, generalized to object shape changes too (segments/overlays
 * cannot yet be added or removed from the editor, so this path isn't expected to be exercised by
 * app-level Saves — it only guards against blowing up if it ever is).
 */
function diffLeafPaths(
  oldVal: unknown,
  newVal: unknown,
  path: PathSegment[],
  out: PathSegment[][],
): void {
  if (deepEqual(oldVal, newVal)) return;

  if (isPlainObject(oldVal) && isPlainObject(newVal)) {
    const keysA = Object.keys(oldVal);
    const keysB = Object.keys(newVal);
    const sameShape =
      keysA.length === keysB.length &&
      keysA.every((k) => Object.prototype.hasOwnProperty.call(newVal, k));
    if (!sameShape) {
      out.push(path.slice());
      return;
    }
    for (const k of keysA) {
      diffLeafPaths(oldVal[k], newVal[k], [...path, k], out);
    }
    return;
  }

  if (Array.isArray(oldVal) && Array.isArray(newVal) && oldVal.length === newVal.length) {
    for (let i = 0; i < oldVal.length; i++) {
      diffLeafPaths(oldVal[i], newVal[i], [...path, i], out);
    }
    return;
  }

  // Scalar difference, type change, or array length change: replace the whole node at this path.
  out.push(path.slice());
}

function getAtPath(root: unknown, path: PathSegment[]): unknown {
  let cur = root;
  for (const seg of path) {
    cur = (cur as Record<PathSegment, unknown>)[seg];
  }
  return cur;
}

/** Unwraps `as const` / `satisfies T` / parenthesized wrappers to reach the underlying value node. */
function unwrapValue(node: Node): Node {
  let n = node;
  for (;;) {
    if (n.getKind() === SyntaxKind.AsExpression) {
      n = n.asKindOrThrow(SyntaxKind.AsExpression).getExpression();
    } else if (n.getKind() === SyntaxKind.SatisfiesExpression) {
      n = n.asKindOrThrow(SyntaxKind.SatisfiesExpression).getExpression();
    } else if (n.getKind() === SyntaxKind.ParenthesizedExpression) {
      n = n.asKindOrThrow(SyntaxKind.ParenthesizedExpression).getExpression();
    } else {
      break;
    }
  }
  return n;
}

function getObjectProperty(objLit: ObjectLiteralExpression, key: string): PropertyAssignment {
  const prop = objLit.getProperties().find((p): p is PropertyAssignment => {
    if (!p.isKind(SyntaxKind.PropertyAssignment)) return false;
    const nameNode = p.getNameNode();
    if (nameNode.isKind(SyntaxKind.StringLiteral)) return nameNode.getLiteralValue() === key;
    if (nameNode.isKind(SyntaxKind.Identifier)) return nameNode.getText() === key;
    return false;
  });
  if (!prop) {
    throw new Error(`updateDefaultPropsSurgically: property "${key}" not found in source AST.`);
  }
  return prop;
}

/** Applies a single changed-leaf path by navigating the AST from `topValueNode` and rewriting
 * only the final node's text — every sibling and every ancestor's comments/`as const` are left
 * byte-untouched. */
function applyLeafChange(topValueNode: Node, path: PathSegment[], newLeafValue: unknown): void {
  let containerNode: Node = topValueNode;
  let valueNode: Node | undefined;

  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    const isLast = i === path.length - 1;
    const container = unwrapValue(containerNode);

    if (typeof seg === 'string') {
      if (container.getKind() !== SyntaxKind.ObjectLiteralExpression) {
        throw new Error(
          `updateDefaultPropsSurgically: expected an object literal at path segment "${seg}".`,
        );
      }
      const prop = getObjectProperty(
        container.asKindOrThrow(SyntaxKind.ObjectLiteralExpression),
        seg,
      );
      valueNode = prop.getInitializerOrThrow();
    } else {
      if (container.getKind() !== SyntaxKind.ArrayLiteralExpression) {
        throw new Error(
          `updateDefaultPropsSurgically: expected an array literal at path index ${seg}.`,
        );
      }
      const elements = (container as ArrayLiteralExpression).getElements();
      if (seg < 0 || seg >= elements.length) {
        throw new Error(`updateDefaultPropsSurgically: array index ${seg} out of bounds.`);
      }
      valueNode = elements[seg];
    }

    if (isLast) {
      const wasAsConst =
        valueNode.getKind() === SyntaxKind.AsExpression &&
        valueNode.asKindOrThrow(SyntaxKind.AsExpression).getTypeNodeOrThrow().getText() === 'const';
      const serialized = JSON.stringify(newLeafValue, null, 2);
      valueNode.replaceWithText(wasAsConst ? `${serialized} as const` : serialized);
    } else {
      containerNode = valueNode;
    }
  }
}

/**
 * Diff-based, surgical alternative to `rewriteDefaultProps`. Locates the `<Composition>`'s
 * `defaultProps={{…}}` literal, reads the CURRENT props out of it (via `evaluateLiteral`, so
 * `as const`/`satisfies` wrappers are already understood), deep-diffs against `newProps`, and
 * rewrites ONLY the AST nodes for leaves that actually changed. Every unchanged property,
 * comment, and `as const`/`satisfies` assertion is left byte-for-byte untouched — this is what
 * lets the reel editor's Save preserve a human author's structure instead of regenerating the
 * whole literal via `JSON.stringify` (which strips both comments and type assertions).
 *
 * Limitation: this cannot add or remove object keys or array elements surgically (the editor
 * does not yet support adding/removing segments or overlays). When a diffed object's key set or
 * an array's length differs between current and new props, the whole node at that path is
 * replaced with a freshly serialized literal instead — comments/`as const` *inside* that
 * particular node are lost, but everything outside it is unaffected.
 */
export function updateDefaultPropsSurgically(
  source: string,
  newProps: unknown,
  opts: { compositionId?: string } = {},
): string {
  const attr = findDefaultPropsAttr(source, opts.compositionId);
  const jsxExpr = attr.getInitializer()?.asKind(SyntaxKind.JsxExpression)?.getExpression();
  if (!jsxExpr) {
    throw new Error(
      'updateDefaultPropsSurgically: defaultProps initializer is not a JSX expression.',
    );
  }

  const currentProps = evaluateLiteral(jsxExpr);
  const changedPaths: PathSegment[][] = [];
  diffLeafPaths(currentProps, newProps, [], changedPaths);

  if (changedPaths.length === 0) {
    return source;
  }

  for (const path of changedPaths) {
    if (path.length === 0) {
      // The top-level props object itself changed shape (e.g. a top-level key was added or
      // removed) — nothing surgical to do at the root, replace the whole literal.
      const serialized = JSON.stringify(newProps, null, 2);
      jsxExpr.replaceWithText(serialized);
      continue;
    }
    applyLeafChange(jsxExpr, path, getAtPath(newProps, path));
  }

  return attr.getSourceFile().getFullText();
}
