# Contributing to claude-code-video-toolkit

This toolkit is designed to grow through use. Every interaction is an opportunity to improve.

## How to Contribute

### Local Users (working with Claude Code)

1. **Tell Claude** - Just say "I have feedback" or "this could be better"
2. **Claude acts on it** - Bugs get fixed directly; larger ideas are noted in an
   [upstream issue](https://github.com/digitalsamba/claude-code-video-toolkit/issues) so they aren't lost
3. **Patterns emerge** - Common needs become new features
4. **Submit upstream** - `gh pr create` to share with others

### Remote Contributors (via GitHub)

- **Issues**: [github.com/digitalsamba/claude-code-video-toolkit/issues](https://github.com/digitalsamba/claude-code-video-toolkit/issues)
  - Bug reports, feature requests, questions
- **Pull Requests**: Fork, improve, submit PR
  - New templates, skills, commands
  - Documentation improvements
  - Bug fixes

---

## Evolution Principles

### Commands Evolve
Commands start simple and grow based on real usage:
- `/video` started as `/new-sprint-video`, expanded to multi-template, multi-session
- `/brand` merged creation and listing into one entry point
- Patterns that work get documented; patterns that don't get removed

### Skills Mature
Skills progress through maturity levels:
- **draft** → **beta** → **stable**
- Each real-world use validates or improves the skill
- Reference docs grow from actual questions and edge cases

### Templates Generalize
Templates extract patterns from projects:
- Build a project, notice reusable patterns
- Extract to template, parameterize the specifics
- Share components via `lib/` when used across templates

### The Toolkit Learns
Every session teaches the toolkit something:
- What workflows are awkward? → Improve commands
- What questions keep coming up? → Add to skill docs
- What's missing? → File an [upstream issue](https://github.com/digitalsamba/claude-code-video-toolkit/issues)

---

## Feedback Categories

| Category | Action |
|----------|--------|
| **Bugs** | Fix immediately or file an upstream issue |
| **Ideas** | File an [upstream issue](https://github.com/digitalsamba/claude-code-video-toolkit/issues) |
| **Documentation** | Update relevant skill, command, or docs/ |
| **Workflow** | Update commands or CLAUDE.md |
| **Templates** | File an upstream issue under the Templates label |

**Important:** When adding commands, skills, or templates, follow the [Documentation Checklist](../CONTRIBUTING.md#documentation-checklist) to ensure all docs stay in sync.

---

## Quick Contribution (from your working copy)

```bash
# 1. Check what you're about to share (projects/ won't appear)
git status

# 2. Create a branch for your improvement
git checkout -b improve/description

# 3. Stage only toolkit files (projects/ is ignored automatically)
git add .claude/ templates/ lib/ docs/ _internal/

# 4. Commit
git commit -m "Improve: description"

# 5. Create PR
gh pr create --title "Improve: description" --body "..."
```

## Clean Contribution (fresh clone)

If you want to be extra careful:

```bash
# Clone fresh
git clone https://github.com/digitalsamba/claude-code-video-toolkit ~/toolkit-contrib
cd ~/toolkit-contrib

# Copy only the files you improved
cp -r /path/to/your/work/commands/improved-command.md commands/

# Commit and PR
git checkout -b improve/description
git add -A
git commit -m "Improve: description"
gh pr create
```

---

## What's Safe to Share

| Directory | Shared? | Contains |
|-----------|---------|----------|
| `commands/` | Yes | Slash commands |
| `skills/` | Yes | Skill documentation |
| `templates/` | Yes | Video templates |
| `lib/` | Yes | Shared components |
| `docs/` | Yes | Documentation |
| `video_toolkit/` | Yes | Python CLI tools |
| `brands/` | Careful | Only share generic brands |
| `projects/` | No | Your private video work |
| `assets/voices/` | No | Your voice samples |

---

## Toolkit Tracking Files

| File | Purpose |
|------|---------|
| `_internal/CHANGELOG.md` | What we built (historical record) |

Roadmap and unscheduled ideas are tracked upstream, not in this repo — see
[github.com/digitalsamba/claude-code-video-toolkit/issues](https://github.com/digitalsamba/claude-code-video-toolkit/issues).
