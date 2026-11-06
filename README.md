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

| rebuilds | 2.0.4 | 2.0.8 | 2.3.1 | 2.3.1 + [fix] |
| -------- | ----- | ----- | ----- | ------------- |
| 0        | 239   | 235   | 209   | 213           |
| 20       | 344   | 350   | 318   | 300           |
| 40       | 378   | 416   | 357   | 307           |
| 60       | 406   | 462   | 395   | 316           |
| 80       | 458   | 535   | 438   | 338           |
| 100      | 476   | 584   | 472   | 345           |
| MB per 100 rebuilds | 171 | 296 | 199 | 62 |

The last row is the least-squares slope from round 20 on.

Every version grows. Since 2.1.0, part of the growth comes from the module graph's dense storage: dependencies and connections are kept in `Vec<Option<V>>` tables indexed by `DependencyId` / `ModuleGraphConnectionId`. These ids are never reused, and every rebuilt module gets new ones, so the tables grow with the number of ids ever allocated. [fix] bounds these tables and cuts the growth of 2.3.1 by about 70%.

The remaining growth is not covered by [fix]. One known source is `ExportsInfoArtifact`, which keeps a stale `ExportsInfoData` for every rebuilt module.

[fix]: https://github.com/Dennis273/rspack/tree/claude/vibrant-cannon-f4t37p
