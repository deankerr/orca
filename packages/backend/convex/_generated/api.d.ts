/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as objects_backend from "../objects/backend.js";
import type * as objects_bytes from "../objects/bytes.js";
import type * as objects_index from "../objects/index.js";
import type * as objects_local from "../objects/local.js";
import type * as objects_locators from "../objects/locators.js";
import type * as objects_r2 from "../objects/r2.js";
import type * as objects_remote from "../objects/remote.js";
import type * as objects_remove from "../objects/remove.js";
import type * as objects_table from "../objects/table.js";
import type * as public_api_v2_cache from "../public_api/v2/cache.js";
import type * as public_api_v2_compatibility from "../public_api/v2/compatibility.js";
import type * as public_api_v2_http from "../public_api/v2/http.js";
import type * as public_api_v2_snapshot from "../public_api/v2/snapshot.js";
import type * as public_api_v2_table from "../public_api/v2/table.js";
import type * as scan_action from "../scan/action.js";
import type * as scan_artifact from "../scan/artifact.js";
import type * as scan_scan from "../scan/scan.js";
import type * as shared_entityLogo from "../shared/entityLogo.js";
import type * as shared_formatters from "../shared/formatters.js";
import type * as shared_pricing from "../shared/pricing.js";
import type * as shared_utils from "../shared/utils.js";
import type * as v4_alerts_batch from "../v4/alerts/batch.js";
import type * as v4_alerts_curate from "../v4/alerts/curate.js";
import type * as v4_alerts_facts from "../v4/alerts/facts.js";
import type * as v4_alerts_filter from "../v4/alerts/filter.js";
import type * as v4_alerts_numbers from "../v4/alerts/numbers.js";
import type * as v4_alerts_pipelines from "../v4/alerts/pipelines.js";
import type * as v4_alerts_renderers_discord_batchCards from "../v4/alerts/renderers/discord/batchCards.js";
import type * as v4_alerts_renderers_discord_card from "../v4/alerts/renderers/discord/card.js";
import type * as v4_alerts_renderers_discord_display from "../v4/alerts/renderers/discord/display.js";
import type * as v4_alerts_renderers_discord_endpointCard from "../v4/alerts/renderers/discord/endpointCard.js";
import type * as v4_alerts_renderers_discord_fields from "../v4/alerts/renderers/discord/fields.js";
import type * as v4_alerts_renderers_discord_index from "../v4/alerts/renderers/discord/index.js";
import type * as v4_alerts_renderers_discord_modelCard from "../v4/alerts/renderers/discord/modelCard.js";
import type * as v4_alerts_renderers_discord_pricing from "../v4/alerts/renderers/discord/pricing.js";
import type * as v4_alerts_renderers_discord_providerCard from "../v4/alerts/renderers/discord/providerCard.js";
import type * as v4_alerts_renderers_json from "../v4/alerts/renderers/json.js";
import type * as v4_alerts_renderers_pricing from "../v4/alerts/renderers/pricing.js";
import type * as v4_alerts_renderers_text from "../v4/alerts/renderers/text.js";
import type * as v4_alerts_select from "../v4/alerts/select.js";
import type * as v4_catalog_backfill from "../v4/catalog/backfill.js";
import type * as v4_catalog_changes from "../v4/catalog/changes.js";
import type * as v4_catalog_endpoints_ingest from "../v4/catalog/endpoints/ingest.js";
import type * as v4_catalog_endpoints_query from "../v4/catalog/endpoints/query.js";
import type * as v4_catalog_endpoints_table from "../v4/catalog/endpoints/table.js";
import type * as v4_catalog_models_ingest from "../v4/catalog/models/ingest.js";
import type * as v4_catalog_models_query from "../v4/catalog/models/query.js";
import type * as v4_catalog_models_table from "../v4/catalog/models/table.js";
import type * as v4_catalog_project from "../v4/catalog/project.js";
import type * as v4_catalog_providers_ingest from "../v4/catalog/providers/ingest.js";
import type * as v4_catalog_providers_query from "../v4/catalog/providers/query.js";
import type * as v4_catalog_providers_table from "../v4/catalog/providers/table.js";
import type * as v4_clock from "../v4/clock.js";
import type * as v4_discord from "../v4/discord.js";
import type * as v4_eventRenderers_feed from "../v4/eventRenderers/feed.js";
import type * as v4_events_compare from "../v4/events/compare.js";
import type * as v4_events_decode from "../v4/events/decode.js";
import type * as v4_events_ingest from "../v4/events/ingest.js";
import type * as v4_events_prepare from "../v4/events/prepare.js";
import type * as v4_events_query from "../v4/events/query.js";
import type * as v4_events_table from "../v4/events/table.js";
import type * as v4_facts from "../v4/facts.js";
import type * as v4_feed from "../v4/feed.js";
import type * as v4_feedHttp from "../v4/feedHttp.js";
import type * as v4_fields from "../v4/fields.js";
import type * as v4_history_listings_ingest from "../v4/history/listings/ingest.js";
import type * as v4_history_listings_query from "../v4/history/listings/query.js";
import type * as v4_history_listings_table from "../v4/history/listings/table.js";
import type * as v4_history_pagination from "../v4/history/pagination.js";
import type * as v4_history_pricing_ingest from "../v4/history/pricing/ingest.js";
import type * as v4_history_pricing_query from "../v4/history/pricing/query.js";
import type * as v4_history_pricing_table from "../v4/history/pricing/table.js";
import type * as v4_history_stats_ingest from "../v4/history/stats/ingest.js";
import type * as v4_history_stats_query from "../v4/history/stats/query.js";
import type * as v4_history_stats_table from "../v4/history/stats/table.js";
import type * as v4_ingestion_initialization from "../v4/ingestion/initialization.js";
import type * as v4_ingestion_progress from "../v4/ingestion/progress.js";
import type * as v4_ingestion_release from "../v4/ingestion/release.js";
import type * as v4_ingestion_table from "../v4/ingestion/table.js";
import type * as v4_ingestion_work from "../v4/ingestion/work.js";
import type * as v4_initialize from "../v4/initialize.js";
import type * as v4_json from "../v4/json.js";
import type * as v4_monitor from "../v4/monitor.js";
import type * as v4_pricing from "../v4/pricing.js";
import type * as v4_refreshStats from "../v4/refreshStats.js";
import type * as v4_retry from "../v4/retry.js";
import type * as v4_routine from "../v4/routine.js";
import type * as v4_scan_artifacts from "../v4/scan/artifacts.js";
import type * as v4_scan_entities from "../v4/scan/entities.js";
import type * as v4_scan_extract from "../v4/scan/extract.js";
import type * as v4_scan_load from "../v4/scan/load.js";
import type * as v4_scan_time from "../v4/scan/time.js";
import type * as v4_stats_ingest from "../v4/stats/ingest.js";
import type * as v4_stats_query from "../v4/stats/query.js";
import type * as v4_stats_table from "../v4/stats/table.js";
import type * as workflows_analytics_manual from "../workflows/analytics/manual.js";
import type * as workflows_analytics_process from "../workflows/analytics/process.js";
import type * as workflows_analytics_scheduled from "../workflows/analytics/scheduled.js";
import type * as workflows_topApps_manual from "../workflows/topApps/manual.js";
import type * as workflows_topApps_process from "../workflows/topApps/process.js";
import type * as workflows_topApps_scheduled from "../workflows/topApps/scheduled.js";
import type * as workflows_topApps_targets from "../workflows/topApps/targets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  http: typeof http;
  init: typeof init;
  "objects/backend": typeof objects_backend;
  "objects/bytes": typeof objects_bytes;
  "objects/index": typeof objects_index;
  "objects/local": typeof objects_local;
  "objects/locators": typeof objects_locators;
  "objects/r2": typeof objects_r2;
  "objects/remote": typeof objects_remote;
  "objects/remove": typeof objects_remove;
  "objects/table": typeof objects_table;
  "public_api/v2/cache": typeof public_api_v2_cache;
  "public_api/v2/compatibility": typeof public_api_v2_compatibility;
  "public_api/v2/http": typeof public_api_v2_http;
  "public_api/v2/snapshot": typeof public_api_v2_snapshot;
  "public_api/v2/table": typeof public_api_v2_table;
  "scan/action": typeof scan_action;
  "scan/artifact": typeof scan_artifact;
  "scan/scan": typeof scan_scan;
  "shared/entityLogo": typeof shared_entityLogo;
  "shared/formatters": typeof shared_formatters;
  "shared/pricing": typeof shared_pricing;
  "shared/utils": typeof shared_utils;
  "v4/alerts/batch": typeof v4_alerts_batch;
  "v4/alerts/curate": typeof v4_alerts_curate;
  "v4/alerts/facts": typeof v4_alerts_facts;
  "v4/alerts/filter": typeof v4_alerts_filter;
  "v4/alerts/numbers": typeof v4_alerts_numbers;
  "v4/alerts/pipelines": typeof v4_alerts_pipelines;
  "v4/alerts/renderers/discord/batchCards": typeof v4_alerts_renderers_discord_batchCards;
  "v4/alerts/renderers/discord/card": typeof v4_alerts_renderers_discord_card;
  "v4/alerts/renderers/discord/display": typeof v4_alerts_renderers_discord_display;
  "v4/alerts/renderers/discord/endpointCard": typeof v4_alerts_renderers_discord_endpointCard;
  "v4/alerts/renderers/discord/fields": typeof v4_alerts_renderers_discord_fields;
  "v4/alerts/renderers/discord/index": typeof v4_alerts_renderers_discord_index;
  "v4/alerts/renderers/discord/modelCard": typeof v4_alerts_renderers_discord_modelCard;
  "v4/alerts/renderers/discord/pricing": typeof v4_alerts_renderers_discord_pricing;
  "v4/alerts/renderers/discord/providerCard": typeof v4_alerts_renderers_discord_providerCard;
  "v4/alerts/renderers/json": typeof v4_alerts_renderers_json;
  "v4/alerts/renderers/pricing": typeof v4_alerts_renderers_pricing;
  "v4/alerts/renderers/text": typeof v4_alerts_renderers_text;
  "v4/alerts/select": typeof v4_alerts_select;
  "v4/catalog/backfill": typeof v4_catalog_backfill;
  "v4/catalog/changes": typeof v4_catalog_changes;
  "v4/catalog/endpoints/ingest": typeof v4_catalog_endpoints_ingest;
  "v4/catalog/endpoints/query": typeof v4_catalog_endpoints_query;
  "v4/catalog/endpoints/table": typeof v4_catalog_endpoints_table;
  "v4/catalog/models/ingest": typeof v4_catalog_models_ingest;
  "v4/catalog/models/query": typeof v4_catalog_models_query;
  "v4/catalog/models/table": typeof v4_catalog_models_table;
  "v4/catalog/project": typeof v4_catalog_project;
  "v4/catalog/providers/ingest": typeof v4_catalog_providers_ingest;
  "v4/catalog/providers/query": typeof v4_catalog_providers_query;
  "v4/catalog/providers/table": typeof v4_catalog_providers_table;
  "v4/clock": typeof v4_clock;
  "v4/discord": typeof v4_discord;
  "v4/eventRenderers/feed": typeof v4_eventRenderers_feed;
  "v4/events/compare": typeof v4_events_compare;
  "v4/events/decode": typeof v4_events_decode;
  "v4/events/ingest": typeof v4_events_ingest;
  "v4/events/prepare": typeof v4_events_prepare;
  "v4/events/query": typeof v4_events_query;
  "v4/events/table": typeof v4_events_table;
  "v4/facts": typeof v4_facts;
  "v4/feed": typeof v4_feed;
  "v4/feedHttp": typeof v4_feedHttp;
  "v4/fields": typeof v4_fields;
  "v4/history/listings/ingest": typeof v4_history_listings_ingest;
  "v4/history/listings/query": typeof v4_history_listings_query;
  "v4/history/listings/table": typeof v4_history_listings_table;
  "v4/history/pagination": typeof v4_history_pagination;
  "v4/history/pricing/ingest": typeof v4_history_pricing_ingest;
  "v4/history/pricing/query": typeof v4_history_pricing_query;
  "v4/history/pricing/table": typeof v4_history_pricing_table;
  "v4/history/stats/ingest": typeof v4_history_stats_ingest;
  "v4/history/stats/query": typeof v4_history_stats_query;
  "v4/history/stats/table": typeof v4_history_stats_table;
  "v4/ingestion/initialization": typeof v4_ingestion_initialization;
  "v4/ingestion/progress": typeof v4_ingestion_progress;
  "v4/ingestion/release": typeof v4_ingestion_release;
  "v4/ingestion/table": typeof v4_ingestion_table;
  "v4/ingestion/work": typeof v4_ingestion_work;
  "v4/initialize": typeof v4_initialize;
  "v4/json": typeof v4_json;
  "v4/monitor": typeof v4_monitor;
  "v4/pricing": typeof v4_pricing;
  "v4/refreshStats": typeof v4_refreshStats;
  "v4/retry": typeof v4_retry;
  "v4/routine": typeof v4_routine;
  "v4/scan/artifacts": typeof v4_scan_artifacts;
  "v4/scan/entities": typeof v4_scan_entities;
  "v4/scan/extract": typeof v4_scan_extract;
  "v4/scan/load": typeof v4_scan_load;
  "v4/scan/time": typeof v4_scan_time;
  "v4/stats/ingest": typeof v4_stats_ingest;
  "v4/stats/query": typeof v4_stats_query;
  "v4/stats/table": typeof v4_stats_table;
  "workflows/analytics/manual": typeof workflows_analytics_manual;
  "workflows/analytics/process": typeof workflows_analytics_process;
  "workflows/analytics/scheduled": typeof workflows_analytics_scheduled;
  "workflows/topApps/manual": typeof workflows_topApps_manual;
  "workflows/topApps/process": typeof workflows_topApps_process;
  "workflows/topApps/scheduled": typeof workflows_topApps_scheduled;
  "workflows/topApps/targets": typeof workflows_topApps_targets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
