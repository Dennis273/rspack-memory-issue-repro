import fs from 'node:fs';
import path from 'node:path';

const MODULES_PER_BARREL = 50;
const IMPORTS_PER_MODULE = 6;

export function leafPath(dir, index) {
  return path.join(dir, 'src', 'lib', `m${index}.js`);
}

// `variant` is the second "commit": one more import and a different body.
export function leafSource(index, modules, variant) {
  const barrels = Math.ceil(modules / MODULES_PER_BARREL);
  const barrelOf = (target) => Math.floor(target / MODULES_PER_BARREL) % barrels;
  const lines = [];
  const used = [];
  for (let offset = 1; offset <= IMPORTS_PER_MODULE; offset++) {
    const target = (index + offset * 7) % modules;
    if (target === index) continue;
    lines.push(`import { f${target} as i${offset} } from '../barrel${barrelOf(target)}.js';`);
    used.push(`i${offset}`);
  }
  if (variant) {
    const target = (index + 1) % modules;
    lines.push(`import { g${target} as extra } from '../barrel${barrelOf(target)}.js';`);
    used.push('extra');
  }
  const types = used.map((name) => `typeof ${name}`).join(', ');
  lines.push(`export function f${index}(n) { return n > 0 ? [${types}].length + n : ${index}; }`);
  lines.push(`export const g${index} = { id: ${index}, variant: ${variant} };`);
  lines.push(`export default f${index};`);
  return `${lines.join('\n')}\n`;
}

export function generate(dir, modules) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', sideEffects: false }),
  );
  for (let index = 0; index < modules; index++) {
    fs.writeFileSync(leafPath(dir, index), leafSource(index, modules, false));
  }
  const barrels = Math.ceil(modules / MODULES_PER_BARREL);
  const entry = [];
  for (let barrel = 0; barrel < barrels; barrel++) {
    const start = barrel * MODULES_PER_BARREL;
    const end = Math.min(start + MODULES_PER_BARREL, modules);
    const lines = [];
    for (let index = start; index < end; index++) {
      lines.push(`export { f${index}, g${index} } from './lib/m${index}.js';`);
    }
    fs.writeFileSync(path.join(dir, 'src', `barrel${barrel}.js`), `${lines.join('\n')}\n`);
    entry.push(`import * as b${barrel} from './barrel${barrel}.js';`);
  }
  const names = Array.from({ length: barrels }, (_, barrel) => `b${barrel}`).join(', ');
  entry.push(`console.log([${names}].map((b) => Object.keys(b).length));`);
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), `${entry.join('\n')}\n`);
}
