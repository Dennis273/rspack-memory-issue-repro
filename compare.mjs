// Usage: node compare.mjs [extra @rspack/core path...]
// Runs repro.mjs once per version in a fresh process and prints RSS side by side.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const targets = ['rspack-2.0.4', 'rspack-2.3.1', ...process.argv.slice(2)];
const labelOf = (target) => (target.startsWith('rspack-') ? target : 'local');

const results = [];
for (const target of targets) {
  const label = labelOf(target);
  const { status } = spawnSync(process.execPath, ['--expose-gc', 'repro.mjs', target, label], {
    stdio: 'inherit',
    env: { ...process.env, MIMALLOC_PURGE_DELAY: '0' },
  });
  if (status !== 0) process.exit(status ?? 1);
  results.push(JSON.parse(fs.readFileSync(path.join('results', `${label.replace(/[^\w.-]/g, '_')}.json`), 'utf8')));
}

// Least-squares slope of RSS over rebuilds, skipping the first rounds while caches warm up.
const growthPer100 = ({ samples }) => {
  const points = samples.filter((sample) => sample.round >= 20);
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.round, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.rssMb, 0) / n;
  const cov = points.reduce((sum, p) => sum + (p.round - meanX) * (p.rssMb - meanY), 0);
  const varX = points.reduce((sum, p) => sum + (p.round - meanX) ** 2, 0);
  return ((cov / varX) * 100).toFixed(1);
};

const header = ['round', ...results.map((r) => `${r.label} (${r.version})`)];
const rows = results[0].samples.map((sample, i) => [
  String(sample.round),
  ...results.map((r) => `${r.samples[i].rssMb} MB`),
]);
console.log(`\n| ${header.join(' | ')} |`);
console.log(`| ${header.map(() => '---').join(' | ')} |`);
for (const row of rows) console.log(`| ${row.join(' | ')} |`);
console.log(`| MB / 100 rebuilds | ${results.map((r) => growthPer100(r)).join(' | ')} |`);
