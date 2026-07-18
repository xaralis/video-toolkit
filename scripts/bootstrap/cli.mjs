#!/usr/bin/env node
// Bootstrap a brand repo that vendors this toolkit as a `toolkit/` submodule.
// Zero runtime dependencies — Node built-ins only. Invoked as:
//   npx github:xaralis/video-toolkit init <dir>
import {
  existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, cpSync,
} from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const TOOLKIT_HTTPS = 'https://github.com/xaralis/video-toolkit.git';
const TOOLKIT_SSH = 'git@github.com:xaralis/video-toolkit.git';

function fail(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }
function info(msg) { console.log(msg); }

function commandExists(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

function isLocalPath(url) {
  return !/^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/.test(url);
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) fail(`git ${args.join(' ')} failed`);
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function ask(rl, question, def) {
  if (!rl) return def;
  const a = (await rl.question(`${question}${def ? ` (${def})` : ''}: `)).trim();
  return a || def;
}

function parseArgs(argv) {
  const opts = {
    targetDir: null, brand: null, toolkitUrl: null,
    ssh: false, ref: 'main', skipInstall: false, yes: false,
  };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ssh') opts.ssh = true;
    else if (a === '--skip-install') opts.skipInstall = true;
    else if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--brand') opts.brand = argv[++i];
    else if (a === '--toolkit-url') opts.toolkitUrl = argv[++i];
    else if (a === '--ref') opts.ref = argv[++i];
    else if (a.startsWith('-')) fail(`unknown flag: ${a}`);
    else positionals.push(a);
  }
  opts.targetDir = positionals[0] ?? null;
  return opts;
}

function nodeMajor() { return parseInt(process.versions.node.split('.')[0], 10); }

function assertPreflight() {
  if (nodeMajor() < 18) fail(`Node 18+ required (found ${process.versions.node}).`);
  if (!commandExists('git')) fail('git is required but was not found on PATH.');
}

async function runInit(argv) {
  const opts = parseArgs(argv);
  assertPreflight();

  const rl = opts.yes ? null : createInterface({ input: stdin, output: stdout });
  try {
    let targetDir = opts.targetDir || await ask(rl, 'Target directory', 'my-brand-videos');
    targetDir = resolve(targetDir);
    if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
      fail(`target directory is not empty: ${targetDir}`);
    }
    const guess = slugify(basename(targetDir).replace(/-videos$/, '')) || 'my-brand';
    const brand = slugify(opts.brand || await ask(rl, 'Brand slug', guess));
    if (!brand) fail('brand slug is required');
    const toolkitUrl = opts.toolkitUrl || (opts.ssh ? TOOLKIT_SSH : TOOLKIT_HTTPS);

    info(`\nCreating brand repo at ${targetDir} …`);
    mkdirSync(targetDir, { recursive: true });
    git(['init', '-q'], targetDir);

    addToolkitSubmodule(targetDir, toolkitUrl, opts.ref);
    scaffoldWorkspace(targetDir, brand);
    scaffoldBrand(targetDir, brand);
    scaffoldProjects(targetDir);

    // --- later tasks append config-files + commit + install + next-steps here ---
  } finally {
    rl?.close();
  }
}

function addToolkitSubmodule(targetDir, url, ref) {
  info(`• Adding toolkit submodule (${url}) …`);
  const pre = isLocalPath(url) ? ['-c', 'protocol.file.allow=always'] : [];
  git([...pre, 'submodule', 'add', '--depth', '1', url, 'toolkit'], targetDir);
  if (ref && ref !== 'main') {
    git([...pre, '-C', 'toolkit', 'fetch', '--depth', '1', 'origin', ref], targetDir);
    git([...pre, '-C', 'toolkit', 'checkout', 'FETCH_HEAD'], targetDir);
  }
}

function scaffoldWorkspace(targetDir, brand) {
  writeJson(join(targetDir, 'workspace.json'), {
    name: `${brand}-videos`,
    kind: 'brand',
    comment: 'Marks this brand workspace. video_toolkit.paths.workspace_root() walks up to find it.',
  });
}

function scaffoldBrand(targetDir, brand) {
  const src = join(targetDir, 'toolkit', 'brands', 'default');
  const dst = join(targetDir, 'brands', brand);
  cpSync(src, dst, { recursive: true });
  const bjPath = join(dst, 'brand.json');
  const bj = JSON.parse(readFileSync(bjPath, 'utf8'));
  bj.name = brand;
  bj.description = `Brand profile for ${brand}`;
  writeJson(bjPath, bj);
  writeFileSync(join(dst, 'BRAND-RULES.md'), brandRulesStub(brand));
}

function brandRulesStub(brand) {
  return `# ${brand} — Brand Rules

Authoritative, machine- and human-enforced rules for this brand's videos. Every
rule here should be learned from a real defect; \`/toolkit:cut\` and
\`/toolkit:narrate\` load this file to enforce discipline.

Start by running \`/toolkit:brand\` to fill in colors, fonts, and voice, then add
rules as you go. Baseline conventions inherited from the toolkit:

- Accent color is for **emphasis only**, never large fills.
- Segments run **≥ 3s** on screen.
- Audio inherits across L-cuts unless explicitly overridden.

See \`toolkit/docs/video-timing.md\` and \`toolkit/docs/remotion-patterns.md\`.
`;
}

function scaffoldProjects(targetDir) {
  const dir = join(targetDir, 'projects');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.gitkeep'), '');
}

function printUsage() {
  info(`video-toolkit — AI-native video production toolkit

Usage:
  npx github:xaralis/video-toolkit init [dir] [options]

Options:
  --brand <slug>        brand slug for brands/<slug>/ (default: derived from dir)
  --toolkit-url <url>   toolkit submodule source (default: ${TOOLKIT_HTTPS})
  --ssh                 use the SSH submodule URL instead of HTTPS
  --ref <branch|tag>    toolkit submodule pin (default: main)
  --skip-install        skip the Python toolkit install
  --yes, -y             non-interactive; accept defaults
`);
}

const [, , subcommand, ...rest] = process.argv;
if (!subcommand || subcommand === '-h' || subcommand === '--help') {
  printUsage();
  process.exit(subcommand ? 0 : 1);
} else if (subcommand === 'init') {
  await runInit(rest);
} else {
  console.error(`Unknown command: ${subcommand}`);
  printUsage();
  process.exit(1);
}
