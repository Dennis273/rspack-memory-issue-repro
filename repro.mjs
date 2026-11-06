// Usage: node --expose-gc repro.mjs <@rspack/core package or path> [label]
// Env: MODULES (3000), CHANGED (400), ROUNDS (100), SAMPLE_EVERY (10)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { generate, leafPath, leafSource } from './generate.mjs';

const require = createRequire(import.meta.url);
const corePath = process.argv[2] ?? 'rspack-2.3.1';
const label = process.argv[3] ?? corePath;
const { rspack, rspackVersion: version } = require(corePath);

const env = (name, fallback) => Number(process.env[name] ?? fallback);
const modules = env('MODULES', 3000);
const changed = env('CHANGED', 400);
const rounds = env('ROUNDS', 100);
const sampleEvery = env('SAMPLE_EVERY', 10);

const dir = path.resolve('fixture', label.replace(/[^\w.-]/g, '_'));
generate(dir, modules);

const compiler = rspack({
  context: dir,
  mode: 'development',
  devtool: false,
  entry: './src/index.js',
  output: { path: path.join(dir, 'dist') },
});

let onDone;
compiler.hooks.done.tap('repro', (stats) => {
  if (stats.hasErrors()) {
    console.error(stats.toString({ all: false, errors: true }));
    process.exit(1);
  }
  onDone?.();
});
const nextBuild = () => new Promise((resolve) => (onDone = resolve));

const rssMb = () => {
  globalThis.gc?.();
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
};

const samples = [];
const firstBuild = nextBuild();
const watching = compiler.watch({ aggregateTimeout: 200 }, () => {});
await firstBuild;
samples.push({ round: 0, rssMb: rssMb() });
console.log(`${label} (@rspack/core ${version})`);
console.log(`round 0: ${samples[0].rssMb} MB`);

const step = Math.max(1, Math.floor(modules / changed));
const variants = new Array(modules).fill(false);
for (let round = 1; round <= rounds; round++) {
  const build = nextBuild();
  for (let i = 0; i < changed; i++) {
    const index = (i * step) % modules;
    variants[index] = !variants[index];
    fs.writeFileSync(leafPath(dir, index), leafSource(index, modules, variants[index]));
  }
  const start = performance.now();
  await build;
  const ms = Math.round(performance.now() - start);
  if (round % sampleEvery === 0) {
    samples.push({ round, rssMb: rssMb(), ms });
    console.log(`round ${round}: ${samples.at(-1).rssMb} MB (rebuild ${ms} ms)`);
  }
}

await new Promise((resolve) => watching.close(resolve));
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync(
  path.join('results', `${label.replace(/[^\w.-]/g, '_')}.json`),
  JSON.stringify({ label, version, modules, changed, samples }, null, 2),
);
fs.rmSync(dir, { recursive: true, force: true });
