# Failed Logo Quests

This ledger records logo searches that did not produce a publishable asset. Check it before
repeating a search, but treat it as a snapshot rather than proof that an entity still has no logo.
Retry a quest when the provider record changes, the owner launches a new site or official social
profile, or a brand repository becomes available.

Follow [ACQUIRING_LOGOS.md](./ACQUIRING_LOGOS.md) for the sourcing and review requirements. Do not
add a guessed logo, generated mark, wordmark, unrelated namesake, or third-party placeholder merely
to close one of these gaps.

## Crucible

- **Key:** `crucible`
- **Last searched:** 2026-07-24 UTC
- **Provider evidence:** The development provider record had no privacy, terms, status, or canonical
  website URL. Historical endpoints associated Crucible with free DeepSeek V4 Flash and Kimi K2.6
  routes, but did not identify the operator.
- **Sources checked:** The OpenRouter provider page, provider-page metadata, web search, installed
  LobeHub assets, aliases, and existing source assets.
- **Why it failed:** OpenRouter reported `https://example.com` as the provider base URL and used a
  favicon lookup for that placeholder. Search results were dominated by unrelated products named
  Crucible. No owner-controlled page or asset could be tied reliably to this provider.

## Enfer

- **Key:** `enfer`
- **Last searched:** 2026-07-24 UTC
- **Provider evidence:** The provider policies pointed to `https://enfer.ai`, operated by TQDM Inc.
- **Sources checked:** The official website, conventional website asset paths, web search, the
  official `enferAI` Hugging Face organization, installed LobeHub assets, aliases, and existing
  source assets.
- **Candidate rejected:** The official Hugging Face organization avatar was a transparent,
  rasterized `[e]` mark. A light/avatar source and white dark-mode inversion were built and reviewed,
  then removed after developer review because the artwork and raster edges looked poor at ORCA's
  display sizes.
- **Why it failed:** The official website publishes only the `enfer.ai` text wordmark and no usable
  standalone mark. The only compact owner-published candidate failed visual review.

## ModelRun

- **Key:** `modelrun`
- **Last searched:** 2026-07-24 UTC
- **Provider evidence:** The provider policies pointed to `https://modelrun.org`; the site's support
  address and redirects also established `https://www.runmodelrun.com` as owner-controlled.
- **Sources checked:** Both official websites and their HTML, conventional favicon and application
  icon paths, the official API hosts identified by OpenRouter, OpenRouter provider metadata, web
  search, installed LobeHub assets, aliases, and existing source assets.
- **Why it failed:** The marketing sites publish no logo, favicon, app icon, structured image, or
  standalone embedded mark. OpenRouter referenced a favicon lookup for an official API host, but the
  asset was unavailable; the API hosts either timed out or required authorization. No independent
  owner-published asset was found.
