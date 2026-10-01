# Local scan comparison

The local change-document script compares two stored scan JSONL artifacts through the
`projections/` library. It verifies apply/revert round trips and writes both projected catalogs,
the change document, and a summary.

```sh
bun run packages/scripts/change-document/index.ts <before.jsonl> <after.jsonl> <output-directory>
```

Keep local source and output files under git-ignored `data/` or a temporary directory.
These broad structural comparisons are independent of [V4 Events](../events/README.md)
and their reader-facing curation.
