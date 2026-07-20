# Lottie Motion Graphics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class Lottie motion-graphic support to the toolkit core — a `lottie` skill, a reusable `LottieAnimation` component, a curated 7-template library, a `video_toolkit.lottie` Python tool, and a `/toolkit:add-lottie-graphic` command that produces a brand-colored Lottie and drops it on a project's timeline.

**Architecture:** Core ships the *machinery*. A Python tool patches colors/values into curated Lottie JSON at declared paths (`build`), recolors sourced files (`colorize`), and inspects any file (`info`/`list`). A React wrapper renders the JSON frame-synced via `@remotion/lottie` (imported as an ambient peer — no new core dependency). The command orchestrates source-or-build → materialize to `public/lottie/` → register as a custom overlay, with a snippet fallback when the project exposes no overlay convention.

**Tech Stack:** Python 3 (stdlib only — argparse/json/pathlib) + pytest for the tool; React/TypeScript + `@remotion/lottie` + `remotion` for the component; Markdown for skill/command; JSON for registry/catalog/templates.

## Global Constraints

- **No new core dependency.** `LottieAnimation.tsx` imports `@remotion/lottie` and `remotion` as **ambient peers**, exactly like existing `lib/components/*.tsx` import `remotion`. Core has no root `package.json` deps; `lib/` is typechecked/rendered only in the consuming brand-repo template. Do NOT add a `package.json` or install packages in core.
- **Python tools:** stdlib only (no external pip deps for `lottie.py`); invoked from toolkit root as `python3 -m video_toolkit.lottie <sub>`; every subcommand supports `--help`; every subcommand supports `--json` for machine output where it prints data.
- **Lottie colors** are normalized `[r, g, b, a]` floats in `0..1`. **Brand colors** are hex strings under `brand.json → "colors"` (e.g. `"primary": "#ea580c"`).
- **`colorSlots` shape (canonical):** `{ "<slot>": [ <path>, ... ] }` where each `<path>` is a list of keys/indices navigating to a color's `k` array. A slot maps to a **list** of paths (usually one) so a single recolor can drive multiple shapes.
- **Frame rate:** all templates author at `fr: 30`.
- **Skill defers framework basics** to `skills/remotion-official/remotion-markup/lottie.md` (install + `<Lottie>` API), exactly as `skills/remotion/SKILL.md` defers to `remotion-official`.
- **Naming:** skill `lottie`; command `add-lottie-graphic` (`/toolkit:add-lottie-graphic`). Both `status: "beta"` in the registry.
- **Commits:** never add `Co-Authored-By` (repo/user rule).
- Curated templates live in `lib/lottie/templates/*.json`; catalog in `lib/lottie/catalog.json`.

---

### Task 1: Lottie tool foundation — color/nav utilities + `info`

**Files:**
- Create: `video_toolkit/lottie.py`
- Create: `video_toolkit/tests/test_lottie.py`
- Create: `video_toolkit/tests/fixtures/sample_lottie.json`

**Interfaces:**
- Produces: `hex_to_rgba(hex: str) -> list[float]`, `rgba_to_hex(rgba: list[float]) -> str`, `nav(obj, path: list) -> Any`, `nav_set(obj, path: list, value) -> None`, `iter_color_nodes(node) -> Iterator[dict]` (yields fill/stroke color dicts whose `["k"]` is the color array), `distinct_colors(data) -> list[str]`, `is_valid_lottie(data) -> bool`, `main(argv: list[str] | None = None) -> int`.

- [ ] **Step 1: Create the test fixture**

Create `video_toolkit/tests/fixtures/sample_lottie.json`:

```json
{
  "v": "5.7.4", "fr": 30, "ip": 0, "op": 60, "w": 100, "h": 100, "nm": "sample", "ddd": 0, "assets": [],
  "layers": [
    {
      "ddd": 0, "ind": 1, "ty": 4, "nm": "box", "sr": 1,
      "ks": { "o": {"a":0,"k":100}, "r": {"a":0,"k":0}, "p": {"a":0,"k":[50,50,0]}, "a": {"a":0,"k":[0,0,0]}, "s": {"a":0,"k":[100,100,100]} },
      "ao": 0,
      "shapes": [
        { "ty":"gr", "it": [
          { "ty":"rc", "p":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[60,60]}, "r":{"a":0,"k":0} },
          { "ty":"fl", "c":{"a":0,"k":[1,0,0,1]}, "o":{"a":0,"k":100} },
          { "ty":"tr", "p":{"a":0,"k":[0,0]}, "a":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[100,100]}, "r":{"a":0,"k":0}, "o":{"a":0,"k":100} }
        ] }
      ],
      "ip": 0, "op": 60, "st": 0
    }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

Create `video_toolkit/tests/test_lottie.py`:

```python
import json
from pathlib import Path

import pytest

from video_toolkit.lottie import (
    hex_to_rgba, rgba_to_hex, nav, nav_set,
    distinct_colors, is_valid_lottie, main,
)

FIXTURES = Path(__file__).parent / "fixtures"


def test_hex_rgba_roundtrip():
    assert rgba_to_hex(hex_to_rgba("#ea580c")) == "#ea580c"
    assert hex_to_rgba("#000000") == [0.0, 0.0, 0.0, 1.0]
    assert hex_to_rgba("#fff") == [1.0, 1.0, 1.0, 1.0]  # shorthand expands


def test_hex_invalid_raises():
    with pytest.raises(ValueError):
        hex_to_rgba("#12")


def test_nav_and_nav_set():
    obj = {"a": [{"b": [0, 0, 0, 1]}]}
    assert nav(obj, ["a", 0, "b"]) == [0, 0, 0, 1]
    nav_set(obj, ["a", 0, "b", 0], 0.5)
    assert obj["a"][0]["b"][0] == 0.5


def test_distinct_colors_reads_fills():
    data = json.loads((FIXTURES / "sample_lottie.json").read_text())
    assert distinct_colors(data) == ["#ff0000"]


def test_is_valid_lottie():
    data = json.loads((FIXTURES / "sample_lottie.json").read_text())
    assert is_valid_lottie(data) is True
    assert is_valid_lottie({"nope": 1}) is False


def test_info_json_output(capsys):
    rc = main(["info", str(FIXTURES / "sample_lottie.json"), "--json", "--colors"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["width"] == 100 and out["height"] == 100 and out["fps"] == 30
    assert out["duration_seconds"] == 2.0
    assert out["layers"] == 1
    assert out["valid"] is True
    assert out["colors"] == ["#ff0000"]
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd /path/to/toolkit && python3 -m pytest video_toolkit/tests/test_lottie.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'video_toolkit.lottie'`

- [ ] **Step 4: Implement `video_toolkit/lottie.py`**

```python
#!/usr/bin/env python3
"""
Lottie motion-graphic tooling: inspect, build (from curated templates), and recolor Lottie JSON.

Usage:
    python3 -m video_toolkit.lottie list
    python3 -m video_toolkit.lottie info animation.json --colors
    python3 -m video_toolkit.lottie build spinner --brand brands/default/brand.json -o public/lottie/spinner.json
    python3 -m video_toolkit.lottie build progress --set value=60 --color accent=#ea580c -o out.json
    python3 -m video_toolkit.lottie colorize sourced.json --map "#ff0000=#ea580c" -o branded.json
"""

import argparse
import copy
import json
import sys
from pathlib import Path

CATALOG_DIR = Path(__file__).resolve().parent.parent / "lib" / "lottie"

# brand.json "colors" keys tried (in order) for each named color slot.
BRAND_SLOT_MAP = {
    "accent": ["primary"],
    "accentLight": ["primaryLight", "primary"],
    "fg": ["textDark"],
    "bg": ["bgLight"],
    "track": ["divider", "bgLight"],
}

REQUIRED_LOTTIE_KEYS = ("v", "fr", "ip", "op", "w", "h", "layers")


# --- color helpers ---------------------------------------------------------

def hex_to_rgba(hex_str: str) -> list:
    h = hex_str.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        raise ValueError(f"Invalid hex color: {hex_str!r}")
    try:
        r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    except ValueError as exc:
        raise ValueError(f"Invalid hex color: {hex_str!r}") from exc
    return [round(r, 6), round(g, 6), round(b, 6), 1.0]


def rgba_to_hex(rgba: list) -> str:
    r, g, b = (max(0, min(255, round(float(c) * 255))) for c in rgba[:3])
    return f"#{r:02x}{g:02x}{b:02x}"


# --- tree navigation -------------------------------------------------------

def nav(obj, path: list):
    cur = obj
    for key in path:
        cur = cur[key]
    return cur


def nav_set(obj, path: list, value) -> None:
    cur = obj
    for key in path[:-1]:
        cur = cur[key]
    cur[path[-1]] = value


def iter_color_nodes(node):
    """Yield fill/stroke color dicts (those with a numeric ['k'] color array)."""
    if isinstance(node, dict):
        if node.get("ty") in ("fl", "st") and isinstance(node.get("c"), dict):
            k = node["c"].get("k")
            if isinstance(k, list) and len(k) >= 3 and all(isinstance(x, (int, float)) for x in k[:3]):
                yield node["c"]
        for value in node.values():
            yield from iter_color_nodes(value)
    elif isinstance(node, list):
        for item in node:
            yield from iter_color_nodes(item)


def distinct_colors(data) -> list:
    seen = []
    for cdict in iter_color_nodes(data):
        hx = rgba_to_hex(cdict["k"])
        if hx not in seen:
            seen.append(hx)
    return seen


def is_valid_lottie(data) -> bool:
    return (
        isinstance(data, dict)
        and all(k in data for k in REQUIRED_LOTTIE_KEYS)
        and isinstance(data.get("layers"), list)
    )


# --- catalog ---------------------------------------------------------------

def load_catalog() -> dict:
    return json.loads((CATALOG_DIR / "catalog.json").read_text())


def load_template(template_id: str):
    cat = load_catalog()["templates"]
    if template_id not in cat:
        raise SystemExit(
            f"Unknown template {template_id!r}. Run: python3 -m video_toolkit.lottie list"
        )
    meta = cat[template_id]
    data = json.loads((CATALOG_DIR / "templates" / meta["file"]).read_text())
    return meta, data


# --- subcommands -----------------------------------------------------------

def cmd_info(args) -> int:
    data = json.loads(Path(args.file).read_text())
    fr = data.get("fr", 0) or 0
    ip = data.get("ip", 0) or 0
    op = data.get("op", 0) or 0
    info = {
        "width": data.get("w"),
        "height": data.get("h"),
        "fps": fr,
        "in_frame": ip,
        "out_frame": op,
        "duration_seconds": round((op - ip) / fr, 3) if fr else 0,
        "layers": len(data.get("layers", [])),
        "valid": is_valid_lottie(data),
    }
    if args.colors:
        info["colors"] = distinct_colors(data)
    if args.json:
        print(json.dumps(info, indent=2))
    else:
        for key, value in info.items():
            print(f"{key}: {value}")
    return 0


def cmd_list(args) -> int:
    cat = load_catalog()["templates"]
    if args.json:
        print(json.dumps(cat, indent=2))
    else:
        for tid, meta in cat.items():
            slots = ", ".join(meta.get("colorSlots", {}).keys()) or "-"
            values = ", ".join(meta.get("valueSlots", {}).keys())
            extra = f"  [colors: {slots}]" + (f"  [values: {values}]" if values else "")
            print(f"{tid:12} {meta['description']}{extra}")
    return 0


def cmd_build(args) -> int:
    meta, data = load_template(args.template)
    data = copy.deepcopy(data)
    color_slots = meta.get("colorSlots", {})
    value_slots = meta.get("valueSlots", {})

    resolved = {}  # slot -> hex ; brand first (low priority), explicit --color overrides
    if args.brand:
        brand_colors = json.loads(Path(args.brand).read_text()).get("colors", {})
        for slot in color_slots:
            for candidate in BRAND_SLOT_MAP.get(slot, []):
                if candidate in brand_colors:
                    resolved[slot] = brand_colors[candidate]
                    break
    for pair in args.color or []:
        slot, _, hexval = pair.partition("=")
        if slot not in color_slots:
            raise SystemExit(
                f"Template {args.template!r} has no color slot {slot!r}. "
                f"Slots: {list(color_slots)}"
            )
        resolved[slot] = hexval

    for slot, hexval in resolved.items():
        rgba = hex_to_rgba(hexval)
        for path in color_slots[slot]:
            existing = nav(data, path)
            alpha = existing[3] if isinstance(existing, list) and len(existing) > 3 else 1.0
            nav_set(data, path, rgba[:3] + [alpha])

    for pair in args.set or []:
        name, _, value = pair.partition("=")
        if name not in value_slots:
            raise SystemExit(
                f"Template {args.template!r} has no value slot {name!r}. "
                f"Values: {list(value_slots)}"
            )
        nav_set(data, value_slots[name], float(value))

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data))
    print(f"Wrote {out}")
    return 0


def cmd_colorize(args) -> int:
    data = json.loads(Path(args.file).read_text())
    mapping = {}
    for pair in args.map or []:
        old, _, new = pair.partition("=")
        mapping[old.strip().lower()] = new.strip()
    if not mapping:
        raise SystemExit("colorize needs at least one --map OLD=NEW (run 'info --colors' to list colors)")
    changed = 0
    for cdict in iter_color_nodes(data):
        hx = rgba_to_hex(cdict["k"]).lower()
        if hx in mapping:
            alpha = cdict["k"][3] if len(cdict["k"]) > 3 else 1.0
            cdict["k"] = hex_to_rgba(mapping[hx])[:3] + [alpha]
            changed += 1
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data))
    print(f"Recolored {changed} color(s) -> {out}")
    return 0


# --- CLI -------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python3 -m video_toolkit.lottie",
        description="Inspect, build, and recolor Lottie motion-graphic JSON.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="List curated Lottie templates")
    p_list.add_argument("--json", action="store_true", help="Emit catalog as JSON")
    p_list.set_defaults(func=cmd_list)

    p_info = sub.add_parser("info", help="Show metadata and validate a Lottie file")
    p_info.add_argument("file")
    p_info.add_argument("--colors", action="store_true", help="List distinct fill/stroke colors")
    p_info.add_argument("--json", action="store_true", help="Emit info as JSON")
    p_info.set_defaults(func=cmd_info)

    p_build = sub.add_parser("build", help="Build a brand-colored Lottie from a curated template")
    p_build.add_argument("template")
    p_build.add_argument("--color", action="append", metavar="SLOT=HEX", help="Set a color slot (repeatable)")
    p_build.add_argument("--brand", metavar="brand.json", help="Auto-map brand colors onto slots")
    p_build.add_argument("--set", action="append", metavar="NAME=NUMBER", help="Set a value slot (repeatable)")
    p_build.add_argument("-o", "--output", required=True, help="Output .json path")
    p_build.set_defaults(func=cmd_build)

    p_color = sub.add_parser("colorize", help="Recolor a sourced Lottie file by explicit color map")
    p_color.add_argument("file")
    p_color.add_argument("--map", action="append", metavar="OLD=NEW", help="Replace hex OLD with hex NEW (repeatable)")
    p_color.add_argument("-o", "--output", required=True, help="Output .json path")
    p_color.set_defaults(func=cmd_colorize)

    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args) or 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `python3 -m pytest video_toolkit/tests/test_lottie.py -v`
Expected: PASS (7 tests: roundtrip, invalid, nav, distinct colors, valid, info json). Note the `build`/`colorize`/`list` tests come in later tasks.

- [ ] **Step 6: Verify `--help` works**

Run: `python3 -m video_toolkit.lottie --help && python3 -m video_toolkit.lottie info --help`
Expected: usage text listing subcommands and the `info` flags.

- [ ] **Step 7: Commit**

```bash
git add video_toolkit/lottie.py video_toolkit/tests/test_lottie.py video_toolkit/tests/fixtures/sample_lottie.json
git commit -m "feat(lottie): tool foundation — color/nav utils + info subcommand"
```

---

### Task 2: Catalog + spinner template + `list` + validation gate

**Files:**
- Create: `lib/lottie/catalog.json`
- Create: `lib/lottie/templates/spinner.json`
- Modify: `video_toolkit/tests/test_lottie.py` (append tests)

**Interfaces:**
- Consumes: `load_catalog()`, `nav()`, `is_valid_lottie()`, `CATALOG_DIR`, `main()` from Task 1.
- Produces: `lib/lottie/catalog.json` with a `templates` map; the invariant that every catalog template file exists, is valid Lottie, and every `colorSlots` path resolves to a color array. Later tasks add templates under this same gate.

- [ ] **Step 1: Create the spinner template**

Create `lib/lottie/templates/spinner.json`:

```json
{
  "v": "5.7.4", "fr": 30, "ip": 0, "op": 30, "w": 200, "h": 200, "nm": "spinner", "ddd": 0, "assets": [],
  "layers": [
    {
      "ddd": 0, "ind": 1, "ty": 4, "nm": "ring", "sr": 1,
      "ks": {
        "o": {"a":0,"k":100},
        "r": {"a":1,"k":[
          {"t":0,"s":[0],"i":{"x":[1],"y":[1]},"o":{"x":[0],"y":[0]}},
          {"t":30,"s":[360]}
        ]},
        "p": {"a":0,"k":[100,100,0]}, "a": {"a":0,"k":[0,0,0]}, "s": {"a":0,"k":[100,100,100]}
      },
      "ao": 0,
      "shapes": [
        { "ty":"gr", "it": [
          { "ty":"el", "p":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[130,130]} },
          { "ty":"st", "c":{"a":0,"k":[0.917,0.345,0.047,1]}, "o":{"a":0,"k":100}, "w":{"a":0,"k":18}, "lc":2, "lj":1, "ml":4,
            "d":[ {"n":"d","nm":"dash","v":{"a":0,"k":210}}, {"n":"g","nm":"gap","v":{"a":0,"k":120}} ] },
          { "ty":"tr", "p":{"a":0,"k":[0,0]}, "a":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[100,100]}, "r":{"a":0,"k":0}, "o":{"a":0,"k":100} }
        ] }
      ],
      "ip": 0, "op": 30, "st": 0
    }
  ]
}
```

- [ ] **Step 2: Create the catalog with the spinner entry**

Create `lib/lottie/catalog.json`:

```json
{
  "templates": {
    "spinner": {
      "description": "Looping circular loader ring",
      "file": "spinner.json",
      "colorSlots": { "accent": [ ["layers", 0, "shapes", 0, "it", 1, "c", "k"] ] },
      "valueSlots": {}
    }
  }
}
```

- [ ] **Step 3: Append the failing tests**

Append to `video_toolkit/tests/test_lottie.py`:

```python
from video_toolkit.lottie import load_catalog, CATALOG_DIR


def test_list_includes_spinner(capsys):
    rc = main(["list"])
    assert rc == 0
    assert "spinner" in capsys.readouterr().out


def test_all_catalog_templates_valid():
    cat = load_catalog()["templates"]
    assert cat, "catalog must declare templates"
    for tid, meta in cat.items():
        path = CATALOG_DIR / "templates" / meta["file"]
        assert path.exists(), f"{tid}: missing template file {meta['file']}"
        data = json.loads(path.read_text())
        assert is_valid_lottie(data), f"{tid}: not structurally valid Lottie"
        for slot, paths in meta.get("colorSlots", {}).items():
            assert isinstance(paths, list) and paths, f"{tid}.{slot}: colorSlots must be a non-empty list of paths"
            for p in paths:
                ref = nav(data, p)
                assert isinstance(ref, list) and len(ref) >= 3, f"{tid}.{slot}: path {p} is not a color array"
        for name, p in meta.get("valueSlots", {}).items():
            nav(data, p)  # must resolve without KeyError/IndexError
```

Add `from video_toolkit.lottie import is_valid_lottie, nav` to the imports if not already present (Task 1 imported them).

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest video_toolkit/tests/test_lottie.py -v`
Expected: PASS including `test_list_includes_spinner`, `test_all_catalog_templates_valid`.

- [ ] **Step 5: Sanity-check `info` on the real template**

Run: `python3 -m video_toolkit.lottie info lib/lottie/templates/spinner.json --colors`
Expected: `valid: True`, `fps: 30`, and `colors` includes `#ea580c`.

- [ ] **Step 6: Commit**

```bash
git add lib/lottie/catalog.json lib/lottie/templates/spinner.json video_toolkit/tests/test_lottie.py
git commit -m "feat(lottie): catalog + spinner template + list command + validation gate"
```

---

### Task 3: `build` subcommand

**Files:**
- Modify: `video_toolkit/tests/test_lottie.py` (append tests)

(The `cmd_build` implementation already landed in Task 1's `lottie.py`; this task proves it against the real spinner template and locks its behavior with tests.)

**Interfaces:**
- Consumes: `main()`, `load_catalog()`, `nav()`, `rgba_to_hex()`, `CATALOG_DIR`.
- Produces: verified `build` behavior — brand mapping, explicit `--color` override, unknown-template and unknown-slot errors.

- [ ] **Step 1: Append the failing tests**

Append to `video_toolkit/tests/test_lottie.py`:

```python
def _accent_hex(out_path):
    data = json.loads(Path(out_path).read_text())
    slot_paths = load_catalog()["templates"]["spinner"]["colorSlots"]["accent"]
    return rgba_to_hex(nav(data, slot_paths[0]))


def test_build_explicit_color(tmp_path):
    out = tmp_path / "spinner.json"
    assert main(["build", "spinner", "--color", "accent=#123456", "-o", str(out)]) == 0
    assert _accent_hex(out) == "#123456"
    assert is_valid_lottie(json.loads(out.read_text()))


def test_build_brand_maps_primary(tmp_path):
    brand = tmp_path / "brand.json"
    brand.write_text(json.dumps({"colors": {"primary": "#00ff00"}}))
    out = tmp_path / "spinner.json"
    assert main(["build", "spinner", "--brand", str(brand), "-o", str(out)]) == 0
    assert _accent_hex(out) == "#00ff00"


def test_build_explicit_overrides_brand(tmp_path):
    brand = tmp_path / "brand.json"
    brand.write_text(json.dumps({"colors": {"primary": "#00ff00"}}))
    out = tmp_path / "spinner.json"
    main(["build", "spinner", "--brand", str(brand), "--color", "accent=#0000ff", "-o", str(out)])
    assert _accent_hex(out) == "#0000ff"


def test_build_unknown_template_errors(tmp_path):
    with pytest.raises(SystemExit):
        main(["build", "nope", "-o", str(tmp_path / "x.json")])


def test_build_unknown_slot_errors(tmp_path):
    with pytest.raises(SystemExit):
        main(["build", "spinner", "--color", "ghost=#000000", "-o", str(tmp_path / "x.json")])
```

- [ ] **Step 2: Run to verify pass**

Run: `python3 -m pytest video_toolkit/tests/test_lottie.py -k build -v`
Expected: PASS (5 build tests).

- [ ] **Step 3: End-to-end sanity with the default brand**

Run: `python3 -m video_toolkit.lottie build spinner --brand brands/default/brand.json -o /tmp/spinner-brand.json && python3 -m video_toolkit.lottie info /tmp/spinner-brand.json --colors`
Expected: `valid: True`; `colors` includes `#ea580c` (default brand primary).

- [ ] **Step 4: Commit**

```bash
git add video_toolkit/tests/test_lottie.py
git commit -m "test(lottie): lock build behavior — brand mapping, override, error paths"
```

---

### Task 4: `colorize` subcommand

**Files:**
- Modify: `video_toolkit/tests/test_lottie.py` (append tests)

(The `cmd_colorize` implementation landed in Task 1; this task proves it.)

**Interfaces:**
- Consumes: `main()`, `distinct_colors()`, the `sample_lottie.json` fixture (a red `#ff0000` fill).
- Produces: verified `colorize` — maps a hex to a new hex, preserves alpha, requires at least one `--map`.

- [ ] **Step 1: Append the failing tests**

Append to `video_toolkit/tests/test_lottie.py`:

```python
def test_colorize_maps_color(tmp_path):
    out = tmp_path / "out.json"
    assert main(["colorize", str(FIXTURES / "sample_lottie.json"),
                 "--map", "#ff0000=#00ff00", "-o", str(out)]) == 0
    assert distinct_colors(json.loads(out.read_text())) == ["#00ff00"]


def test_colorize_requires_map(tmp_path):
    with pytest.raises(SystemExit):
        main(["colorize", str(FIXTURES / "sample_lottie.json"), "-o", str(tmp_path / "x.json")])
```

- [ ] **Step 2: Run to verify pass**

Run: `python3 -m pytest video_toolkit/tests/test_lottie.py -k colorize -v`
Expected: PASS (2 tests).

- [ ] **Step 3: Run the full tool test suite**

Run: `python3 -m pytest video_toolkit/tests/test_lottie.py -v`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add video_toolkit/tests/test_lottie.py
git commit -m "test(lottie): lock colorize behavior — explicit hex map + require --map"
```

---

### Task 5: Remaining 6 curated templates

**Files:**
- Create: `lib/lottie/templates/{pulse,arrow,confetti,check,cross,progress}.json`
- Modify: `lib/lottie/catalog.json` (add 6 entries)
- Modify: `video_toolkit/tests/test_lottie.py` (append a per-template build smoke test)

**Interfaces:**
- Consumes: the Task 2 validation gate (`test_all_catalog_templates_valid`) — it now iterates all 7 templates.
- Produces: the full 7-template curated library. `progress` exposes a `value` value-slot (0–100).

Each template authors at `fr:30`, `w/h:200` (except `progress` `w:340,h:60`), and follows the shape conventions the tool patches. **After the automated gate passes, each template still needs a one-time visual check in a real project (Studio) — noted in Step 5; core has no Remotion runtime to verify rendering.**

- [ ] **Step 1: Create `lib/lottie/templates/pulse.json`** (scale-up + fade, looping filled dot)

```json
{
  "v": "5.7.4", "fr": 30, "ip": 0, "op": 30, "w": 200, "h": 200, "nm": "pulse", "ddd": 0, "assets": [],
  "layers": [
    {
      "ddd": 0, "ind": 1, "ty": 4, "nm": "pulse", "sr": 1,
      "ks": {
        "o": {"a":1,"k":[ {"t":0,"s":[100],"i":{"x":[0.5],"y":[1]},"o":{"x":[0.5],"y":[0]}}, {"t":30,"s":[0]} ]},
        "r": {"a":0,"k":0}, "p": {"a":0,"k":[100,100,0]}, "a": {"a":0,"k":[0,0,0]},
        "s": {"a":1,"k":[ {"t":0,"s":[20,20,100],"i":{"x":[0.5,0.5,0.5],"y":[1,1,1]},"o":{"x":[0.5,0.5,0.5],"y":[0,0,0]}}, {"t":30,"s":[120,120,100]} ]}
      },
      "ao": 0,
      "shapes": [
        { "ty":"gr", "it": [
          { "ty":"el", "p":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[120,120]} },
          { "ty":"fl", "c":{"a":0,"k":[0.917,0.345,0.047,1]}, "o":{"a":0,"k":100} },
          { "ty":"tr", "p":{"a":0,"k":[0,0]}, "a":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[100,100]}, "r":{"a":0,"k":0}, "o":{"a":0,"k":100} }
        ] }
      ],
      "ip": 0, "op": 30, "st": 0
    }
  ]
}
```

- [ ] **Step 2: Create `lib/lottie/templates/arrow.json`** (filled triangle nudging right, looping)

```json
{
  "v": "5.7.4", "fr": 30, "ip": 0, "op": 45, "w": 200, "h": 200, "nm": "arrow", "ddd": 0, "assets": [],
  "layers": [
    {
      "ddd": 0, "ind": 1, "ty": 4, "nm": "arrow", "sr": 1,
      "ks": {
        "o": {"a":0,"k":100}, "r": {"a":0,"k":0},
        "p": {"a":1,"k":[
          {"t":0,"s":[85,100,0],"i":{"x":0.5,"y":1},"o":{"x":0.5,"y":0},"ti":[0,0,0],"to":[0,0,0]},
          {"t":22,"s":[120,100,0],"i":{"x":0.5,"y":1},"o":{"x":0.5,"y":0},"ti":[0,0,0],"to":[0,0,0]},
          {"t":45,"s":[85,100,0]}
        ]},
        "a": {"a":0,"k":[0,0,0]}, "s": {"a":0,"k":[100,100,100]}
      },
      "ao": 0,
      "shapes": [
        { "ty":"gr", "it": [
          { "ty":"sh", "ks":{"a":0,"k":{"c":true,"v":[[-30,-40],[40,0],[-30,40]],"i":[[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0]]}}},
          { "ty":"fl", "c":{"a":0,"k":[0.917,0.345,0.047,1]}, "o":{"a":0,"k":100} },
          { "ty":"tr", "p":{"a":0,"k":[0,0]}, "a":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[100,100]}, "r":{"a":0,"k":0}, "o":{"a":0,"k":100} }
        ] }
      ],
      "ip": 0, "op": 45, "st": 0
    }
  ]
}
```

- [ ] **Step 3: Create `lib/lottie/templates/confetti.json`** (4 squares drifting down, staggered fade)

```json
{
  "v": "5.7.4", "fr": 30, "ip": 0, "op": 45, "w": 200, "h": 200, "nm": "confetti", "ddd": 0, "assets": [],
  "layers": [
    { "ddd":0,"ind":1,"ty":4,"nm":"c1","sr":1,
      "ks":{"o":{"a":1,"k":[{"t":0,"s":[0],"i":{"x":[0.5],"y":[1]},"o":{"x":[0.5],"y":[0]}},{"t":6,"s":[100]},{"t":38,"s":[100]},{"t":45,"s":[0]}]},
            "r":{"a":0,"k":0},
            "p":{"a":1,"k":[{"t":0,"s":[70,60,0],"i":{"x":0.5,"y":1},"o":{"x":0.5,"y":0},"ti":[0,0,0],"to":[0,0,0]},{"t":45,"s":[70,150,0]}]},
            "a":{"a":0,"k":[0,0,0]},"s":{"a":0,"k":[100,100,100]}},
      "ao":0,
      "shapes":[{"ty":"gr","it":[{"ty":"rc","p":{"a":0,"k":[0,0]},"s":{"a":0,"k":[22,22]},"r":{"a":0,"k":3}},{"ty":"fl","c":{"a":0,"k":[0.917,0.345,0.047,1]},"o":{"a":0,"k":100}},{"ty":"tr","p":{"a":0,"k":[0,0]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":20},"o":{"a":0,"k":100}}]}],
      "ip":0,"op":45,"st":0 },
    { "ddd":0,"ind":2,"ty":4,"nm":"c2","sr":1,
      "ks":{"o":{"a":1,"k":[{"t":4,"s":[0],"i":{"x":[0.5],"y":[1]},"o":{"x":[0.5],"y":[0]}},{"t":10,"s":[100]},{"t":40,"s":[100]},{"t":45,"s":[0]}]},
            "r":{"a":0,"k":0},
            "p":{"a":1,"k":[{"t":0,"s":[110,55,0],"i":{"x":0.5,"y":1},"o":{"x":0.5,"y":0},"ti":[0,0,0],"to":[0,0,0]},{"t":45,"s":[120,150,0]}]},
            "a":{"a":0,"k":[0,0,0]},"s":{"a":0,"k":[100,100,100]}},
      "ao":0,
      "shapes":[{"ty":"gr","it":[{"ty":"rc","p":{"a":0,"k":[0,0]},"s":{"a":0,"k":[18,18]},"r":{"a":0,"k":3}},{"ty":"fl","c":{"a":0,"k":[0.984,0.573,0.235,1]},"o":{"a":0,"k":100}},{"ty":"tr","p":{"a":0,"k":[0,0]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":45},"o":{"a":0,"k":100}}]}],
      "ip":0,"op":45,"st":0 },
    { "ddd":0,"ind":3,"ty":4,"nm":"c3","sr":1,
      "ks":{"o":{"a":1,"k":[{"t":2,"s":[0],"i":{"x":[0.5],"y":[1]},"o":{"x":[0.5],"y":[0]}},{"t":8,"s":[100]},{"t":37,"s":[100]},{"t":45,"s":[0]}]},
            "r":{"a":0,"k":0},
            "p":{"a":1,"k":[{"t":0,"s":[95,50,0],"i":{"x":0.5,"y":1},"o":{"x":0.5,"y":0},"ti":[0,0,0],"to":[0,0,0]},{"t":45,"s":[90,150,0]}]},
            "a":{"a":0,"k":[0,0,0]},"s":{"a":0,"k":[100,100,100]}},
      "ao":0,
      "shapes":[{"ty":"gr","it":[{"ty":"rc","p":{"a":0,"k":[0,0]},"s":{"a":0,"k":[20,20]},"r":{"a":0,"k":3}},{"ty":"fl","c":{"a":0,"k":[0.917,0.345,0.047,1]},"o":{"a":0,"k":100}},{"ty":"tr","p":{"a":0,"k":[0,0]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":10},"o":{"a":0,"k":100}}]}],
      "ip":0,"op":45,"st":0 },
    { "ddd":0,"ind":4,"ty":4,"nm":"c4","sr":1,
      "ks":{"o":{"a":1,"k":[{"t":6,"s":[0],"i":{"x":[0.5],"y":[1]},"o":{"x":[0.5],"y":[0]}},{"t":12,"s":[100]},{"t":40,"s":[100]},{"t":45,"s":[0]}]},
            "r":{"a":0,"k":0},
            "p":{"a":1,"k":[{"t":0,"s":[130,62,0],"i":{"x":0.5,"y":1},"o":{"x":0.5,"y":0},"ti":[0,0,0],"to":[0,0,0]},{"t":45,"s":[140,150,0]}]},
            "a":{"a":0,"k":[0,0,0]},"s":{"a":0,"k":[100,100,100]}},
      "ao":0,
      "shapes":[{"ty":"gr","it":[{"ty":"rc","p":{"a":0,"k":[0,0]},"s":{"a":0,"k":[16,16]},"r":{"a":0,"k":3}},{"ty":"fl","c":{"a":0,"k":[0.984,0.573,0.235,1]},"o":{"a":0,"k":100}},{"ty":"tr","p":{"a":0,"k":[0,0]},"a":{"a":0,"k":[0,0]},"s":{"a":0,"k":[100,100]},"r":{"a":0,"k":30},"o":{"a":0,"k":100}}]}],
      "ip":0,"op":45,"st":0 }
  ]
}
```

- [ ] **Step 4: Create `lib/lottie/templates/check.json`** (draw-on checkmark via trim path)

```json
{
  "v": "5.7.4", "fr": 30, "ip": 0, "op": 30, "w": 200, "h": 200, "nm": "check", "ddd": 0, "assets": [],
  "layers": [
    {
      "ddd": 0, "ind": 1, "ty": 4, "nm": "check", "sr": 1,
      "ks": { "o":{"a":0,"k":100}, "r":{"a":0,"k":0}, "p":{"a":0,"k":[100,100,0]}, "a":{"a":0,"k":[0,0,0]}, "s":{"a":0,"k":[100,100,100]} },
      "ao": 0,
      "shapes": [
        { "ty":"gr", "it": [
          { "ty":"sh", "ks":{"a":0,"k":{"c":false,"v":[[-45,5],[-15,38],[48,-38]],"i":[[0,0],[0,0],[0,0]],"o":[[0,0],[0,0],[0,0]]}}},
          { "ty":"st", "c":{"a":0,"k":[0.129,0.702,0.290,1]}, "o":{"a":0,"k":100}, "w":{"a":0,"k":20}, "lc":2, "lj":2 },
          { "ty":"tm", "s":{"a":0,"k":0}, "e":{"a":1,"k":[ {"t":0,"s":[0],"i":{"x":[0.6],"y":[1]},"o":{"x":[0.4],"y":[0]}}, {"t":24,"s":[100]} ]}, "o":{"a":0,"k":0}, "m":1 },
          { "ty":"tr", "p":{"a":0,"k":[0,0]}, "a":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[100,100]}, "r":{"a":0,"k":0}, "o":{"a":0,"k":100} }
        ] }
      ],
      "ip": 0, "op": 30, "st": 0
    }
  ]
}
```

- [ ] **Step 5: Create `lib/lottie/templates/cross.json`** (draw-on X — two trimmed strokes, one shared color)

```json
{
  "v": "5.7.4", "fr": 30, "ip": 0, "op": 30, "w": 200, "h": 200, "nm": "cross", "ddd": 0, "assets": [],
  "layers": [
    {
      "ddd": 0, "ind": 1, "ty": 4, "nm": "cross", "sr": 1,
      "ks": { "o":{"a":0,"k":100}, "r":{"a":0,"k":0}, "p":{"a":0,"k":[100,100,0]}, "a":{"a":0,"k":[0,0,0]}, "s":{"a":0,"k":[100,100,100]} },
      "ao": 0,
      "shapes": [
        { "ty":"gr", "it": [
          { "ty":"sh", "ks":{"a":0,"k":{"c":false,"v":[[-38,-38],[38,38]],"i":[[0,0],[0,0]],"o":[[0,0],[0,0]]}}},
          { "ty":"st", "c":{"a":0,"k":[0.860,0.149,0.149,1]}, "o":{"a":0,"k":100}, "w":{"a":0,"k":20}, "lc":2, "lj":2 },
          { "ty":"tm", "s":{"a":0,"k":0}, "e":{"a":1,"k":[ {"t":0,"s":[0],"i":{"x":[0.6],"y":[1]},"o":{"x":[0.4],"y":[0]}}, {"t":15,"s":[100]} ]}, "o":{"a":0,"k":0}, "m":1 },
          { "ty":"tr", "p":{"a":0,"k":[0,0]}, "a":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[100,100]}, "r":{"a":0,"k":0}, "o":{"a":0,"k":100} }
        ] },
        { "ty":"gr", "it": [
          { "ty":"sh", "ks":{"a":0,"k":{"c":false,"v":[[38,-38],[-38,38]],"i":[[0,0],[0,0]],"o":[[0,0],[0,0]]}}},
          { "ty":"st", "c":{"a":0,"k":[0.860,0.149,0.149,1]}, "o":{"a":0,"k":100}, "w":{"a":0,"k":20}, "lc":2, "lj":2 },
          { "ty":"tm", "s":{"a":0,"k":0}, "e":{"a":1,"k":[ {"t":15,"s":[0],"i":{"x":[0.6],"y":[1]},"o":{"x":[0.4],"y":[0]}}, {"t":30,"s":[100]} ]}, "o":{"a":0,"k":0}, "m":1 },
          { "ty":"tr", "p":{"a":0,"k":[0,0]}, "a":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[100,100]}, "r":{"a":0,"k":0}, "o":{"a":0,"k":100} }
        ] }
      ],
      "ip": 0, "op": 30, "st": 0
    }
  ]
}
```

- [ ] **Step 6: Create `lib/lottie/templates/progress.json`** (track + fill via trimmed stroke; fill end = `value`)

```json
{
  "v": "5.7.4", "fr": 30, "ip": 0, "op": 30, "w": 340, "h": 60, "nm": "progress", "ddd": 0, "assets": [],
  "layers": [
    {
      "ddd": 0, "ind": 1, "ty": 4, "nm": "progress", "sr": 1,
      "ks": { "o":{"a":0,"k":100}, "r":{"a":0,"k":0}, "p":{"a":0,"k":[170,30,0]}, "a":{"a":0,"k":[0,0,0]}, "s":{"a":0,"k":[100,100,100]} },
      "ao": 0,
      "shapes": [
        { "ty":"gr", "it": [
          { "ty":"sh", "ks":{"a":0,"k":{"c":false,"v":[[-150,0],[150,0]],"i":[[0,0],[0,0]],"o":[[0,0],[0,0]]}}},
          { "ty":"st", "c":{"a":0,"k":[0.886,0.910,0.941,1]}, "o":{"a":0,"k":100}, "w":{"a":0,"k":24}, "lc":2 },
          { "ty":"tr", "p":{"a":0,"k":[0,0]}, "a":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[100,100]}, "r":{"a":0,"k":0}, "o":{"a":0,"k":100} }
        ] },
        { "ty":"gr", "it": [
          { "ty":"sh", "ks":{"a":0,"k":{"c":false,"v":[[-150,0],[150,0]],"i":[[0,0],[0,0]],"o":[[0,0],[0,0]]}}},
          { "ty":"st", "c":{"a":0,"k":[0.917,0.345,0.047,1]}, "o":{"a":0,"k":100}, "w":{"a":0,"k":24}, "lc":2 },
          { "ty":"tm", "s":{"a":0,"k":0}, "e":{"a":1,"k":[ {"t":0,"s":[0],"i":{"x":[0.6],"y":[1]},"o":{"x":[0.4],"y":[0]}}, {"t":24,"s":[100]} ]}, "o":{"a":0,"k":0}, "m":1 },
          { "ty":"tr", "p":{"a":0,"k":[0,0]}, "a":{"a":0,"k":[0,0]}, "s":{"a":0,"k":[100,100]}, "r":{"a":0,"k":0}, "o":{"a":0,"k":100} }
        ] }
      ],
      "ip": 0, "op": 30, "st": 0
    }
  ]
}
```

- [ ] **Step 7: Add all 6 entries to `lib/lottie/catalog.json`**

Replace the file with (spinner kept, 6 added):

```json
{
  "templates": {
    "spinner":  { "description": "Looping circular loader ring",     "file": "spinner.json",  "colorSlots": { "accent": [ ["layers",0,"shapes",0,"it",1,"c","k"] ] }, "valueSlots": {} },
    "pulse":    { "description": "Pulsing dot (scale + fade), loops",  "file": "pulse.json",    "colorSlots": { "accent": [ ["layers",0,"shapes",0,"it",1,"c","k"] ] }, "valueSlots": {} },
    "arrow":    { "description": "Directional arrow nudging, loops",   "file": "arrow.json",    "colorSlots": { "accent": [ ["layers",0,"shapes",0,"it",1,"c","k"] ] }, "valueSlots": {} },
    "confetti": { "description": "Celebratory confetti burst",         "file": "confetti.json", "colorSlots": {
        "accent":      [ ["layers",0,"shapes",0,"it",1,"c","k"], ["layers",2,"shapes",0,"it",1,"c","k"] ],
        "accentLight": [ ["layers",1,"shapes",0,"it",1,"c","k"], ["layers",3,"shapes",0,"it",1,"c","k"] ]
      }, "valueSlots": {} },
    "check":    { "description": "Draw-on success checkmark",          "file": "check.json",    "colorSlots": { "accent": [ ["layers",0,"shapes",0,"it",1,"c","k"] ] }, "valueSlots": {} },
    "cross":    { "description": "Draw-on error cross (X)",            "file": "cross.json",    "colorSlots": { "accent": [ ["layers",0,"shapes",0,"it",1,"c","k"], ["layers",0,"shapes",1,"it",1,"c","k"] ] }, "valueSlots": {} },
    "progress": { "description": "Progress bar filling to a value",    "file": "progress.json", "colorSlots": {
        "accent": [ ["layers",0,"shapes",1,"it",1,"c","k"] ],
        "track":  [ ["layers",0,"shapes",0,"it",1,"c","k"] ]
      }, "valueSlots": { "value": ["layers",0,"shapes",1,"it",2,"e","k",1,"s",0] } }
  }
}
```

- [ ] **Step 8: Append a per-template build smoke test**

Append to `video_toolkit/tests/test_lottie.py`:

```python
@pytest.mark.parametrize("template", ["spinner", "pulse", "arrow", "confetti", "check", "cross", "progress"])
def test_build_each_template_valid(tmp_path, template):
    out = tmp_path / f"{template}.json"
    assert main(["build", template, "--brand", "brands/default/brand.json", "-o", str(out)]) == 0
    assert is_valid_lottie(json.loads(out.read_text()))


def test_progress_value_slot(tmp_path):
    out = tmp_path / "progress.json"
    assert main(["build", "progress", "--set", "value=60", "-o", str(out)]) == 0
    data = json.loads(out.read_text())
    end_keyframes = nav(data, ["layers", 0, "shapes", 1, "it", 2, "e", "k"])
    assert end_keyframes[1]["s"][0] == 60.0
```

(Run this test from the toolkit root so the relative `brands/default/brand.json` resolves.)

- [ ] **Step 9: Run the full suite + validation gate**

Run: `python3 -m pytest video_toolkit/tests/test_lottie.py -v`
Expected: all PASS — including `test_all_catalog_templates_valid` (now covering 7) and the 7 parametrized build smokes + `test_progress_value_slot`.

- [ ] **Step 10: Manual visual QA note (do NOT skip at first real use)**

The automated gate proves structure + color/value patching, NOT rendering. Before relying on a template in a finished reel, preview it once in Remotion Studio via a brand-repo project (`/toolkit:add-lottie-graphic` → `/toolkit:cut-tune`). If a template renders wrong (e.g. a trim direction or path winding looks off), fix the JSON and re-run the gate. Record confirmed-good templates in the skill's catalog table (Task 7).

- [ ] **Step 11: Commit**

```bash
git add lib/lottie/templates/ lib/lottie/catalog.json video_toolkit/tests/test_lottie.py
git commit -m "feat(lottie): add pulse, arrow, confetti, check, cross, progress templates"
```

---

### Task 6: `LottieAnimation` shared component

**Files:**
- Create: `lib/components/LottieAnimation.tsx`
- Modify: `lib/components/index.ts` (add export block)

**Interfaces:**
- Consumes: `@remotion/lottie` (`Lottie`, `LottieAnimationData`) and `remotion` (`staticFile`, `delayRender`, `continueRender`, `cancelRender`) as ambient peers.
- Produces: `LottieAnimation` (default + named export) and `LottieAnimationProps` type; a `recolorLottie(data, map)` helper. Consumed by the command's generated snippet.

**Note:** not unit-testable in core (no `@remotion/lottie`/React installed; core has no test runner for `.tsx`). Verification is authoring-to-API + typecheck in a brand repo. Follow the exact `@remotion/lottie` API from `skills/remotion-official/remotion-markup/lottie.md`.

- [ ] **Step 1: Create `lib/components/LottieAnimation.tsx`**

```tsx
/**
 * Lottie Animation Component
 *
 * Frame-synced wrapper around @remotion/lottie's <Lottie>. Loads animation data
 * from a public/ path (via staticFile) or accepts inline animationData, and renders
 * it deterministically against the Remotion timeline. Optionally recolors fills/strokes
 * at runtime and positions itself as an overlay.
 *
 * @example
 * ```tsx
 * import { LottieAnimation } from '../../../lib/components';
 *
 * // From a materialized asset in the project's public/lottie/
 * <LottieAnimation src="lottie/spinner.json" size={220} x={50} y={50} />
 *
 * // Inline data with a quick runtime recolor
 * <LottieAnimation animationData={data} recolor={{ '#ea580c': '#1d4ed8' }} loop />
 * ```
 */

import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { useEffect, useMemo, useState } from 'react';
import {
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
} from 'remotion';

export interface LottieAnimationProps {
  /** Path relative to the project's public/ dir, e.g. 'lottie/spinner.json'. One of src/animationData required. */
  src?: string;
  /** Inline Lottie JSON. Takes precedence over src. */
  animationData?: LottieAnimationData;
  /** Loop playback (default true). */
  loop?: boolean;
  /** Playback rate multiplier (default 1). Maps to Lottie playbackRate. */
  speed?: number;
  /** Play direction: 1 forward (default), -1 reverse. */
  direction?: 1 | -1;
  /** Runtime hex→hex recolor of fills/strokes, e.g. { '#ea580c': '#1d4ed8' }. */
  recolor?: Record<string, string>;
  /** Horizontal center as % of parent (0–100). If x/y/size omitted, renders inline. */
  x?: number;
  /** Vertical center as % of parent (0–100). */
  y?: number;
  /** Rendered width & height in px. */
  size?: number;
  /** Extra style overrides merged last. */
  style?: React.CSSProperties;
}

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
};

const rgbToHex = (k: number[]): string =>
  '#' +
  k
    .slice(0, 3)
    .map((c) => clampByte(c * 255).toString(16).padStart(2, '0'))
    .join('');

/** Deep-clone `data` and remap fill/stroke colors per a hex→hex map. */
export const recolorLottie = (
  data: LottieAnimationData,
  map: Record<string, string>,
): LottieAnimationData => {
  const norm: Record<string, string> = {};
  for (const [from, to] of Object.entries(map)) norm[from.toLowerCase()] = to;
  const clone = JSON.parse(JSON.stringify(data));
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === 'object') {
      const obj = node as Record<string, any>;
      if (
        (obj.ty === 'fl' || obj.ty === 'st') &&
        obj.c &&
        Array.isArray(obj.c.k) &&
        obj.c.k.length >= 3
      ) {
        const current = rgbToHex(obj.c.k).toLowerCase();
        if (norm[current]) {
          const [r, g, b] = hexToRgb(norm[current]);
          const alpha = obj.c.k.length > 3 ? obj.c.k[3] : 1;
          obj.c.k = [r, g, b, alpha];
        }
      }
      Object.values(obj).forEach(walk);
    }
  };
  walk(clone);
  return clone;
};

export const LottieAnimation: React.FC<LottieAnimationProps> = ({
  src,
  animationData,
  loop = true,
  speed = 1,
  direction = 1,
  recolor,
  x,
  y,
  size,
  style,
}) => {
  const [handle] = useState(() => delayRender('Loading Lottie animation'));
  const [loaded, setLoaded] = useState<LottieAnimationData | null>(
    animationData ?? null,
  );

  useEffect(() => {
    if (animationData) {
      continueRender(handle);
      return;
    }
    if (!src) {
      cancelRender(new Error('LottieAnimation requires `src` or `animationData`'));
      return;
    }
    fetch(staticFile(src))
      .then((res) => res.json())
      .then((json: LottieAnimationData) => {
        setLoaded(json);
        continueRender(handle);
      })
      .catch((err) => cancelRender(err));
  }, [handle, src, animationData]);

  const finalData = useMemo(
    () => (loaded && recolor ? recolorLottie(loaded, recolor) : loaded),
    [loaded, recolor],
  );

  if (!finalData) return null;

  const positioned =
    x !== undefined || y !== undefined || size !== undefined;
  const containerStyle: React.CSSProperties = positioned
    ? {
        position: 'absolute',
        left: `${x ?? 50}%`,
        top: `${y ?? 50}%`,
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        ...style,
      }
    : { width: size, height: size, ...style };

  return (
    <div style={containerStyle}>
      <Lottie
        animationData={finalData}
        loop={loop}
        direction={direction}
        playbackRate={speed}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default LottieAnimation;
```

- [ ] **Step 2: Export from `lib/components/index.ts`**

Add after the "Overlays" export group (near `LogoWatermark`):

```ts
// Motion graphics
export { LottieAnimation, recolorLottie } from './LottieAnimation';
export type { LottieAnimationProps } from './LottieAnimation';
```

- [ ] **Step 3: Verify the file is internally consistent**

Run: `node --check lib/components/LottieAnimation.tsx 2>&1 | head -5 || echo "node --check does not parse TSX (expected); verify by review"`
Expected: `node --check` cannot parse TSX — that is expected. Instead visually confirm: imports match `@remotion/lottie` API (`Lottie`, `LottieAnimationData`, `playbackRate`/`direction`/`loop` props) per the remotion-official lottie skill; the export block in `index.ts` matches the component's exported names (`LottieAnimation`, `recolorLottie`, `LottieAnimationProps`).

- [ ] **Step 4: Commit**

```bash
git add lib/components/LottieAnimation.tsx lib/components/index.ts
git commit -m "feat(lottie): frame-synced LottieAnimation component + recolorLottie helper"
```

---

### Task 7: `lottie` skill

**Files:**
- Create: `skills/lottie/SKILL.md`

**Interfaces:**
- Consumes: everything above (component API, tool subcommands, catalog templates).
- Produces: the discoverable domain knowledge; its catalog table is the human reference for the 7 templates.

- [ ] **Step 1: Create `skills/lottie/SKILL.md`**

```markdown
---
name: lottie
description: Toolkit-specific Lottie motion-graphic patterns — the LottieAnimation component, the curated template library, brand-color patching, sourcing, and placing Lottie as a timeline overlay. Use when adding loaders, checkmarks, confetti, progress bars, or other vector motion overlays to a reel. Triggers include lottie, motion graphic, loader, spinner, checkmark, confetti, progress animation, overlay animation.
---

# Lottie — Toolkit Motion Graphics

> **Core framework knowledge** (installing `@remotion/lottie`, the raw `<Lottie>` component, fetch +
> `delayRender`) lives in `skills/remotion-official/remotion-markup/lottie.md`. This file covers
> **toolkit-specific** patterns only.

Lottie animations are lightweight vector motion graphics (JSON). The toolkit renders them
**frame-synced** to the Remotion timeline (deterministic, never wall-clock playback) via the shared
`LottieAnimation` component, and ships a curated, brand-colorable template library plus a Python
tool for building/recoloring them.

## The workflow

Use `/toolkit:add-lottie-graphic` — it produces a brand-colored Lottie in `public/lottie/` and drops
it on the timeline as a custom overlay. The pieces below are what it (and you) use directly.

## Shared component — `LottieAnimation`

```tsx
import { LottieAnimation } from '../../../lib/components'; // adjust depth to your project

// Materialized asset in public/lottie/
<LottieAnimation src="lottie/spinner.json" size={220} x={50} y={50} loop speed={1} />
```

| Prop | Purpose |
|------|---------|
| `src` | Path under the project's `public/` (e.g. `lottie/check.json`). |
| `animationData` | Inline Lottie JSON (takes precedence over `src`). |
| `loop` / `speed` / `direction` | Playback: loop (default true), rate multiplier, 1 or -1. |
| `recolor` | Runtime `{ '#old': '#new' }` remap of fills/strokes (quick tweak; prefer building brand-colored JSON). |
| `x` / `y` / `size` | Overlay placement (% center) and px size. Omit all three to render inline. |

It handles the `delayRender`/fetch/`continueRender` dance for you; you only pass a `src` or data.

## Curated template library

Build a brand-colored Lottie from a template:

```bash
# List templates (id, description, color/value slots)
python3 -m video_toolkit.lottie list

# Build one, auto-coloring from a brand profile
python3 -m video_toolkit.lottie build spinner \
  --brand brands/<brand>/brand.json \
  -o projects/<name>/public/lottie/spinner.json

# Override a specific slot, or set a value slot
python3 -m video_toolkit.lottie build progress --set value=60 --color accent=#1d4ed8 -o out.json
```

| Template | What it is | Color slots | Value slots |
|----------|-----------|-------------|-------------|
| `spinner` | Looping loader ring | `accent` | — |
| `pulse` | Pulsing dot (scale + fade) | `accent` | — |
| `arrow` | Directional arrow nudge | `accent` | — |
| `confetti` | Celebratory burst | `accent`, `accentLight` | — |
| `check` | Draw-on success check | `accent` | — |
| `cross` | Draw-on error X | `accent` | — |
| `progress` | Bar filling to a value | `accent`, `track` | `value` (0–100) |

Color slots map named roles to color paths inside the Lottie JSON; `--brand` maps brand palette
colors onto them (`accent`→`primary`, `accentLight`→`primaryLight`, `track`→`divider`, `fg`→`textDark`,
`bg`→`bgLight`). Explicit `--color` wins over `--brand`.

## Sourcing an existing Lottie (LottieFiles or local)

```bash
# Inspect what colors a sourced file uses
python3 -m video_toolkit.lottie info sourced.json --colors

# Recolor its brand-relevant colors explicitly
python3 -m video_toolkit.lottie colorize sourced.json \
  --map "#ff3b30=#ea580c" --map "#ffffff=#1e293b" \
  -o projects/<name>/public/lottie/branded.json
```

Downloading a remote Lottie is a file download — the command asks first and states the source.

## Sizing for 9:16 (1080×1920)

Video overlays read from farther away than web UI — size Lottie generously. A loader/check reads well
at `size={200–320}`; a full-width `progress` bar at `size` matching ~60–80% of the 1080px width.
Place with `x`/`y` as % of the parent `AbsoluteFill`.

## Placing as a custom overlay

The materialized JSON in `public/lottie/<name>.json` is referenced by a custom overlay on the
timeline. If the project template exposes a custom-overlay mechanism, register there; otherwise drop
a `<LottieAnimation src="lottie/<name>.json" … />` inside the target segment.

## Gotchas

- **`staticFile`, not raw URLs** for project assets — pass `src="lottie/x.json"`; the component wraps
  it in `staticFile`. Only fetch remote URLs for one-off sourcing.
- **`.json`, not `.lottie`** — the component expects Lottie JSON (`animationData`). Convert dotLottie
  archives to JSON before use.
- **Determinism** — always render through `LottieAnimation`/`<Lottie>` (frame-synced). Never embed a
  lottie-web player; it plays on wall-clock time and will not render frame-accurately.
- **Loop length** — templates author a natural loop (30–45 frames). For a longer on-screen hold, keep
  `loop` on and give the overlay a longer segment duration; don't stretch the JSON.
```

- [ ] **Step 2: Verify the skill frontmatter parses**

Run: `head -4 skills/lottie/SKILL.md`
Expected: valid YAML frontmatter with `name: lottie` and a `description:`.

- [ ] **Step 3: Commit**

```bash
git add skills/lottie/SKILL.md
git commit -m "docs(lottie): add lottie skill — toolkit motion-graphic patterns"
```

---

### Task 8: `add-lottie-graphic` command

**Files:**
- Create: `commands/add-lottie-graphic.md`

**Interfaces:**
- Consumes: `video_toolkit.lottie` (`list`/`build`/`colorize`/`info`), `LottieAnimation`, the `lottie` skill, project discovery conventions from `commands/cut.md`/`add-music.md`.
- Produces: the `/toolkit:add-lottie-graphic` workflow (plugin auto-discovers it from `commands/`).

- [ ] **Step 1: Create `commands/add-lottie-graphic.md`**

```markdown
---
description: Produce a brand-colored Lottie motion graphic and place it on the reel timeline as a custom overlay
---

# Add Lottie Graphic

Produce a Lottie motion-graphic overlay (loader, checkmark, confetti, progress bar, arrow…) — built
from a curated template or sourced from a file — brand-colored, and drop it onto the current
project's timeline as a custom overlay.

**Invoke the `lottie` skill** for component/tool/template details before running this workflow.

## Usage

```
/toolkit:add-lottie-graphic                 # discover project, then choose source or build
/toolkit:add-lottie-graphic <template>      # jump straight to building a curated template
```

---

## Step 1: Discover the project

Same discovery as `/toolkit:cut` / `/toolkit:render`:

1. If cwd is a project (has `project.json` or `src/Root.tsx`), use it.
2. Else scan `projects/` for projects; if several, ask which.
3. Read the brand: `project.json → brand`, resolving to `brands/<brand>/brand.json`. If none is set,
   ask which brand (or fall back to `brands/default/brand.json`).

## Step 2: Choose source or build

Ask the user:

```
How should I create the Lottie?

1. Build from a curated template (spinner, pulse, arrow, confetti, check, cross, progress)
2. Source an existing file (LottieFiles URL or local path)
```

### Build path

1. Run `python3 -m video_toolkit.lottie list` and show the templates + their color/value slots.
2. Let the user pick a template and (optionally) a name (default = template id).
3. For `progress`, ask for a `value` (0–100).
4. Build, auto-coloring from the brand:

   ```bash
   python3 -m video_toolkit.lottie build <template> \
     --brand brands/<brand>/brand.json \
     [--set value=<n>] \
     -o projects/<name>/public/lottie/<asset>.json
   ```

   Offer an explicit `--color <slot>=<hex>` override if the user wants a non-brand color.

### Source path

1. Ask for a LottieFiles URL or a local path.
2. **If a URL:** downloading is a file download — state the filename + source and **ask permission**
   before fetching. Then save the raw JSON to `projects/<name>/public/lottie/<asset>.json`.
   **If a local path:** copy it there.
3. Inspect and recolor to brand:

   ```bash
   python3 -m video_toolkit.lottie info projects/<name>/public/lottie/<asset>.json --colors
   ```

   Show the colors, propose a `--map old=new` to the brand palette, confirm, then:

   ```bash
   python3 -m video_toolkit.lottie colorize projects/<name>/public/lottie/<asset>.json \
     --map "<old>=<brandhex>" [...] \
     -o projects/<name>/public/lottie/<asset>.json
   ```

## Step 3: Report metadata

```bash
python3 -m video_toolkit.lottie info projects/<name>/public/lottie/<asset>.json
```

Tell the user the duration (frames/seconds), dimensions, and where the asset landed.

## Step 4: Place on the timeline as a custom overlay

Detect how the project registers overlays:

- **If the template exposes a custom-overlay mechanism** (e.g. a `customOverlays` array or a `lottie`
  overlay type in `src/config/schema.ts` / `Root.tsx` defaultProps): add an entry referencing
  `public/lottie/<asset>.json`, on the segment/time range the user wants. Keep edits minimal — do not
  invent schema.
- **Otherwise (fallback):** write the asset (already done) and hand back a ready-to-paste snippet plus
  where to put it:

  ```tsx
  import { LottieAnimation } from '../../../lib/components'; // adjust depth

  <LottieAnimation src="lottie/<asset>.json" size={240} x={50} y={50} loop />
  ```

  Tell the user which segment/component to drop it into.

## Step 5: Next steps

Point the user to preview + tune:

```
Lottie ready at public/lottie/<asset>.json and placed as a custom overlay.
Preview and time it with /toolkit:cut-tune (Remotion Studio hot-reloads).
```

## Notes

- Assets are materialized JSON in `public/lottie/` so a custom-overlay editor can pick them up.
- Keep `loop` on for continuous graphics (spinner/pulse/arrow); one-shots (check/cross/confetti)
  play once — give them a segment at least as long as the animation.
- Re-run this command to add more; each writes its own `public/lottie/<name>.json`.
```

- [ ] **Step 2: Verify the command frontmatter parses**

Run: `head -3 commands/add-lottie-graphic.md`
Expected: valid frontmatter with a `description:` line.

- [ ] **Step 3: Commit**

```bash
git add commands/add-lottie-graphic.md
git commit -m "feat(lottie): add /toolkit:add-lottie-graphic command"
```

---

### Task 9: Registry + docs + `add-*` convention

**Files:**
- Modify: `_internal/toolkit-registry.json` (add skill, command, tool, component)
- Modify: `CLAUDE.md` (components table, Python tools table, add-* convention note)
- Modify: `docs/tools-reference.md` (lottie cheat sheet)

**Interfaces:**
- Consumes: names/paths/status from all prior tasks.
- Produces: discoverability — registry entries + docs.

- [ ] **Step 1: Add registry entries**

In `_internal/toolkit-registry.json`:

- Under `skills`, add:

  ```json
  "lottie": {
    "path": "skills/lottie/",
    "description": "Toolkit Lottie motion-graphic patterns — LottieAnimation component, curated template library, brand-color patching, overlay placement",
    "status": "beta",
    "created": "2026-07-20",
    "updated": "2026-07-20"
  }
  ```

- Under `commands`, add:

  ```json
  "add-lottie-graphic": {
    "path": "commands/add-lottie-graphic.md",
    "description": "Produce a brand-colored Lottie motion graphic and place it on the reel timeline as a custom overlay",
    "status": "beta",
    "created": "2026-07-20",
    "updated": "2026-07-20"
  }
  ```

- Under `tools`, add a `lottie` entry. **Exact shape** (matches the existing `voiceover`/`sfx` entries — keys `path`, `description`, `usage`, `status`, `created`, `updated`):

  ```json
  "lottie": {
    "path": "video_toolkit/lottie.py",
    "description": "Inspect, build (from curated templates), and recolor Lottie motion-graphic JSON",
    "usage": "python3 -m video_toolkit.lottie build spinner --brand brands/<brand>/brand.json -o public/lottie/spinner.json",
    "status": "beta",
    "created": "2026-07-20",
    "updated": "2026-07-20"
  }
  ```

- Under `components`, add a `LottieAnimation` entry. **Exact shape** (matches the existing `AnimatedBackground` entry — keys `path`, `description`, `created`, `updated`; **no `status` field**):

  ```json
  "LottieAnimation": {
    "path": "lib/components/LottieAnimation.tsx",
    "description": "Frame-synced @remotion/lottie wrapper with runtime recolor and overlay placement",
    "created": "2026-07-20",
    "updated": "2026-07-20"
  }
  ```

- [ ] **Step 2: Validate the registry still parses**

Run: `python3 -c "import json; d=json.load(open('_internal/toolkit-registry.json')); assert 'lottie' in d['skills']; assert 'add-lottie-graphic' in d['commands']; assert 'lottie' in d['tools']; assert 'LottieAnimation' in d['components']; print('registry OK')"`
Expected: `registry OK`

- [ ] **Step 3: Update `CLAUDE.md` — components table**

In the "Shared Components" section of the registry `remotion` skill reference and the `CLAUDE.md` components table (the `| Component | Purpose |` table), add a row:

```markdown
| `LottieAnimation` | Frame-synced Lottie overlay (loaders, checks, confetti, progress) |
```

- [ ] **Step 4: Update `CLAUDE.md` — Python tools table + add-* note**

In the Python Tools table, add `lottie` to the **Project tools** row:

```markdown
| **Project tools** | voiceover, music_gen, sfx, sync_timing, lottie | During video creation workflow |
```

Near the campaign-reels workflow section, add a short note on the `add-*` convention:

```markdown
**The `add-*` command family:** `add-music`, `add-lottie-graphic` (and, planned,
`add-video-from-text`) each *generate or source a discrete asset and place it on the timeline*.
Animated components and transitions are code-level primitives composed via `/toolkit:cut` and
`/toolkit:slide-design`, not part of this family.
```

- [ ] **Step 5: Update `docs/tools-reference.md`**

Add a `lottie` block (match the formatting of the existing tool blocks):

```markdown
### Lottie motion graphics (`video_toolkit.lottie`)

```bash
# List curated templates and their color/value slots
python3 -m video_toolkit.lottie list

# Inspect a Lottie file (metadata + validate; --colors lists fill/stroke colors)
python3 -m video_toolkit.lottie info animation.json --colors

# Build a brand-colored Lottie from a template
python3 -m video_toolkit.lottie build spinner --brand brands/<brand>/brand.json -o public/lottie/spinner.json
python3 -m video_toolkit.lottie build progress --set value=60 --color accent=#1d4ed8 -o out.json

# Recolor a sourced Lottie to brand (map old hex → new hex)
python3 -m video_toolkit.lottie colorize sourced.json --map "#ff0000=#ea580c" -o branded.json
```
```

- [ ] **Step 6: Full verification sweep**

Run:
```bash
python3 -m pytest video_toolkit/tests/test_lottie.py -q && \
python3 -m video_toolkit.lottie list && \
python3 -c "import json; d=json.load(open('_internal/toolkit-registry.json')); print('registry OK')" && \
grep -q "LottieAnimation" CLAUDE.md && grep -q "add-lottie-graphic" CLAUDE.md && echo "docs OK"
```
Expected: tests pass, template list prints 7 rows, `registry OK`, `docs OK`.

- [ ] **Step 7: Commit**

```bash
git add _internal/toolkit-registry.json CLAUDE.md docs/tools-reference.md
git commit -m "docs(lottie): register skill/command/tool/component + document add-* convention"
```

---

## Self-Review

**1. Spec coverage:**
- Skill (`skills/lottie/SKILL.md`, defers to remotion-official, catalog table) → Task 7 ✓
- Shared component (`LottieAnimation.tsx`, ambient peer, index export) → Task 6 ✓
- Curated library (`lib/lottie/` catalog + 7 templates) → Tasks 2 + 5 ✓
- Python tool (`list`/`build`/`colorize`/`info` + pytest) → Tasks 1–5 ✓
- Command (`/toolkit:add-lottie-graphic`, source-or-build, materialize, custom-overlay + fallback) → Task 8 ✓
- Registry + docs + add-* convention → Task 9 ✓
- Materialize-by-default + optional runtime recolor → component `recolor` prop (Task 6) + command materializes (Task 8) ✓
- Out of scope respected: no `add-video-from-text`, no editor/schema work, no generator, no rename of `add-music` ✓

**2. Placeholder scan:** No TBD/TODO/"add error handling"/"write tests for above". Registry sub-steps that say "match the neighboring entry shape" point at a concrete existing file to copy from, not a vague instruction — acceptable because the registry's exact per-section field shape is data to mirror, and Step 2 validates the result.

**3. Type consistency:** `colorSlots` is `slot -> list[path]` everywhere (catalog, `cmd_build`, validation test). `main(argv) -> int` used by all tests. `nav`/`nav_set`/`hex_to_rgba`/`rgba_to_hex`/`distinct_colors`/`is_valid_lottie`/`load_catalog`/`CATALOG_DIR` names consistent across tasks. Component exports (`LottieAnimation`, `recolorLottie`, `LottieAnimationProps`) match the `index.ts` export block. `value` value-slot path in the catalog matches `test_progress_value_slot` and `progress.json` structure (`layers[0].shapes[1].it[2].e.k[1].s[0]`).

**Residual risk (called out honestly):** hand-authored template JSON is structurally gated but not render-verified in core — Task 5 Step 10 mandates a one-time Studio visual check per template at first real use.
