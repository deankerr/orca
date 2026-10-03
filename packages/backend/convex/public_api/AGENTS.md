# Frozen public API V2

This is an independently maintained compatibility adapter for a published contract, not a Catalog
product. Its schema is intentionally different. Do not modernize field names, defaults, nulls,
pricing quirks, modality coverage, or provider semantics to match another backend schema.
Do not add features here during unrelated work. Repair broken data retrieval, validation and
serving while preserving the contract and compatibility tests.

The authoritative contract is `v2/schema.ts`; `v2/compatibility.ts` records source-mapping choices.

No Catalog imports, catalog joins, ingestion-clock dependencies, or ingestion-triggered refreshes.
The shared scan module is the only source-data dependency. Full modality coverage and
embedded provider names are required; product filtering/normalization loses published data.

Keep these instructions and the explanation of compatibility choices here rather than spreading API-specific rules through other products.
