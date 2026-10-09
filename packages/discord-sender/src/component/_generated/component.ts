/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    api: {
      getJob: FunctionReference<
        "query",
        "internal",
        { jobId: string },
        {
          _creationTime: number;
          _id: string;
          availableAt: number;
          expiresAt: number;
          finishedAt?: number;
          key: string;
          messages: Array<{ key: string; payload: string }>;
          outcome?: "succeeded" | "failed" | "expired";
          retryCount: number;
          webhookId: string;
        } | null,
        Name
      >;
      listJobs: FunctionReference<
        "query",
        "internal",
        { from: number; limit?: number; to: number },
        {
          hasMore: boolean;
          jobs: Array<{
            _creationTime: number;
            _id: string;
            availableAt: number;
            expiresAt: number;
            finishedAt?: number;
            key: string;
            messages: Array<{ key: string; payload: string }>;
            outcome?: "succeeded" | "failed" | "expired";
            retryCount: number;
            webhookId: string;
          }>;
        },
        Name
      >;
      listResults: FunctionReference<
        "query",
        "internal",
        { jobId: string },
        Array<{
          _creationTime: number;
          _id: string;
          jobId: string;
          messageKey: string;
          result:
            | {
                kind: "succeeded";
                response: {
                  body: string;
                  channelId?: string;
                  error?: string;
                  headers: Record<string, string>;
                  messageId?: string;
                  status: number | null;
                };
              }
            | {
                kind: "failed";
                response: {
                  body: string;
                  channelId?: string;
                  error?: string;
                  headers: Record<string, string>;
                  messageId?: string;
                  status: number | null;
                };
              };
        }>,
        Name
      >;
      listWebhooks: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          _creationTime: number;
          _id: string;
          name?: string;
          url: string;
        }>,
        Name
      >;
      registerWebhook: FunctionReference<
        "mutation",
        "internal",
        { name?: string; url: string },
        string,
        Name
      >;
      resume: FunctionReference<"mutation", "internal", {}, null, Name>;
      submitBatch: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt: number;
          key: string;
          messages: Array<{ key: string; payload: string }>;
          webhookId: string;
        },
        string,
        Name
      >;
    };
  };
