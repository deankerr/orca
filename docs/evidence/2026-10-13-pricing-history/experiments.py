"""Read-only query experiments and offline cost scenarios for the retained population.

Capture commands preserve the exact queries, model, and horizon used in this study.
They require its legacy schema; repeating them does not prove unchanged source data.
Compare recomputes scenarios from the saved CSVs without accessing any deployment.

Scenario assumptions: cold stable load, no cache hits/retries/reactive splits/byte caps.
Clock and model-header subscriptions are excluded. Client stages count the longest
chain of dependent results. Indexed collections are source calls, not measured
transaction accounting. Logical rows are not billed reads or measured latency.
Endpoint streams start after membership; aggregate queries independently discover
membership before collecting endpoint histories. Full histories include model moves.

Single append assumes one new quote on the largest endpoint, unchanged membership,
context and clock, and an unsplit 1000-row endpoint page. Each strategy reevaluates
one query. Result bytes describe its scope BEFORE the append, not network traffic.
Byte estimates are reused from the population capture, not remeasured by counts.
"""

import argparse
import csv
import json
import math
import subprocess
from pathlib import Path

from analyze import ROOT, compact, execute, now, write_csv


STUDY = Path(__file__).resolve().parent

COUNTS_QUERY = """const horizon = "2026-10-13T15:40:43.170Z";
const members = await ctx.db.query("v4_endpoint_listing_history")
  .withIndex("by_model_id_and_scan_at", q => q.eq("model_id", "z-ai/glm-5.2").lte("scan_at", horizon))
  .collect();
const ids = [...new Set(members.map(row => row.endpoint_id))].sort();
const endpoints = await Promise.all(ids.map(async endpoint_id => {
  const [context, prices] = await Promise.all([
    ctx.db.query("v4_endpoint_listing_history")
      .withIndex("by_endpoint_id_and_scan_at", q => q.eq("endpoint_id", endpoint_id).lte("scan_at", horizon)).collect(),
    ctx.db.query("v4_endpoint_pricing_history")
      .withIndex("by_endpoint_id_and_scan_at", q => q.eq("endpoint_id", endpoint_id).lte("scan_at", horizon)).collect()
  ]);
  return {endpoint_id, listing_rows: context.length, price_rows: prices.length};
}));
return {model_index_listing_rows: members.length, endpoints};"""

OBSERVATIONS_QUERY = """const members = await ctx.db.query("v4_endpoint_listing_history").withIndex("by_model_id_and_scan_at", q => q.eq("model_id", "z-ai/glm-5.2").lte("scan_at", "2026-10-13T15:40:43.170Z")).collect();
const ids = [...new Set(members.map(row => row.endpoint_id))].sort();
const result = await Promise.all(ids.map(async id => {
 const rows = await ctx.db.query("v4_endpoint_listing_history").withIndex("by_endpoint_id_and_scan_at", q => q.eq("endpoint_id", id).lte("scan_at", "2026-10-13T15:40:43.170Z")).collect();
 return {id, observations: rows.map(row => ({entity_kind: "endpoint", entity_id: row.endpoint_id, scan_at: row.scan_at, detected: row.state === "listed", model_id: row.model_id, provider_id: row.provider_id, provider_tag: row.provider_tag}))};
}));
return {result, metrics: await ctx.meta.getTransactionMetrics()};"""

PRICES_QUERY = """const members = await ctx.db.query("v4_endpoint_listing_history").withIndex("by_model_id_and_scan_at", q => q.eq("model_id", "z-ai/glm-5.2").lte("scan_at", "2026-10-13T15:40:43.170Z")).collect();
const ids = [...new Set(members.map(row => row.endpoint_id))].sort();
const result = await Promise.all(ids.map(async id => {
 const rows = await ctx.db.query("v4_endpoint_pricing_history").withIndex("by_endpoint_id_and_scan_at", q => q.eq("endpoint_id", id).lte("scan_at", "2026-10-13T15:40:43.170Z")).collect();
 return {id, prices: rows.map(row => { const {_id, _creationTime, ...value} = row; return value; })};
}));
return {result, metrics: await ctx.meta.getTransactionMetrics()};"""


def read_csv(name):
    with (STUDY / name).open(newline="") as stream:
        return list(csv.DictReader(stream))


def compare(output):
    endpoints = read_csv("glm-endpoints.csv")
    model = next(row for row in read_csv("outlier-models.csv") if row["model_id"] == "z-ai/glm-5.2")
    largest = max(read_csv("outlier-endpoints.csv"), key=lambda row: int(row["price_rows"]))
    memberships = int(model["model_index_listing_rows"])
    context = sum(int(row["listing_rows"]) for row in endpoints)
    prices = sum(int(row["price_rows"]) for row in endpoints)
    count = len(endpoints)
    context_bytes = int(model["listing_json_bytes"])
    price_bytes = int(model["price_json_bytes"])
    assert count == int(model["historical_endpoints"])
    assert context == int(model["full_endpoint_listing_rows"])
    assert prices == int(model["full_endpoint_price_rows"])
    assert largest["endpoint_id"] in {row["endpoint_id"] for row in endpoints}

    strategies = [
        ("context_then_prices", "Model context, then endpoint price pages",
         1 + count, 2, 1 + 2 * count, memberships + context + prices,
         int(largest["price_rows"]) + 1, int(largest["price_json_bytes"])),
        ("endpoint", "Membership, then endpoint context and price pages together",
         1 + 2 * count, 2, 1 + 2 * count, memberships + context + prices,
         int(largest["price_rows"]) + 1, int(largest["price_json_bytes"])),
        ("two_model", "Independent model context and price aggregates",
         2, 1, 2 + 2 * count, 2 * memberships + context + prices,
         memberships + prices + 1, price_bytes),
        ("one_model", "One model aggregate containing context and prices",
         1, 1, 1 + 2 * count, memberships + context + prices,
         memberships + context + prices + 1, context_bytes + price_bytes),
    ]
    fields = ("strategy", "description", "subscriptions", "client_stages", "indexed_collections",
              "logical_rows", "single_append_logical_rows", "single_append_prior_result_json_bytes")
    write_csv(output / "strategies.csv", [dict(zip(fields, row)) for row in strategies])

    pagination = []
    for target in (100, 250, 500, 1000):
        pages = [max(1, math.ceil(int(row["price_rows"]) / target)) for row in endpoints]
        pagination.append({
            "page_size": target, "price_pages": sum(pages), "history_subscriptions": 1 + sum(pages),
            "client_stages": 1 + max(pages), "endpoints_with_multiple_pages": sum(n > 1 for n in pages),
            "price_pages_per_stage": [sum(n >= stage for n in pages) for stage in range(1, max(pages) + 1)],
        })
    write_csv(output / "pagination.csv", pagination)


def capture(deployment, kind):
    queries = {"counts": COUNTS_QUERY, "observations": OBSERVATIONS_QUERY, "prices": PRICES_QUERY}
    started = now()
    captured = execute(deployment, queries[kind])
    if kind != "counts":
        result = captured.pop("result")
        size_script = '''import {getConvexSize} from "convex/values";
const value = JSON.parse(await Bun.stdin.text());
console.log(JSON.stringify({convex: getConvexSize(value), json: Buffer.byteLength(JSON.stringify(value))}));'''
        sizes = json.loads(subprocess.run(
            ["bun", "--eval", size_script], cwd=ROOT / "packages/backend", input=compact(result),
            text=True, capture_output=True, check=True,
        ).stdout)
        lengths = [len(row[kind]) for row in result]
        captured.update(return_convex_bytes=sizes["convex"], return_json_bytes=sizes["json"],
                        endpoints=len(result), rows=sum(lengths), largest_endpoint_array=max(lengths, default=0))
    return {"deployment": deployment, "started_at": started, "finished_at": now(),
            "kind": kind, "query": queries[kind], "capture": captured}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    offline = commands.add_parser("compare", help="Recalculate scenarios from saved CSVs; no database access")
    offline.add_argument("--output", required=True, type=Path)
    live = commands.add_parser("capture", help="Run one historical read-only query against an explicit deployment")
    live.add_argument("kind", choices=("counts", "observations", "prices"))
    live.add_argument("--deployment", required=True)
    live.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.command == "compare":
        args.output.mkdir(parents=True, exist_ok=False)
        compare(args.output)
    else:
        # Exclusive creation protects existing evidence before any remote request.
        with args.output.open("x") as stream:
            json.dump(capture(args.deployment, args.kind), stream, indent=2)
            stream.write("\n")


if __name__ == "__main__":
    main()
