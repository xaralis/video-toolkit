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

from video_toolkit.paths import toolkit_root
from video_toolkit.textio import write_text_lf

# lib/ ships with the toolkit, so this one really is toolkit-relative.
CATALOG_DIR = toolkit_root() / "lib" / "lottie"

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
    write_text_lf(out, json.dumps(data))
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
    write_text_lf(out, json.dumps(data))
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
