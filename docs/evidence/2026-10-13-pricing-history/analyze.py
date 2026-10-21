"""Measure retained production history through the read-only Convex CLI.

Raw table downloads stay in memory. Output contains CSV aggregates, exact frequencies, and named outliers.
Run with explicit --deployment and --output arguments; no deployment is modified.
"""

import argparse
import bisect
import csv
import hashlib
import json
import math
import subprocess
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
PAGE_SIZE = 1000
BUCKETS = [(0, 0), (1, 1), (2, 2), (3, 5), (6, 10), (11, 25), (26, 50),
           (51, 100), (101, 250), (251, 500), (501, 1000), (1001, math.inf)]


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def compact(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def strip_system(row):
    return {key: value for key, value in row.items() if not key.startswith("_")}


def summary(values):
    ordered = sorted(values)
    frequencies = Counter(ordered)

    def percentile(fraction):
        return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]

    return {
        "population": len(ordered),
        "total": sum(ordered),
        "mean": sum(ordered) / len(ordered),
        "p50": percentile(0.50),
        "p90": percentile(0.90),
        "p95": percentile(0.95),
        "p99": percentile(0.99),
        "max": ordered[-1],
        "frequencies": dict(sorted(frequencies.items())),
        "buckets": {
            str(low) if low == high else f"{low}-{high}": sum(
                count for value, count in frequencies.items() if low <= value <= high
            )
            for low, high in BUCKETS
        },
    }


def group(rows, key):
    groups = defaultdict(list)

    for row in rows:
        groups[row[key]].append(row)

    for values in groups.values():
        values.sort(key=lambda row: (row.get("scan_at", ""), row.get("_creationTime", 0)))

    return groups


def quote(row):
    return {key: value for key, value in strip_system(row).items()
            if key not in ("endpoint_id", "scan_at")}


def meter(row, name):
    value = row.get("meters", {}).get(name)
    return None if value is None else Decimal(value)


def measure(tables, horizon):
    listings = tables["v4_endpoint_listing_history"]
    prices = tables["v4_endpoint_pricing_history"]
    by_endpoint = group(listings, "endpoint_id")
    prices_by_endpoint = group(prices, "endpoint_id")
    by_model = group(listings, "model_id")
    current_models = {row["model_id"] for row in tables["v4_models"]}
    days30 = (datetime.fromisoformat(horizon.replace("Z", "+00:00")) - timedelta(days=30)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    endpoint_metrics = []
    within_model = Counter()
    model_text_steps = Counter()
    transitions = Counter()
    daily_steps = Counter()
    samples = []
    first_quotes = repeated_quotes = 0

    for endpoint_id in sorted(set(by_endpoint) | set(prices_by_endpoint)):
        context = by_endpoint[endpoint_id]
        history = prices_by_endpoint[endpoint_id]
        times = [row["scan_at"] for row in context]
        metrics = {
            "endpoint_id": endpoint_id,
            "models": sorted({row["model_id"] for row in context}),
            "provider_tags": sorted({row["provider_tag"] for row in context}),
            "listing_rows": len(context),
            "price_rows": len(history),
            "listing_json_bytes": sum(len(compact(strip_system(row)).encode()) for row in context),
            "price_json_bytes": sum(len(compact(strip_system(row)).encode()) for row in history),
            "distinct_quotes": len({compact(quote(row)) for row in history}),
            "first_price_at": history[0]["scan_at"] if history else None,
            "last_price_at": history[-1]["scan_at"] if history else None,
            "listed_at_horizon": bool(context and context[-1]["state"] == "listed"),
            "latest_model": context[-1]["model_id"] if context else None,
            "price_rows_last30d": sum(row["scan_at"] > days30 for row in history),
            "continuous_quote_changes": 0,
            "text_price_steps": 0,
            "text_price_steps_last30d": 0,
        }

        for before, after in zip(context, context[1:]):
            for field in ("model_id", "provider_id", "provider_tag", "state"):
                transitions[field] += before[field] != after[field]

        previous = None
        previous_context_index = -1

        for row in history:
            index = bisect.bisect_right(times, row["scan_at"]) - 1
            active = context[index] if index >= 0 else None

            if active and active["state"] == "listed":
                within_model[active["model_id"]] += 1

            if previous is None:
                first_quotes += 1
            elif quote(previous) == quote(row):
                repeated_quotes += 1

            continuous = (
                previous is not None
                and previous_context_index >= 0
                and active is not None
                and context[previous_context_index]["state"] == "listed"
                and active["state"] == "listed"
                and all(item["state"] == "listed"
                        for item in context[previous_context_index + 1:index + 1])
            )

            if continuous and quote(previous) != quote(row):
                metrics["continuous_quote_changes"] += 1

            # Context changes carry a quote; a simultaneous context row starts a new span.
            same_trace = continuous and active["scan_at"] < row["scan_at"]
            changed = []

            if same_trace:
                for name in ("prompt", "completion"):
                    before, after = meter(previous, name), meter(row, name)

                    if before is not None and after is not None and before > 0 and after > 0 and before != after:
                        changed.append(name)

            if changed:
                metrics["text_price_steps"] += 1
                metrics["text_price_steps_last30d"] += row["scan_at"] > days30
                model_text_steps[active["model_id"]] += 1
                daily_steps[row["scan_at"][:10]] += 1

                if len(samples) < 10:
                    samples.append({"endpoint_id": endpoint_id, "scan_at": row["scan_at"],
                                    "meters": changed, "before": previous["meters"], "after": row["meters"]})

            previous = row
            previous_context_index = index

        endpoint_metrics.append(metrics)

    endpoint_map = {row["endpoint_id"]: row for row in endpoint_metrics}
    model_metrics = []

    for model_id, rows in sorted(by_model.items()):
        ids = {row["endpoint_id"] for row in rows}
        endpoints = [endpoint_map[endpoint_id] for endpoint_id in ids]
        metrics = {
            "model_id": model_id,
            "in_current_models_table": model_id in current_models,
            "historical_endpoints": len(ids),
            "listed_endpoints": sum(row["listed_at_horizon"] and row["latest_model"] == model_id for row in endpoints),
            "model_index_listing_rows": len(rows),
            "full_endpoint_listing_rows": sum(row["listing_rows"] for row in endpoints),
            "full_endpoint_price_rows": sum(row["price_rows"] for row in endpoints),
            "price_rows_during_membership": within_model[model_id],
            "listing_json_bytes": sum(row["listing_json_bytes"] for row in endpoints),
            "price_json_bytes": sum(row["price_json_bytes"] for row in endpoints),
            "max_endpoint_price_rows": max(row["price_rows"] for row in endpoints),
            "text_price_steps": model_text_steps[model_id],
            "price_pages_at_1000": sum(max(1, math.ceil(row["price_rows"] / 1000)) for row in endpoints),
        }
        model_metrics.append(metrics)

    def describe(rows, keys):
        return {key: summary([row[key] for row in rows]) for key in keys}

    def top(rows, key):
        return sorted(rows, key=lambda row: (-row[key], compact(row)))[:20]

    def concentration(rows, key):
        values = sorted((row[key] for row in rows), reverse=True)
        return {str(n): {"count": sum(values[:n]), "fraction": sum(values[:n]) / sum(values)}
                for n in (1, 5, 10, 20)}

    def duplicates(rows):
        counts = Counter((row["endpoint_id"], row["scan_at"]) for row in rows)
        return sum(count - 1 for count in counts.values())

    return {
        "population": {
            "historical_endpoints": len(endpoint_metrics), "historical_models": len(model_metrics),
            "listed_endpoints": sum(row["listed_at_horizon"] for row in endpoint_metrics),
            "models_with_listed_endpoints": sum(row["listed_endpoints"] > 0 for row in model_metrics),
            "current_model_rows": len(current_models),
            "current_models_without_listing_history": len(current_models - set(by_model)),
            "listing_states": dict(Counter(row["state"] for row in listings)),
            "listing_transitions": dict(transitions),
            "endpoints_with_multiple_models": sum(len(row["models"]) > 1 for row in endpoint_metrics),
            "first_quotes": first_quotes, "consecutive_identical_quotes": repeated_quotes,
        },
        "integrity": {
            "duplicate_listing_timestamps": duplicates(listings),
            "duplicate_price_timestamps": duplicates(prices),
            "prices_without_endpoint_listing": sorted(set(prices_by_endpoint) - set(by_endpoint)),
            "listings_without_endpoint_prices": sorted(set(by_endpoint) - set(prices_by_endpoint)),
            "price_rows_outside_listed_membership": len(prices) - sum(within_model.values()),
        },
        "endpoint_distributions": describe(endpoint_metrics, (
            "listing_rows", "price_rows", "distinct_quotes", "continuous_quote_changes",
            "text_price_steps", "price_rows_last30d", "text_price_steps_last30d")),
        "model_distributions": describe(model_metrics, (
            "historical_endpoints", "listed_endpoints", "model_index_listing_rows",
            "full_endpoint_listing_rows", "full_endpoint_price_rows", "price_rows_during_membership",
            "listing_json_bytes", "price_json_bytes", "text_price_steps", "price_pages_at_1000")),
        "active_model_distributions": describe([row for row in model_metrics if row["listed_endpoints"] > 0], (
            "historical_endpoints", "listed_endpoints", "full_endpoint_listing_rows",
            "full_endpoint_price_rows", "text_price_steps")),
        "concentration": {
            "endpoint_price_rows": concentration(endpoint_metrics, "price_rows"),
            "endpoint_text_price_steps": concentration(endpoint_metrics, "text_price_steps"),
            "model_price_rows_during_membership": concentration(model_metrics, "price_rows_during_membership"),
        },
        "top_endpoints_by_price_rows": top(endpoint_metrics, "price_rows"),
        "top_endpoints_by_listing_rows": top(endpoint_metrics, "listing_rows"),
        "top_models_by_price_rows": top(model_metrics, "full_endpoint_price_rows"),
        "top_models_by_listing_rows": top(model_metrics, "full_endpoint_listing_rows"),
        "top_models_by_endpoints": top(model_metrics, "historical_endpoints"),
        "daily_price_rows": dict(sorted(Counter(row["scan_at"][:10] for row in prices).items())),
        "daily_text_price_steps": dict(sorted(daily_steps.items())),
        "text_step_examples": samples,
    }


def execute(deployment, expression):
    command = ["bunx", "convex", "run", "--deployment", deployment,
               "--typecheck", "disable", "--codegen", "disable", "--inline-query", expression]
    result = subprocess.run(command, cwd=ROOT / "packages/backend", text=True, capture_output=True)

    if result.returncode:
        raise RuntimeError(result.stderr)

    return json.loads(result.stdout)


def write_csv(path, rows):
    """CSV has headers; lists/maps use compact JSON cells, booleans use true/false."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: compact(value) if isinstance(value, (dict, list, bool)) else value
                             for key, value in row.items()})


def flatten(values, prefix=""):
    for key, value in values.items():
        name = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            yield from flatten(value, name)
        else:
            yield {"field": name, "value": value.replace("+00:00", "Z") if isinstance(value, str) else value}


def write_report(report, output):
    """Preserve results without repeated outlier records or repeated metric names in frequencies.

    Each frequency file counts entities at an exact value; absent values have frequency zero.
    Buckets are derived from these frequencies using BUCKETS. No source records are retained.
    Outliers are the union of each original top-20 ranking, not a complete entity population.
    Daily files include dates observed in either series; a missing series on such a date is zero.
    Missing dates have no retained rows, which does not establish source availability that day.
    """
    source = report["source"]
    write_csv(output / "source.csv", list(flatten({key: value for key, value in source.items() if key != "tables"})))
    write_csv(output / "source-tables.csv", [{"table": key, **value} for key, value in source["tables"].items()])
    for name in ("population", "integrity"):
        write_csv(output / f"{name}.csv", list(flatten(report[name])))

    distributions = []
    for key, population in (("endpoint_distributions", "endpoints"),
                            ("model_distributions", "models"),
                            ("active_model_distributions", "listed-models")):
        for metric, values in report[key].items():
            distributions.append({"population": population, "metric": metric,
                                  **{k: v for k, v in values.items() if k not in ("frequencies", "buckets", "population")},
                                  "entities": values["population"]})
            write_csv(output / "frequencies" / population / f"{metric}.csv",
                      [{"value": value, "entities": count} for value, count in values["frequencies"].items()])
    write_csv(output / "distributions.csv", distributions)
    write_csv(output / "concentration.csv", [
        {"metric": metric, "top_n": n, **values}
        for metric, series in report["concentration"].items() for n, values in series.items()
    ])

    for population, identity, keys in (
        ("endpoints", "endpoint_id", ("top_endpoints_by_price_rows", "top_endpoints_by_listing_rows")),
        ("models", "model_id", ("top_models_by_price_rows", "top_models_by_listing_rows", "top_models_by_endpoints")),
    ):
        rows = {row[identity]: row for key in keys for row in report[key]}
        write_csv(output / f"outlier-{population}.csv", [rows[key] for key in sorted(rows)])

    dates = sorted(set(report["daily_price_rows"]) | set(report["daily_text_price_steps"]))
    write_csv(output / "daily.csv", [{"date": date, "price_rows": report["daily_price_rows"].get(date, 0),
                                     "text_price_steps": report["daily_text_price_steps"].get(date, 0)} for date in dates])
    write_csv(output / "text-step-examples.csv", report["text_step_examples"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deployment", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    started = now()

    def horizon():
        rows = execute(args.deployment, 'await ctx.db.query("v4_scan_ingestions").order("desc").take(1)')
        return rows[0]["scan_at"]

    def read(table):
        rows = []
        cursor = None

        while True:
            options = compact({"numItems": PAGE_SIZE, "cursor": cursor, "maximumBytesRead": 2_000_000})
            page = execute(args.deployment, f'await ctx.db.query({compact(table)}).order("desc").paginate({options})')
            rows.extend(page["page"])

            if page["isDone"]:
                print(f"{table}: {len(rows)} rows; pagination exhausted", flush=True)
                return rows

            if page["continueCursor"] == cursor:
                raise RuntimeError(f"{table}: cursor did not advance")

            cursor = page["continueCursor"]

    before = horizon()
    names = ["v4_endpoint_listing_history", "v4_endpoint_pricing_history", "v4_endpoints", "v4_models"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        tables = dict(zip(names, pool.map(read, names)))

    after = horizon()
    metadata = {}

    for name, rows in tables.items():
        metadata[name] = {
            "downloaded_rows": len(rows),
            "sha256": hashlib.sha256(compact(sorted(rows, key=lambda row: row["_id"])).encode()).hexdigest(),
            "min_scan_at": min(row["scan_at"] for row in rows),
            "max_scan_at": max(row["scan_at"] for row in rows),
            "rows_after_horizon": sum(row["scan_at"] > before for row in rows),
        }
        tables[name] = [row for row in rows if row["scan_at"] <= before]

    report = {
        "source": {
            "deployment": args.deployment,
            "cli_version": json.loads((ROOT / "packages/backend/node_modules/convex/package.json").read_text())["version"],
            "started_at": started,
            "finished_at": now(), "scan_horizon_before": before, "scan_horizon_after": after,
            "read_method": "CLI sandboxed readonly inline queries; all tables paginated to isDone",
            "requested_page_size": PAGE_SIZE, "maximum_bytes_read_per_page": 2_000_000,
            "tables": metadata,
            "percentiles": "nearest rank; p50 is not the mean of two middle values",
            "bytes": "sum of compact UTF-8 JSON rows without Convex system fields; excludes framing and protocol",
            "model_population": "model IDs present in retained listing history; full histories count moved endpoints under each historical model",
            "text_price_steps": "quote timestamp with a positive-to-positive numeric change to prompt or completion during continuous listing, excluding simultaneous context boundaries; earlier context changes carry the prior quote",
        },
        **measure(tables, before),
    }
    write_report(report, args.output)


if __name__ == "__main__":
    main()
