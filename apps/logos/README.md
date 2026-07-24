# Entity Logo Service

Standalone Cloudflare Workers Static Assets service for public WebP logo delivery.

## Contract

```txt
/v1/light/{key}.webp
/v1/dark/{key}.webp
/v1/avatar/{key}.webp
/v1/light/fallback.webp
/v1/dark/fallback.webp
/v1/avatar/fallback.webp
```

Known files are served directly by Cloudflare Static Assets. Unknown logo image paths fall through to `src/worker.ts`, which returns the fallback image for the requested group.

## Build

```sh
bun run build
```

The build reads pinned LobeHub packages, selects `*-color.webp` where available, ignores brand/text variants, processes every output through Sharp, and writes `dist/v1`. Every public image is emitted on a transparent 128×128 canvas. The build rejects non-square outputs and light/dark pairs with unequal dimensions.

`OUTPUT_IMAGE_SIZE_PX` in `src/build.ts` controls the generated image size.

Fallback image generation lives in `src/fallback-image.ts` while the placeholder mark is still temporary.

## Manual Sources

Source-controlled manual assets live in:

```txt
sources/base/
sources/light/
sources/dark/
sources/avatar/
```

Put one generic asset in `sources/base/` when it should fill every missing output group. Put files in `sources/light/`, `sources/dark/`, or `sources/avatar/` only when that group has a real variant.

The build resolves each group independently:

```txt
resolved[group][key] = lobehub[group][key] ?? manual[group][key] ?? manual.base[key]
```

LobeHub always wins when both sources provide the same group/key. Shadowed manual assets are listed in `dist/v1/manifest.json` so they can be cleaned up deliberately.

Manual keys that still resolve to only some public groups after LobeHub, group overrides, and base assets are applied print a build warning and are listed in `manifest.json`.

For the acquisition workflow, source selection rules, and developer-review checklist, see
[ACQUIRING_LOGOS.md](./ACQUIRING_LOGOS.md).

## Review

After building, generate the standard review sheet for a key:

```sh
bun run review coreweave
```

The sheet is written to `dist/review/{key}.png`. Light and dark outputs are shown on pure white and
pure black. The avatar is shown over a pure black/white alpha grid that reveals the exact transparent
canvas without introducing a brand or UI color.

## Deploy

```sh
bun run deploy
```

`wrangler.jsonc` keeps `run_worker_first` unset, so static asset hits do not invoke the Worker.
