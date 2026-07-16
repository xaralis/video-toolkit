# Example Projects

Small, self-contained projects demonstrating toolkit capabilities.

## Available Examples

| Example | Stack | Description | Complexity |
|---------|-------|-------------|------------|
| hello-world | Remotion | Minimal 25s video — zero config, renders in 2 minutes | Beginner |
| quick-spot | moviepy + PIL | 15s ad-style spot with an audio-anchored timeline. Runs with zero external assets. | Beginner |
| data-viz-chart | moviepy + matplotlib | Animated time-series chart with deterministic title and source attribution. Runs with the included data file. | Beginner |

All three run end-to-end with no API keys.

## Using Examples

**Remotion example** (`hello-world`) — copy it, then work on it like any project:

```bash
cp -r examples/hello-world projects/my-project
cd projects/my-project
npm install
npm run studio          # or: npm run render
```

**moviepy examples** (`quick-spot`, `data-viz-chart`) — run in place, no copy needed:

```bash
cd examples/quick-spot   # or examples/data-viz-chart
python3 build.py         # produces out.mp4 in the example directory
```

These are self-contained references for the `moviepy` skill — read each one's `build.py` and
`README.md`.

## Example Structure

```
examples/example-name/
├── README.md              # What this example demonstrates
├── build.py               # moviepy examples: the whole video in one file
└── src/                   # Remotion examples: composition + config
```
