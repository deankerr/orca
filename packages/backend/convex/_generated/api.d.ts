/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_archiveSync from "../admin/archiveSync.js";
import type * as admin_archives from "../admin/archives.js";
import type * as admin_changes from "../admin/changes.js";
import type * as alerts_dev from "../alerts/dev.js";
import type * as alerts_dispatcher from "../alerts/dispatcher.js";
import type * as analysis_changes from "../analysis/changes.js";
import type * as analysis_fields from "../analysis/fields.js";
import type * as analysis_stats from "../analysis/stats.js";
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
import type * as endpoints from "../endpoints.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_functionSpec from "../lib/functionSpec.js";
import type * as lib_paginateAndProcess from "../lib/paginateAndProcess.js";
import type * as lib_r2 from "../lib/r2.js";
import type * as models from "../models.js";
import type * as monitor from "../monitor.js";
import type * as providers from "../providers.js";
import type * as public_api_preview_v2 from "../public_api/preview_v2.js";
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
  "admin/archiveSync": typeof admin_archiveSync;
  "admin/archives": typeof admin_archives;
  "admin/changes": typeof admin_changes;
  "alerts/dev": typeof alerts_dev;
  "alerts/dispatcher": typeof alerts_dispatcher;
  "analysis/changes": typeof analysis_changes;
  "analysis/fields": typeof analysis_fields;
  "analysis/stats": typeof analysis_stats;
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
  endpoints: typeof endpoints;
  http: typeof http;
  init: typeof init;
  "lib/env": typeof lib_env;
  "lib/functionSpec": typeof lib_functionSpec;
  "lib/paginateAndProcess": typeof lib_paginateAndProcess;
  "lib/r2": typeof lib_r2;
  models: typeof models;
  monitor: typeof monitor;
  providers: typeof providers;
  "public_api/preview_v2": typeof public_api_preview_v2;
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
