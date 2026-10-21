---
name: orca-data-study
description: Conduct and document detailed studies of ORCA production data using read-only Convex queries or temporary table dumps. Use for collecting, analyzing, or restructuring study evidence; excludes simple inline observations and reading-only tasks.
---

# ORCA production-data studies

Follow orca-docs for writing style. The rules here override its maintenance and organization rules for dated studies.
Keep product decisions in `docs/orca`; keep detailed study measurements and executable methods in `docs/evidence`.

Simple one-line observations of production data use orca-docs and the note convention in `docs/orca/AGENTS.md`.
They do not require a study directory or supporting artifacts.

## Collect

- Define the question, population, observation horizon, and required distributions before collecting data.
- Identify and announce the production deployment; use an explicit deployment selector on every CLI command.
- Use the installed Convex CLI from `packages/backend` for sandboxed read-only queries or table dumps.
- Inspect CLI help for the installed version; prefer `convex run --inline-query` for bounded or paginated reads.
- Never push code, invoke mutations, change production configuration, or trigger ingestion to conduct a study.
- Exhaust pagination and record completeness; an initial page or silent row cap is not a population measurement.
- Keep bulk analysis local: download needed tables to memory or a temporary directory outside the repository.
- Keep credentials and raw production dumps out of committed evidence; remove temporary dumps when finished.
- Record collection times separately from the data horizon, plus source tables, tool versions, and schema provenance.
- Bracket multi-query collection with the ingestion horizon; record drift and exclusions without claiming atomicity.
- Record source counts and hashes when useful for reconciling separate reads; disclose absent or incomplete coverage.

## Analyze

- Preserve exact frequencies, denominators, and named outliers; means and percentiles supplement the distributions.
- Distinguish historical and active populations, overlapping memberships, missing values, and measured zeros.
- Define units, percentile conventions, time windows, and counting rules that change interpretation.
- Separate measured runtime costs from calculated scenarios; retain each experiment's query and assumptions.
- Keep collection and calculation code beside the evidence; Python scripts need no JavaScript workspace package.
- Let executable code explain procedures; retain enough definitions to interpret results without reading every script.
- Reconcile counts, distribution totals, and outliers before drawing conclusions in maintained product documentation.

## Retain

- Use `docs/evidence/YYYY-MM-DD-topic/`, dated by the study's first collection; keep all study files inside it.
- Use UTC throughout; simple dates need no qualifier, and precise provenance timestamps use `Z`.
- Record follow-up capture dates within the study; a later reassessment belongs in a new dated directory.
- Keep a short `README.md` with the question, scope, essential limitations, and a compact summary of observations.
- Aim for roughly 60 lines in the summary; preserve qualifications that materially affect interpretation.
- Store repeated records and exact frequencies as CSV; use Markdown tables for small comparisons.
- Split detail by the questions readers will investigate; avoid repeated entity records under different rankings.
- Explain CSV units and empty cells; retain nested JSON only when flattening would obscure its meaning.
- Retain executable queries against the measured schema; omit descriptions of the current application implementation.
- Put design choices, tradeoffs, and reassessment conditions in the owning `docs/orca` document, citing the study.
- Keep study results fixed as code evolves; record corrections explicitly instead of silently replacing measurements.
- State whether inputs were retained: repeating a method on live data does not reproduce the original population.
- Check scripts locally and verify preservation when changing formats; conversion needs no new production reads.
