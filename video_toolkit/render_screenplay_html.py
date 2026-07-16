#!/usr/bin/env python3
"""Render `projects/<name>/SCREENPLAY.md` → `SCREENPLAY.html` for collaborators
who prefer reading formatted HTML over raw markdown.

The output is a self-contained HTML file with embedded CSS — print-friendly
(A4 margins, page-break hints) and readable on screen. Open it locally
(``open SCREENPLAY.html``) or send the file directly to collaborators.

Usage:
    python3 -m video_toolkit.render_screenplay_html <project-name>
    python3 -m video_toolkit.render_screenplay_html --all       # all projects with SCREENPLAY.md
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=JetBrains+Mono:wght@400;700&display=swap');

:root {
  /* Default brand tokens (mirror a brand repo's website tokens.css, if any) */
  --coal: #0a0a0a;
  --linen: #f5f5f0;
  --lime: #c6f432;
  --teal: #2ad4c5;
  --surface-2: #0e0e0e;
  --surface-3: #141414;
  --border: #222222;
  --border-2: #2a2a2a;
  --muted: #9a9a95;
  --text-secondary: #cccac1;
  --font-sans: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

* { box-sizing: border-box; }

html { font-size: 16px; }

body {
  font-family: var(--font-sans);
  color: var(--linen);
  background: var(--coal);
  line-height: 1.6;
  max-width: 920px;
  margin: 0 auto;
  padding: 48px 56px 96px;
  letter-spacing: -0.005em;
}

h1 {
  font-size: 2.4rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 0.5rem;
  line-height: 1.1;
}

h1::after {
  content: '';
  display: block;
  width: 96px;
  height: 4px;
  background: var(--lime);
  margin-top: 0.5rem;
}

h2 {
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  margin: 2.8rem 0 0.6rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--border-2);
  line-height: 1.2;
}

h2::before {
  content: '▸ ';
  color: var(--teal);
}

h3 {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  margin: 1.6rem 0 0.5rem;
  color: var(--teal);
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

p { margin: 0.55rem 0; color: var(--text-secondary); }

a { color: var(--teal); text-decoration: underline; text-underline-offset: 2px; }
a:hover { color: var(--lime); }

ul, ol { margin: 0.5rem 0 1rem; padding-left: 1.6rem; color: var(--text-secondary); }
li { margin: 0.25rem 0; }
li::marker { color: var(--teal); }

/* Blockquote = co mluvčí říká. Klíčový vizuál stránky — výrazný blok. */
blockquote {
  background: var(--surface-2);
  border-left: 4px solid var(--lime);
  margin: 1rem 0;
  padding: 0.9rem 1.2rem;
  font-size: 1.08rem;
  color: var(--linen);
  font-weight: 500;
  line-height: 1.55;
}

blockquote p { color: var(--linen); }
blockquote p:first-child { margin-top: 0; }
blockquote p:last-child { margin-bottom: 0; }
blockquote strong { color: var(--lime); font-weight: 700; }

code {
  background: var(--surface-3);
  border: 1px solid var(--border);
  padding: 1px 6px;
  font-size: 0.88em;
  font-family: var(--font-mono);
  color: var(--linen);
}

pre {
  background: var(--surface-3);
  border: 1px solid var(--border);
  padding: 1rem 1.2rem;
  overflow-x: auto;
  color: var(--linen);
}
pre code { background: transparent; border: 0; padding: 0; }

table {
  border-collapse: collapse;
  margin: 1rem 0 1.4rem;
  width: 100%;
  font-size: 0.94rem;
  background: var(--surface-2);
}

th, td {
  border: 1px solid var(--border-2);
  padding: 0.55rem 0.8rem;
  text-align: left;
  vertical-align: top;
  color: var(--text-secondary);
}

th {
  background: var(--surface-3);
  color: var(--linen);
  font-weight: 600;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

tbody tr:nth-child(even) { background: var(--surface-3); }

/* Shot codes inside tables (TH-NN / BR-NN) — pill highlights */
td strong {
  display: inline-block;
  padding: 1px 8px;
  font-family: var(--font-mono);
  font-size: 0.84em;
  font-weight: 700;
  background: var(--lime);
  color: var(--coal);
  letter-spacing: 0.04em;
}

/* Generic strong in body text — keep readable, slight accent */
strong { color: var(--linen); font-weight: 700; }

hr {
  border: 0;
  border-top: 1px solid var(--border-2);
  margin: 2.4rem 0;
  position: relative;
}

hr::after {
  content: '◆';
  position: absolute;
  top: -0.7em;
  left: 50%;
  transform: translateX(-50%);
  background: var(--coal);
  color: var(--teal);
  padding: 0 0.5rem;
  font-size: 0.8rem;
}

/* Print: invertovat na light mode pro tonerově přijatelný výstup */
@page {
  size: A4;
  margin: 18mm 16mm;
}

@media print {
  :root {
    --coal: #ffffff;
    --linen: #1a1a1a;
    --surface-2: #f5f5f0;
    --surface-3: #ebebe5;
    --border: #c0c0b8;
    --border-2: #b0b0a8;
    --text-secondary: #2a2a2a;
    --muted: #555;
  }
  body {
    max-width: none;
    padding: 0;
    background: white;
    color: #1a1a1a;
    font-size: 10.5pt;
  }
  h1 { font-size: 20pt; color: #0a0a0a; }
  h1::after { background: #0a0a0a; }
  h2 {
    font-size: 14pt;
    color: #0a0a0a;
    page-break-before: auto;
    page-break-after: avoid;
  }
  h2::before { color: #0a0a0a; }
  h3 { font-size: 9pt; color: #2a2a2a; page-break-after: avoid; }
  blockquote {
    background: #f5f5f0;
    border-left-color: #0a0a0a;
    color: #1a1a1a;
  }
  blockquote p, blockquote strong { color: #1a1a1a; }
  table, blockquote { page-break-inside: avoid; }
  th { background: #ebebe5; color: #0a0a0a; }
  tbody tr:nth-child(even) { background: #f5f5f0; }
  td strong {
    background: #1a1a1a;
    color: #ffffff;
  }
  hr {
    page-break-after: always;
    border: 0;
    margin: 0;
  }
  hr::after { display: none; }
  a { color: #1a1a1a; }
  code, pre { background: #ebebe5; color: #1a1a1a; border-color: #c0c0b8; }
}
"""


def render(md_path: Path, html_path: Path) -> None:
    """Run pandoc to produce a self-contained HTML file with our CSS embedded."""
    if not shutil.which("pandoc"):
        sys.exit("error: pandoc not found on PATH (install via `brew install pandoc`)")

    # Write CSS to a temp file so pandoc can embed it via --include-in-header
    css_path = html_path.parent / ".screenplay-style.css"
    css_path.write_text(f"<style>{CSS}</style>")

    cmd = [
        "pandoc",
        str(md_path),
        "-f", "markdown+smart",
        "-t", "html5",
        "--standalone",
        "--metadata", f"title={md_path.parent.name} — Scénář",
        "--include-in-header", str(css_path),
        "-o", str(html_path),
    ]
    try:
        subprocess.run(cmd, check=True)
    finally:
        css_path.unlink(missing_ok=True)


def project_dir(name: str) -> Path:
    p = ROOT / "projects" / name
    if not p.is_dir():
        sys.exit(f"error: project directory not found: {p}")
    return p


def render_project(name: str) -> Path:
    p = project_dir(name)
    md = p / "SCREENPLAY.md"
    if not md.is_file():
        sys.exit(f"error: {md} not found")
    html = p / "SCREENPLAY.html"
    render(md, html)
    return html


def main() -> int:
    parser = argparse.ArgumentParser(description="Render SCREENPLAY.md → SCREENPLAY.html.")
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("project", nargs="?", help="Project directory under projects/")
    g.add_argument("--all", action="store_true", help="Render every project with a SCREENPLAY.md")
    args = parser.parse_args()

    if args.all:
        projects_dir = ROOT / "projects"
        targets = sorted(p.name for p in projects_dir.iterdir() if p.is_dir() and (p / "SCREENPLAY.md").is_file())
        if not targets:
            sys.exit("error: no projects with SCREENPLAY.md found")
        for name in targets:
            html = render_project(name)
            print(f"✔ {html}")
    else:
        html = render_project(args.project)
        print(f"✔ {html}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
