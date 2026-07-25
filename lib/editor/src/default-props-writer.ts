import { Project, SyntaxKind } from 'ts-morph';
import type { JsxAttribute, JsxOpeningElement, JsxSelfClosingElement, Node } from 'ts-morph';

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
      const result: Record<string, unknown> = {};
      for (const prop of obj.getProperties()) {
        if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
          throw new Error(
            `readDefaultProps: unsupported object member "${prop.getText()}" (only plain "key: value" properties are supported).`,
          );
        }
        const nameNode = prop.getNameNode();
        const key = nameNode.isKind(SyntaxKind.StringLiteral)
          ? nameNode.getLiteralValue()
          : nameNode.getText();
        result[key] = evaluateLiteral(prop.getInitializerOrThrow());
      }
      return result;
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
