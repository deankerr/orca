/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alerts_dev from "../alerts/dev.js";
import type * as alerts_dispatcher from "../alerts/dispatcher.js";
import type * as catalog_endpoints_index from "../catalog/endpoints/index.js";
import type * as catalog_endpoints_projection from "../catalog/endpoints/projection.js";
import type * as catalog_endpoints_queries from "../catalog/endpoints/queries.js";
import type * as catalog_endpoints_table from "../catalog/endpoints/table.js";
import type * as catalog_models_index from "../catalog/models/index.js";
import type * as catalog_models_projection from "../catalog/models/projection.js";
import type * as catalog_models_queries from "../catalog/models/queries.js";
import type * as catalog_models_table from "../catalog/models/table.js";
import type * as catalog_providers_index from "../catalog/providers/index.js";
import type * as catalog_providers_projection from "../catalog/providers/projection.js";
import type * as catalog_providers_queries from "../catalog/providers/queries.js";
import type * as catalog_providers_table from "../catalog/providers/table.js";
import type * as catalog_shared_availability from "../catalog/shared/availability.js";
import type * as changeBatch from "../changeBatch.js";
import type * as changeEvents_events from "../changeEvents/events.js";
import type * as changeEvents_ingestion from "../changeEvents/ingestion.js";
import type * as changeEvents_ingestion_extract from "../changeEvents/ingestion/extract.js";
import type * as changeEvents_ingestion_store from "../changeEvents/ingestion/store.js";
import type * as changeEvents_processing from "../changeEvents/processing.js";
import type * as changeEvents_reset from "../changeEvents/reset.js";
import type * as changes_index from "../changes/index.js";
import type * as changes_projection from "../changes/projection.js";
import type * as changes_queries from "../changes/queries.js";
import type * as changes_table from "../changes/table.js";
import type * as crons from "../crons.js";
import type * as discord_admin from "../discord/admin.js";
import type * as discord_client from "../discord/client.js";
import type * as discord_constants from "../discord/constants.js";
import type * as discord_interactions from "../discord/interactions.js";
import type * as discord_messages from "../discord/messages.js";
import type * as discord_subscriptions from "../discord/subscriptions.js";
import type * as discord_subscriptions_table from "../discord/subscriptions/table.js";
import type * as discord_utils from "../discord/utils.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as lib_functionSpec from "../lib/functionSpec.js";
import type * as lib_paginateAndProcess from "../lib/paginateAndProcess.js";
import type * as locks_index from "../locks/index.js";
import type * as locks_occupy from "../locks/occupy.js";
import type * as locks_table from "../locks/table.js";
import type * as models from "../models.js";
import type * as monitor from "../monitor.js";
import type * as objects_backend from "../objects/backend.js";
import type * as objects_bytes from "../objects/bytes.js";
import type * as objects_http from "../objects/http.js";
import type * as objects_index from "../objects/index.js";
import type * as objects_locators from "../objects/locators.js";
import type * as objects_r2 from "../objects/r2.js";
import type * as objects_remove from "../objects/remove.js";
import type * as objects_table from "../objects/table.js";
import type * as projections_diff from "../projections/diff.js";
import type * as projections_documents from "../projections/documents.js";
import type * as projections_fromScan from "../projections/fromScan.js";
import type * as projections_index from "../projections/index.js";
import type * as providers from "../providers.js";
import type * as public_api_v2_cache from "../public_api/v2/cache.js";
import type * as public_api_v2_http from "../public_api/v2/http.js";
import type * as public_api_v2_queries from "../public_api/v2/queries.js";
import type * as public_api_v2_table from "../public_api/v2/table.js";
import type * as public_api_v2_transform from "../public_api/v2/transform.js";
import type * as scan_action from "../scan/action.js";
import type * as scan_artifact from "../scan/artifact.js";
import type * as scan_inspection from "../scan/inspection.js";
import type * as scan_scan from "../scan/scan.js";
import type * as shared_entityLogo from "../shared/entityLogo.js";
import type * as shared_formatters from "../shared/formatters.js";
import type * as shared_groups from "../shared/groups.js";
import type * as shared_pricing from "../shared/pricing.js";
import type * as shared_utils from "../shared/utils.js";
import type * as snapshots_archives_table from "../snapshots/archives/table.js";
import type * as snapshots_crawl_cron from "../snapshots/crawl/cron.js";
import type * as snapshots_crawl_main from "../snapshots/crawl/main.js";
import type * as snapshots_crawl_outputs from "../snapshots/crawl/outputs.js";
import type * as snapshots_materialize_main from "../snapshots/materialize/main.js";
import type * as snapshots_materialize_output from "../snapshots/materialize/output.js";
import type * as snapshots_materialize_validators_endpoints from "../snapshots/materialize/validators/endpoints.js";
import type * as snapshots_materialize_validators_models from "../snapshots/materialize/validators/models.js";
import type * as snapshots_materialize_validators_providers from "../snapshots/materialize/validators/providers.js";
import type * as snapshots_materializedChanges_inputs from "../snapshots/materializedChanges/inputs.js";
import type * as snapshots_materializedChanges_main from "../snapshots/materializedChanges/main.js";
import type * as snapshots_materializedChanges_output from "../snapshots/materializedChanges/output.js";
import type * as snapshots_materializedChanges_process from "../snapshots/materializedChanges/process.js";
import type * as snapshots_shared_bundle from "../snapshots/shared/bundle.js";
import type * as textFeed_http from "../textFeed/http.js";
import type * as textFeed_markdown from "../textFeed/markdown.js";
import type * as textFeed_markdown_entity from "../textFeed/markdown/entity.js";
import type * as textFeed_markdown_fields from "../textFeed/markdown/fields.js";
import type * as v3_ingest from "../v3/ingest.js";
import type * as v3_ingestions from "../v3/ingestions.js";
import type * as v3_projections_queries from "../v3/projections/queries.js";
import type * as v3_public_endpoints from "../v3/public/endpoints.js";
import type * as v3_public_entityOverview from "../v3/public/entityOverview.js";
import type * as v3_public_models from "../v3/public/models.js";
import type * as v3_public_pricingHistory from "../v3/public/pricingHistory.js";
import type * as v3_public_providers from "../v3/public/providers.js";
import type * as v3_public_stats from "../v3/public/stats.js";
import type * as v3_pull from "../v3/pull.js";
import type * as v3_pullArtifacts from "../v3/pullArtifacts.js";
import type * as v3_refreshProviders from "../v3/refreshProviders.js";
import type * as v4_backfill from "../v4/backfill.js";
import type * as v4_catalog_changes from "../v4/catalog/changes.js";
import type * as v4_catalog_endpoints from "../v4/catalog/endpoints.js";
import type * as v4_catalog_entities from "../v4/catalog/entities.js";
import type * as v4_catalog_fields from "../v4/catalog/fields.js";
import type * as v4_catalog_models from "../v4/catalog/models.js";
import type * as v4_catalog_project from "../v4/catalog/project.js";
import type * as v4_catalog_providers from "../v4/catalog/providers.js";
import type * as v4_catalog_table from "../v4/catalog/table.js";
import type * as v4_history_listings from "../v4/history/listings.js";
import type * as v4_history_pagination from "../v4/history/pagination.js";
import type * as v4_history_pricing from "../v4/history/pricing.js";
import type * as v4_history_stats from "../v4/history/stats.js";
import type * as v4_history_table from "../v4/history/table.js";
import type * as v4_ingestion_clock from "../v4/ingestion/clock.js";
import type * as v4_ingestion_initialize from "../v4/ingestion/initialize.js";
import type * as v4_ingestion_modules from "../v4/ingestion/modules.js";
import type * as v4_ingestion_progress from "../v4/ingestion/progress.js";
import type * as v4_ingestion_registry from "../v4/ingestion/registry.js";
import type * as v4_ingestion_routine from "../v4/ingestion/routine.js";
import type * as v4_ingestion_state from "../v4/ingestion/state.js";
import type * as v4_ingestion_step from "../v4/ingestion/step.js";
import type * as v4_ingestion_table from "../v4/ingestion/table.js";
import type * as v4_json from "../v4/json.js";
import type * as v4_pricing from "../v4/pricing.js";
import type * as v4_scan from "../v4/scan.js";
import type * as v4_scan_entities from "../v4/scan/entities.js";
import type * as v4_scan_extract from "../v4/scan/extract.js";
import type * as v4_scan_time from "../v4/scan/time.js";
import type * as v4_stats_current from "../v4/stats/current.js";
import type * as v4_stats_table from "../v4/stats/table.js";
import type * as views_apply from "../views/apply.js";
import type * as views_consume from "../views/consume.js";
import type * as views_exports from "../views/exports.js";
import type * as views_fromProjection from "../views/fromProjection.js";
import type * as views_index from "../views/index.js";
import type * as views_writes from "../views/writes.js";
import type * as workflows_analytics_manual from "../workflows/analytics/manual.js";
import type * as workflows_analytics_process from "../workflows/analytics/process.js";
import type * as workflows_analytics_scheduled from "../workflows/analytics/scheduled.js";
import type * as workflows_topApps_manual from "../workflows/topApps/manual.js";
import type * as workflows_topApps_process from "../workflows/topApps/process.js";
import type * as workflows_topApps_scheduled from "../workflows/topApps/scheduled.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "alerts/dev": typeof alerts_dev;
  "alerts/dispatcher": typeof alerts_dispatcher;
  "catalog/endpoints/index": typeof catalog_endpoints_index;
  "catalog/endpoints/projection": typeof catalog_endpoints_projection;
  "catalog/endpoints/queries": typeof catalog_endpoints_queries;
  "catalog/endpoints/table": typeof catalog_endpoints_table;
  "catalog/models/index": typeof catalog_models_index;
  "catalog/models/projection": typeof catalog_models_projection;
  "catalog/models/queries": typeof catalog_models_queries;
  "catalog/models/table": typeof catalog_models_table;
  "catalog/providers/index": typeof catalog_providers_index;
  "catalog/providers/projection": typeof catalog_providers_projection;
  "catalog/providers/queries": typeof catalog_providers_queries;
  "catalog/providers/table": typeof catalog_providers_table;
  "catalog/shared/availability": typeof catalog_shared_availability;
  changeBatch: typeof changeBatch;
  "changeEvents/events": typeof changeEvents_events;
  "changeEvents/ingestion": typeof changeEvents_ingestion;
  "changeEvents/ingestion/extract": typeof changeEvents_ingestion_extract;
  "changeEvents/ingestion/store": typeof changeEvents_ingestion_store;
  "changeEvents/processing": typeof changeEvents_processing;
  "changeEvents/reset": typeof changeEvents_reset;
  "changes/index": typeof changes_index;
  "changes/projection": typeof changes_projection;
  "changes/queries": typeof changes_queries;
  "changes/table": typeof changes_table;
  crons: typeof crons;
  "discord/admin": typeof discord_admin;
  "discord/client": typeof discord_client;
  "discord/constants": typeof discord_constants;
  "discord/interactions": typeof discord_interactions;
  "discord/messages": typeof discord_messages;
  "discord/subscriptions": typeof discord_subscriptions;
  "discord/subscriptions/table": typeof discord_subscriptions_table;
  "discord/utils": typeof discord_utils;
  http: typeof http;
  init: typeof init;
  "lib/functionSpec": typeof lib_functionSpec;
  "lib/paginateAndProcess": typeof lib_paginateAndProcess;
  "locks/index": typeof locks_index;
  "locks/occupy": typeof locks_occupy;
  "locks/table": typeof locks_table;
  models: typeof models;
  monitor: typeof monitor;
  "objects/backend": typeof objects_backend;
  "objects/bytes": typeof objects_bytes;
  "objects/http": typeof objects_http;
  "objects/index": typeof objects_index;
  "objects/locators": typeof objects_locators;
  "objects/r2": typeof objects_r2;
  "objects/remove": typeof objects_remove;
  "objects/table": typeof objects_table;
  "projections/diff": typeof projections_diff;
  "projections/documents": typeof projections_documents;
  "projections/fromScan": typeof projections_fromScan;
  "projections/index": typeof projections_index;
  providers: typeof providers;
  "public_api/v2/cache": typeof public_api_v2_cache;
  "public_api/v2/http": typeof public_api_v2_http;
  "public_api/v2/queries": typeof public_api_v2_queries;
  "public_api/v2/table": typeof public_api_v2_table;
  "public_api/v2/transform": typeof public_api_v2_transform;
  "scan/action": typeof scan_action;
  "scan/artifact": typeof scan_artifact;
  "scan/inspection": typeof scan_inspection;
  "scan/scan": typeof scan_scan;
  "shared/entityLogo": typeof shared_entityLogo;
  "shared/formatters": typeof shared_formatters;
  "shared/groups": typeof shared_groups;
  "shared/pricing": typeof shared_pricing;
  "shared/utils": typeof shared_utils;
  "snapshots/archives/table": typeof snapshots_archives_table;
  "snapshots/crawl/cron": typeof snapshots_crawl_cron;
  "snapshots/crawl/main": typeof snapshots_crawl_main;
  "snapshots/crawl/outputs": typeof snapshots_crawl_outputs;
  "snapshots/materialize/main": typeof snapshots_materialize_main;
  "snapshots/materialize/output": typeof snapshots_materialize_output;
  "snapshots/materialize/validators/endpoints": typeof snapshots_materialize_validators_endpoints;
  "snapshots/materialize/validators/models": typeof snapshots_materialize_validators_models;
  "snapshots/materialize/validators/providers": typeof snapshots_materialize_validators_providers;
  "snapshots/materializedChanges/inputs": typeof snapshots_materializedChanges_inputs;
  "snapshots/materializedChanges/main": typeof snapshots_materializedChanges_main;
  "snapshots/materializedChanges/output": typeof snapshots_materializedChanges_output;
  "snapshots/materializedChanges/process": typeof snapshots_materializedChanges_process;
  "snapshots/shared/bundle": typeof snapshots_shared_bundle;
  "textFeed/http": typeof textFeed_http;
  "textFeed/markdown": typeof textFeed_markdown;
  "textFeed/markdown/entity": typeof textFeed_markdown_entity;
  "textFeed/markdown/fields": typeof textFeed_markdown_fields;
  "v3/ingest": typeof v3_ingest;
  "v3/ingestions": typeof v3_ingestions;
  "v3/projections/queries": typeof v3_projections_queries;
  "v3/public/endpoints": typeof v3_public_endpoints;
  "v3/public/entityOverview": typeof v3_public_entityOverview;
  "v3/public/models": typeof v3_public_models;
  "v3/public/pricingHistory": typeof v3_public_pricingHistory;
  "v3/public/providers": typeof v3_public_providers;
  "v3/public/stats": typeof v3_public_stats;
  "v3/pull": typeof v3_pull;
  "v3/pullArtifacts": typeof v3_pullArtifacts;
  "v3/refreshProviders": typeof v3_refreshProviders;
  "v4/backfill": typeof v4_backfill;
  "v4/catalog/changes": typeof v4_catalog_changes;
  "v4/catalog/endpoints": typeof v4_catalog_endpoints;
  "v4/catalog/entities": typeof v4_catalog_entities;
  "v4/catalog/fields": typeof v4_catalog_fields;
  "v4/catalog/models": typeof v4_catalog_models;
  "v4/catalog/project": typeof v4_catalog_project;
  "v4/catalog/providers": typeof v4_catalog_providers;
  "v4/catalog/table": typeof v4_catalog_table;
  "v4/history/listings": typeof v4_history_listings;
  "v4/history/pagination": typeof v4_history_pagination;
  "v4/history/pricing": typeof v4_history_pricing;
  "v4/history/stats": typeof v4_history_stats;
  "v4/history/table": typeof v4_history_table;
  "v4/ingestion/clock": typeof v4_ingestion_clock;
  "v4/ingestion/initialize": typeof v4_ingestion_initialize;
  "v4/ingestion/modules": typeof v4_ingestion_modules;
  "v4/ingestion/progress": typeof v4_ingestion_progress;
  "v4/ingestion/registry": typeof v4_ingestion_registry;
  "v4/ingestion/routine": typeof v4_ingestion_routine;
  "v4/ingestion/state": typeof v4_ingestion_state;
  "v4/ingestion/step": typeof v4_ingestion_step;
  "v4/ingestion/table": typeof v4_ingestion_table;
  "v4/json": typeof v4_json;
  "v4/pricing": typeof v4_pricing;
  "v4/scan": typeof v4_scan;
  "v4/scan/entities": typeof v4_scan_entities;
  "v4/scan/extract": typeof v4_scan_extract;
  "v4/scan/time": typeof v4_scan_time;
  "v4/stats/current": typeof v4_stats_current;
  "v4/stats/table": typeof v4_stats_table;
  "views/apply": typeof views_apply;
  "views/consume": typeof views_consume;
  "views/exports": typeof views_exports;
  "views/fromProjection": typeof views_fromProjection;
  "views/index": typeof views_index;
  "views/writes": typeof views_writes;
  "workflows/analytics/manual": typeof workflows_analytics_manual;
  "workflows/analytics/process": typeof workflows_analytics_process;
  "workflows/analytics/scheduled": typeof workflows_analytics_scheduled;
  "workflows/topApps/manual": typeof workflows_topApps_manual;
  "workflows/topApps/process": typeof workflows_topApps_process;
  "workflows/topApps/scheduled": typeof workflows_topApps_scheduled;
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
