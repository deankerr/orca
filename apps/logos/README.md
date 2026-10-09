# Entity Logo Service

Cloudflare Workers Static Assets serves public WebP logos at `/v1/{group}/{key}.webp`.
The public groups are `light`, `dark`, and `avatar`. Unknown logo image paths return the
requested group's fallback image.

## Source precedence

Each group resolves independently: LobeHub assets take precedence over manual group assets,
which take precedence over `sources/base/`. A base asset fills every group still missing that key.
Pinned LobeHub packages supply color variants where available; brand/text variants are excluded.

`dist/v1/manifest.json` records shadowed manual assets and incomplete group coverage. Generation
warns about incomplete manual keys and rejects non-square outputs or light/dark dimension mismatches.

## Generate and preview

Run from `apps/logos`:

```sh
bun run generate
bunx wrangler dev --port 8787
```

Fallback artwork comes from `branding/svg/orb-ring-mark.svg`; regenerate after editing it.
To preview the local assets in the web app, set `NEXT_PUBLIC_ORCA_LOGO_ORIGIN=http://localhost:8787`
in `apps/web/.env.local` and restart the web server. Remove the override to restore its default.
Discord images need a publicly accessible origin.

## Review and deploy

After generating assets, create a review sheet for a key:

```sh
bun run review coreweave
```

The sheet is written to `dist/review/{key}.png`. Light and dark outputs appear on pure white and
pure black; the avatar appears over a black/white alpha grid to reveal transparency.

```sh
bun run deploy
```

Deployment publishes the generated assets and fallback Worker.
