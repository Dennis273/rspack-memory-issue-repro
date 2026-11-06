# rspack watch-mode memory growth repro

The memory of a long-running `rspack watch` / dev server keeps growing with every rebuild, even when the number of modules stays the same.

This repo generates a project with 3000 ES modules (barrel re-exports, `"sideEffects": false`), starts `compiler.watch()`, and toggles the same 400 files between two versions on every rebuild. That allocates about 7.6k new `DependencyId`s per rebuild, close to what a real 6.4k-module project showed when switching between two commits. After every 10th rebuild it runs `gc()` and records RSS.

## Run

```bash
npm install
npm run compare
```

`compare` runs each version in its own process with `MIMALLOC_PURGE_DELAY=0`, so freed memory goes back to the OS right away and RSS reflects what rspack holds.

To include a local rspack build:

```bash
node compare.mjs /path/to/rspack/packages/rspack/dist/index.js
```

Environment variables: `MODULES` (3000), `CHANGED` (400), `ROUNDS` (100), `SAMPLE_EVERY` (10).

## Results

Linux x64, Node 22, 4 vCPU. RSS in MB after `gc()`.

| rebuilds | 2.0.4 | 2.0.8 | 2.3.1 | 2.3.1 + [dense storage fix] | 2.3.1 + [exports info fix] | 2.3.1 + both |
| -------- | ----- | ----- | ----- | --------------------------- | -------------------------- | ------------ |
| 0        | 239   | 235   | 211   | 213                         | 219                        | 220          |
| 20       | 344   | 350   | 317   | 300                         | 320                        | 296          |
| 40       | 378   | 416   | 356   | 307                         | 344                        | 290          |
| 60       | 406   | 462   | 386   | 316                         | 373                        | 292          |
| 80       | 458   | 535   | 437   | 338                         | 403                        | 295          |
| 100      | 476   | 584   | 472   | 345                         | 433                        | 297          |
| MB per 100 rebuilds | 171 | 296 | 200 | 62 | 141 | 6 |

The last row is the least-squares slope from round 20 on.

Two things grow with every rebuild:

- Since 2.1.0, the module graph keeps dependencies and connections in `Vec<Option<V>>` tables indexed by `DependencyId` / `ModuleGraphConnectionId`. These ids are never reused and every rebuilt module gets new ones, so the tables grow with the number of ids ever allocated.
- `ExportsInfoArtifact` keeps the old `ExportsInfoData` of every rebuilt module, and clones all of it at every checkpoint. This one also affects 2.0.x.

With both fixes, RSS stays flat after warm-up.

[dense storage fix]: https://github.com/Dennis273/rspack/tree/claude/vibrant-cannon-f4t37p
[exports info fix]: https://github.com/Dennis273/rspack/tree/claude/exports-info-gc
