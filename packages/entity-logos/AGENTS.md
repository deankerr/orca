# entity-logos

Builds a logo catalog from multiple sources into Next public assets plus a package-owned manifest.

## Running

`bun run logos build` — builds color + avatar logos into the web app public directory and writes the package manifest.

`bun run logos pull` — pulls provider logos from the remote source and downloads
missing provider icons into `sources/openrouter`. This command is intentionally
separate from `logos build`; normal builds must stay deterministic and offline.

`bun run logos build --pull` — runs `pull`, then `build`. Use this when
deliberately pulling current remote provider icons into the local source set
before rebuilding outputs.

Remote pulls are append-only. They may add new provider icons, but they must not
delete local files for providers that are absent upstream, because a remote source
can remove providers while their logos are still useful here. Pulls also skip
local files that already exist so patched remote logos are not overwritten.

## Output

```
output/
  manifest.json          { logos: [{ key, avatar?, color? }] }

../../apps/web/public/logos/
  avatar/                WebP files, key as filename
  color/                 PNG files, key as filename
```

The web app checks `entry.avatar` first, falls back to `entry.color`. The legacy
`apps/web/public/logos/web` directory is left in place, but this package does not
read, clean, or regenerate it.

## Key normalization

No source of truth for entity slugs exists. Keys are produced by lowercasing and stripping all `-` characters. This is intentional — dashes are not meaningful for matching purposes and zero real collisions result.

## Sources

LobeHub is the authoritative source for logos. It has the highest quality assets
and should not be overridden by local curated files. This is intentional: when a
logo previously added locally later appears in LobeHub, the LobeHub version wins
so updates do not require manually reviewing every overlapping local asset.

`sources/curated` fills gaps that LobeHub does not cover. It is not an override
layer for LobeHub.

`sources/openrouter` is lowest priority. The remote source provides useful
coverage, but its icons are inconsistent and sometimes low quality, so curated
files may patch remote entries.

Color logos (priority order, first match wins):

1. `@lobehub/icons-static-png/dark` — variant filtering: only base icon or `-color` variant kept
2. `sources/curated` — local gap-fill/patch logos (any supported image format, converted to PNG)
3. `sources/openrouter` — remote provider logos, useful coverage but lowest quality

Avatar logos:

- `@lobehub/icons-static-avatar/avatars` — WebP only, copied unchanged

## Bun

Default to Bun over Node.js. Prefer `Bun.Glob`, `Bun.file`, `Bun.write`, `Bun.$` over Node equivalents.
