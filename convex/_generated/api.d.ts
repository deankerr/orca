/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin_archives from "../admin/archives.js";
import type * as admin_bundleSync from "../admin/bundleSync.js";
import type * as admin_postSyncMaintenance from "../admin/postSyncMaintenance.js";
import type * as alerts_dev from "../alerts/dev.js";
import type * as alerts_dispatcher from "../alerts/dispatcher.js";
import type * as analysis_changes from "../analysis/changes.js";
import type * as analysis_endpoints from "../analysis/endpoints.js";
import type * as analysis_providers from "../analysis/providers.js";
import type * as analysis_stats from "../analysis/stats.js";
import type * as changeBatch from "../changeBatch.js";
import type * as config from "../config.js";
import type * as crons from "../crons.js";
import type * as db_alerts_discord_subscriptions from "../db/alerts/discord/subscriptions.js";
import type * as db_index from "../db/index.js";
import type * as db_or_sources from "../db/or/sources.js";
import type * as db_or_views_changes from "../db/or/views/changes.js";
import type * as db_or_views_endpoints from "../db/or/views/endpoints.js";
import type * as db_or_views_models from "../db/or/views/models.js";
import type * as db_or_views_providers from "../db/or/views/providers.js";
import type * as db_snapshot_crawl_archives from "../db/snapshot/crawl/archives.js";
import type * as db_snapshot_crawl_config from "../db/snapshot/crawl/config.js";
import type * as discord_admin from "../discord/admin.js";
import type * as discord_api from "../discord/api.js";
import type * as discord_bot from "../discord/bot.js";
import type * as discord_constants from "../discord/constants.js";
import type * as discord_interactions from "../discord/interactions.js";
import type * as discord_messages from "../discord/messages.js";
import type * as discord_releases from "../discord/releases.js";
import type * as discord_subscriptions from "../discord/subscriptions.js";
import type * as discord_utils from "../discord/utils.js";
import type * as endpoints from "../endpoints.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_paginateAndProcess from "../lib/paginateAndProcess.js";
import type * as lib_vTable from "../lib/vTable.js";
import type * as lib_validator from "../lib/validator.js";
import type * as models from "../models.js";
import type * as monitor from "../monitor.js";
import type * as providers from "../providers.js";
import type * as public_api_preview_v2 from "../public_api/preview_v2.js";
import type * as shared_formatters from "../shared/formatters.js";
import type * as shared_groups from "../shared/groups.js";
import type * as shared_logos from "../shared/logos.js";
import type * as shared_utils from "../shared/utils.js";
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
import type * as storage from "../storage.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "admin/archives": typeof admin_archives;
  "admin/bundleSync": typeof admin_bundleSync;
  "admin/postSyncMaintenance": typeof admin_postSyncMaintenance;
  "alerts/dev": typeof alerts_dev;
  "alerts/dispatcher": typeof alerts_dispatcher;
  "analysis/changes": typeof analysis_changes;
  "analysis/endpoints": typeof analysis_endpoints;
  "analysis/providers": typeof analysis_providers;
  "analysis/stats": typeof analysis_stats;
  changeBatch: typeof changeBatch;
  config: typeof config;
  crons: typeof crons;
  "db/alerts/discord/subscriptions": typeof db_alerts_discord_subscriptions;
  "db/index": typeof db_index;
  "db/or/sources": typeof db_or_sources;
  "db/or/views/changes": typeof db_or_views_changes;
  "db/or/views/endpoints": typeof db_or_views_endpoints;
  "db/or/views/models": typeof db_or_views_models;
  "db/or/views/providers": typeof db_or_views_providers;
  "db/snapshot/crawl/archives": typeof db_snapshot_crawl_archives;
  "db/snapshot/crawl/config": typeof db_snapshot_crawl_config;
  "discord/admin": typeof discord_admin;
  "discord/api": typeof discord_api;
  "discord/bot": typeof discord_bot;
  "discord/constants": typeof discord_constants;
  "discord/interactions": typeof discord_interactions;
  "discord/messages": typeof discord_messages;
  "discord/releases": typeof discord_releases;
  "discord/subscriptions": typeof discord_subscriptions;
  "discord/utils": typeof discord_utils;
  endpoints: typeof endpoints;
  http: typeof http;
  init: typeof init;
  "lib/env": typeof lib_env;
  "lib/paginateAndProcess": typeof lib_paginateAndProcess;
  "lib/vTable": typeof lib_vTable;
  "lib/validator": typeof lib_validator;
  models: typeof models;
  monitor: typeof monitor;
  providers: typeof providers;
  "public_api/preview_v2": typeof public_api_preview_v2;
  "shared/formatters": typeof shared_formatters;
  "shared/groups": typeof shared_groups;
  "shared/logos": typeof shared_logos;
  "shared/utils": typeof shared_utils;
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
  storage: typeof storage;
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
