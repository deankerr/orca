# ORCA marks

## Final preview variants

- **[orb-favicon.svg](orb-favicon.svg)** — high-contrast favicon: near-black
  (`#0a0a0a`) circle, white outline at 3 units on a 64-unit canvas, and a white
  eye patch. The gradient was removed and the patch enlarged for small browser
  tabs. A 2-unit outline looked too faint; 3 was preferred over 4.
  This is a reference copy, not a build input. The web app serves the matching
  `apps/web/app/icon.svg` and `apps/web/app/favicon.ico` (32px PNG inside an ICO).
  Future changes must be copied to the app SVG and the ICO regenerated.

- **[orb-fallback-avatar.svg](orb-fallback-avatar.svg)** — muted ring mark
  (`#737373`) on a near-black (`#0a0a0a`) square background. This reproduces the
  fallback avatar used for entities without a known logo, deliberately subdued
  so it is less likely to look like the entity's own branding.
  This is a reference copy, not a build input. The logo service instead reads
  `orb-ring-mark.svg` and applies colors in `apps/logos/src/fallback-image.ts`.
  It generates 128px WebP assets: avatar uses the colors above; dark uses
  `#d4d4d4` on transparent; light uses `#404040` on transparent.
  Run `bun run --cwd apps/logos generate` after changing the source or theme.

These variants were tested locally. The web app defaults to `https://logos.orb.town`,
including in development. For local previews, set `NEXT_PUBLIC_LOGO_SERVICE_ORIGIN`
to `http://localhost:8787` in `apps/web/.env.local` and restart the web dev server.
Saving these files does not deploy them.

## Original artwork

- **[orb-ring-mark.svg](orb-ring-mark.svg)** — original outlined orb; active
  geometry source for logo-service fallbacks.
- **[orb-mark.svg](orb-mark.svg)** — original shaded orb; starting point for the
  favicon, but no longer the artwork served by the app.
- **[orb-flat.svg](orb-flat.svg)** — retained original alternative; not wired into
  the favicon or fallback implementation.
