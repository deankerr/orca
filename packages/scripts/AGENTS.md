# Scripts

- [`scan-analysis/README.md`](scan-analysis/README.md) — select a stored scan and profile it in memory, with HTML or JSON output.
- [`@orca/json-profile`](../json-profile/README.md) — generic JSON profiling semantics.

Scan analysis shares Objects transport and scan parsing/extraction with the backend. Keep source
credentials out of reports, and keep source downloads in memory. Reports must identify the source,
capture time and selected population. Extend analyses when a concrete question requires them.
