/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as catalog_entities from "../catalog/entities.js";
import type * as catalog_pricing from "../catalog/pricing.js";
import type * as catalog_tables_current from "../catalog/tables/current.js";
import type * as catalog_tables_events from "../catalog/tables/events.js";
import type * as catalog_tables_listings from "../catalog/tables/listings.js";
import type * as catalog_tables_observations from "../catalog/tables/observations.js";
import type * as catalog_tables_pricing from "../catalog/tables/pricing.js";
import type * as catalog_tables_stats from "../catalog/tables/stats.js";
import type * as collectors_analytics from "../collectors/analytics.js";
import type * as collectors_scan from "../collectors/scan.js";
import type * as collectors_topApps from "../collectors/topApps.js";
import type * as compare from "../compare.js";
import type * as crons from "../crons.js";
import type * as entityLogo from "../entityLogo.js";
import type * as fields from "../fields.js";
import type * as http from "../http.js";
import type * as ingestion_currentEndpoints from "../ingestion/currentEndpoints.js";
import type * as ingestion_currentModels from "../ingestion/currentModels.js";
import type * as ingestion_currentProviders from "../ingestion/currentProviders.js";
import type * as ingestion_currentStats from "../ingestion/currentStats.js";
import type * as ingestion_events from "../ingestion/events.js";
import type * as ingestion_lenses from "../ingestion/lenses.js";
import type * as ingestion_listingHistory from "../ingestion/listingHistory.js";
import type * as ingestion_observations from "../ingestion/observations.js";
import type * as ingestion_pool from "../ingestion/pool.js";
import type * as ingestion_pricingHistory from "../ingestion/pricingHistory.js";
import type * as ingestion_progress from "../ingestion/progress.js";
import type * as ingestion_refresh from "../ingestion/refresh.js";
import type * as ingestion_refresh_endpoints from "../ingestion/refresh/endpoints.js";
import type * as ingestion_refresh_models from "../ingestion/refresh/models.js";
import type * as ingestion_refresh_providers from "../ingestion/refresh/providers.js";
import type * as ingestion_refresh_shared from "../ingestion/refresh/shared.js";
import type * as ingestion_run from "../ingestion/run.js";
import type * as ingestion_state from "../ingestion/state.js";
import type * as ingestion_statsHistory from "../ingestion/statsHistory.js";
import type * as ingestion_table from "../ingestion/table.js";
import type * as init from "../init.js";
import type * as isodatetime from "../isodatetime.js";
import type * as json from "../json.js";
import type * as numbers from "../numbers.js";
import type * as objects_backend from "../objects/backend.js";
import type * as objects_bytes from "../objects/bytes.js";
import type * as objects_client from "../objects/client.js";
import type * as objects_local from "../objects/local.js";
import type * as objects_locators from "../objects/locators.js";
import type * as objects_protocol from "../objects/protocol.js";
import type * as objects_r2 from "../objects/r2.js";
import type * as objects_remote from "../objects/remote.js";
import type * as objects_remove from "../objects/remove.js";
import type * as objects_storage from "../objects/storage.js";
import type * as objects_table from "../objects/table.js";
import type * as priceMeters from "../priceMeters.js";
import type * as products_discord_delivery from "../products/discord/delivery.js";
import type * as products_discord_frequency from "../products/discord/frequency.js";
import type * as products_discord_prepare from "../products/discord/prepare.js";
import type * as products_discord_render from "../products/discord/render.js";
import type * as products_discord_renderers_batchCards from "../products/discord/renderers/batchCards.js";
import type * as products_discord_renderers_card from "../products/discord/renderers/card.js";
import type * as products_discord_renderers_display from "../products/discord/renderers/display.js";
import type * as products_discord_renderers_endpointCard from "../products/discord/renderers/endpointCard.js";
import type * as products_discord_renderers_fields from "../products/discord/renderers/fields.js";
import type * as products_discord_renderers_index from "../products/discord/renderers/index.js";
import type * as products_discord_renderers_modelCard from "../products/discord/renderers/modelCard.js";
import type * as products_discord_renderers_pricing from "../products/discord/renderers/pricing.js";
import type * as products_discord_renderers_providerCard from "../products/discord/renderers/providerCard.js";
import type * as products_entity_overview_endpoints from "../products/entity_overview/endpoints.js";
import type * as products_entity_overview_models from "../products/entity_overview/models.js";
import type * as products_entity_overview_providers from "../products/entity_overview/providers.js";
import type * as products_feed_http from "../products/feed/http.js";
import type * as products_feed_query from "../products/feed/query.js";
import type * as products_feed_render from "../products/feed/render.js";
import type * as products_feed_text from "../products/feed/text.js";
import type * as products_grid_endpoints from "../products/grid/endpoints.js";
import type * as products_grid_stats from "../products/grid/stats.js";
import type * as products_monitor_query from "../products/monitor/query.js";
import type * as products_pricing_history_listings from "../products/pricing_history/listings.js";
import type * as products_pricing_history_pricing from "../products/pricing_history/pricing.js";
import type * as products_shared_alerts_batch from "../products/shared/alerts/batch.js";
import type * as products_shared_alerts_curate from "../products/shared/alerts/curate.js";
import type * as products_shared_alerts_decode from "../products/shared/alerts/decode.js";
import type * as products_shared_alerts_facts from "../products/shared/alerts/facts.js";
import type * as products_shared_alerts_filter from "../products/shared/alerts/filter.js";
import type * as products_shared_alerts_interpret from "../products/shared/alerts/interpret.js";
import type * as products_shared_alerts_prepare from "../products/shared/alerts/prepare.js";
import type * as products_shared_alerts_pricing from "../products/shared/alerts/pricing.js";
import type * as products_shared_alerts_read from "../products/shared/alerts/read.js";
import type * as products_shared_alerts_select from "../products/shared/alerts/select.js";
import type * as products_shared_clock from "../products/shared/clock.js";
import type * as products_shared_endpoint from "../products/shared/endpoint.js";
import type * as products_shared_pagination from "../products/shared/pagination.js";
import type * as products_stats_history_query from "../products/stats_history/query.js";
import type * as public_api_v2_cache from "../public_api/v2/cache.js";
import type * as public_api_v2_compatibility from "../public_api/v2/compatibility.js";
import type * as public_api_v2_http from "../public_api/v2/http.js";
import type * as public_api_v2_snapshot from "../public_api/v2/snapshot.js";
import type * as public_api_v2_table from "../public_api/v2/table.js";
import type * as scan_access from "../scan/access.js";
import type * as scan_collected from "../scan/collected.js";
import type * as scan_model from "../scan/model.js";
import type * as scan_provider from "../scan/provider.js";
import type * as scan_reader from "../scan/reader.js";
import type * as scanNew_access from "../scanNew/access.js";
import type * as scanNew_extract from "../scanNew/extract.js";
import type * as scanNew_model from "../scanNew/model.js";
import type * as scanNew_provider from "../scanNew/provider.js";
import type * as scanNew_reader from "../scanNew/reader.js";
import type * as scanNew_stats from "../scanNew/stats.js";
import type * as scan_analysis_index from "../scan_analysis/index.js";
import type * as scan_analysis_profile from "../scan_analysis/profile.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "catalog/entities": typeof catalog_entities;
  "catalog/pricing": typeof catalog_pricing;
  "catalog/tables/current": typeof catalog_tables_current;
  "catalog/tables/events": typeof catalog_tables_events;
  "catalog/tables/listings": typeof catalog_tables_listings;
  "catalog/tables/observations": typeof catalog_tables_observations;
  "catalog/tables/pricing": typeof catalog_tables_pricing;
  "catalog/tables/stats": typeof catalog_tables_stats;
  "collectors/analytics": typeof collectors_analytics;
  "collectors/scan": typeof collectors_scan;
  "collectors/topApps": typeof collectors_topApps;
  compare: typeof compare;
  crons: typeof crons;
  entityLogo: typeof entityLogo;
  fields: typeof fields;
  http: typeof http;
  "ingestion/currentEndpoints": typeof ingestion_currentEndpoints;
  "ingestion/currentModels": typeof ingestion_currentModels;
  "ingestion/currentProviders": typeof ingestion_currentProviders;
  "ingestion/currentStats": typeof ingestion_currentStats;
  "ingestion/events": typeof ingestion_events;
  "ingestion/lenses": typeof ingestion_lenses;
  "ingestion/listingHistory": typeof ingestion_listingHistory;
  "ingestion/observations": typeof ingestion_observations;
  "ingestion/pool": typeof ingestion_pool;
  "ingestion/pricingHistory": typeof ingestion_pricingHistory;
  "ingestion/progress": typeof ingestion_progress;
  "ingestion/refresh": typeof ingestion_refresh;
  "ingestion/refresh/endpoints": typeof ingestion_refresh_endpoints;
  "ingestion/refresh/models": typeof ingestion_refresh_models;
  "ingestion/refresh/providers": typeof ingestion_refresh_providers;
  "ingestion/refresh/shared": typeof ingestion_refresh_shared;
  "ingestion/run": typeof ingestion_run;
  "ingestion/state": typeof ingestion_state;
  "ingestion/statsHistory": typeof ingestion_statsHistory;
  "ingestion/table": typeof ingestion_table;
  init: typeof init;
  isodatetime: typeof isodatetime;
  json: typeof json;
  numbers: typeof numbers;
  "objects/backend": typeof objects_backend;
  "objects/bytes": typeof objects_bytes;
  "objects/client": typeof objects_client;
  "objects/local": typeof objects_local;
  "objects/locators": typeof objects_locators;
  "objects/protocol": typeof objects_protocol;
  "objects/r2": typeof objects_r2;
  "objects/remote": typeof objects_remote;
  "objects/remove": typeof objects_remove;
  "objects/storage": typeof objects_storage;
  "objects/table": typeof objects_table;
  priceMeters: typeof priceMeters;
  "products/discord/delivery": typeof products_discord_delivery;
  "products/discord/frequency": typeof products_discord_frequency;
  "products/discord/prepare": typeof products_discord_prepare;
  "products/discord/render": typeof products_discord_render;
  "products/discord/renderers/batchCards": typeof products_discord_renderers_batchCards;
  "products/discord/renderers/card": typeof products_discord_renderers_card;
  "products/discord/renderers/display": typeof products_discord_renderers_display;
  "products/discord/renderers/endpointCard": typeof products_discord_renderers_endpointCard;
  "products/discord/renderers/fields": typeof products_discord_renderers_fields;
  "products/discord/renderers/index": typeof products_discord_renderers_index;
  "products/discord/renderers/modelCard": typeof products_discord_renderers_modelCard;
  "products/discord/renderers/pricing": typeof products_discord_renderers_pricing;
  "products/discord/renderers/providerCard": typeof products_discord_renderers_providerCard;
  "products/entity_overview/endpoints": typeof products_entity_overview_endpoints;
  "products/entity_overview/models": typeof products_entity_overview_models;
  "products/entity_overview/providers": typeof products_entity_overview_providers;
  "products/feed/http": typeof products_feed_http;
  "products/feed/query": typeof products_feed_query;
  "products/feed/render": typeof products_feed_render;
  "products/feed/text": typeof products_feed_text;
  "products/grid/endpoints": typeof products_grid_endpoints;
  "products/grid/stats": typeof products_grid_stats;
  "products/monitor/query": typeof products_monitor_query;
  "products/pricing_history/listings": typeof products_pricing_history_listings;
  "products/pricing_history/pricing": typeof products_pricing_history_pricing;
  "products/shared/alerts/batch": typeof products_shared_alerts_batch;
  "products/shared/alerts/curate": typeof products_shared_alerts_curate;
  "products/shared/alerts/decode": typeof products_shared_alerts_decode;
  "products/shared/alerts/facts": typeof products_shared_alerts_facts;
  "products/shared/alerts/filter": typeof products_shared_alerts_filter;
  "products/shared/alerts/interpret": typeof products_shared_alerts_interpret;
  "products/shared/alerts/prepare": typeof products_shared_alerts_prepare;
  "products/shared/alerts/pricing": typeof products_shared_alerts_pricing;
  "products/shared/alerts/read": typeof products_shared_alerts_read;
  "products/shared/alerts/select": typeof products_shared_alerts_select;
  "products/shared/clock": typeof products_shared_clock;
  "products/shared/endpoint": typeof products_shared_endpoint;
  "products/shared/pagination": typeof products_shared_pagination;
  "products/stats_history/query": typeof products_stats_history_query;
  "public_api/v2/cache": typeof public_api_v2_cache;
  "public_api/v2/compatibility": typeof public_api_v2_compatibility;
  "public_api/v2/http": typeof public_api_v2_http;
  "public_api/v2/snapshot": typeof public_api_v2_snapshot;
  "public_api/v2/table": typeof public_api_v2_table;
  "scan/access": typeof scan_access;
  "scan/collected": typeof scan_collected;
  "scan/model": typeof scan_model;
  "scan/provider": typeof scan_provider;
  "scan/reader": typeof scan_reader;
  "scanNew/access": typeof scanNew_access;
  "scanNew/extract": typeof scanNew_extract;
  "scanNew/model": typeof scanNew_model;
  "scanNew/provider": typeof scanNew_provider;
  "scanNew/reader": typeof scanNew_reader;
  "scanNew/stats": typeof scanNew_stats;
  "scan_analysis/index": typeof scan_analysis_index;
  "scan_analysis/profile": typeof scan_analysis_profile;
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

export declare const components: {
  discordSender: import("@orca/discord-sender/_generated/component.js").ComponentApi<"discordSender">;
  ingestionPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"ingestionPool">;
};
