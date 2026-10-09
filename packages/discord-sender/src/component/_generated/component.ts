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
      cancelJob: FunctionReference<
        "mutation",
        "internal",
        { jobId: string },
        null,
        Name
      >;
      deleteMessage: FunctionReference<
        "mutation",
        "internal",
        { expiresAt: number; key: string; resultId: string },
        string | null,
        Name
      >;
      editMessage: FunctionReference<
        "mutation",
        "internal",
        { expiresAt: number; key: string; payload: string; resultId: string },
        string | null,
        Name
      >;
      getJob: FunctionReference<
        "query",
        "internal",
        { jobId: string },
        {
          _creationTime: number;
          _id: string;
          expiresAt: number;
          finishedAt?: number;
          key: string;
          messages: Array<
            | { key: string; kind: "send"; payload: string }
            | {
                key: string;
                kind: "edit";
                messageId: string;
                payload: string;
                threadId?: string;
              }
            | {
                key: string;
                kind: "delete";
                messageId: string;
                threadId?: string;
              }
          >;
          outcome?: "succeeded" | "failed" | "expired" | "cancelled";
          topic?: string;
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
            expiresAt: number;
            finishedAt?: number;
            key: string;
            messages: Array<
              | { key: string; kind: "send"; payload: string }
              | {
                  key: string;
                  kind: "edit";
                  messageId: string;
                  payload: string;
                  threadId?: string;
                }
              | {
                  key: string;
                  kind: "delete";
                  messageId: string;
                  threadId?: string;
                }
            >;
            outcome?: "succeeded" | "failed" | "expired" | "cancelled";
            topic?: string;
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
            | { kind: "succeeded"; response: Record<string, any> | null }
            | {
                error: {
                  code: number | string;
                  message: string;
                  status: number;
                };
                kind: "failed";
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
          invalidatedAt?: number;
          name?: string;
          topics: Array<string>;
          url: string;
        }>,
        Name
      >;
      registerWebhook: FunctionReference<
        "mutation",
        "internal",
        { name?: string; topics: Array<string>; url: string },
        string,
        Name
      >;
      removeWebhook: FunctionReference<
        "mutation",
        "internal",
        { webhookId: string },
        null,
        Name
      >;
      resume: FunctionReference<"mutation", "internal", {}, null, Name>;
      setWebhookTopics: FunctionReference<
        "mutation",
        "internal",
        { topics: Array<string>; webhookId: string },
        null,
        Name
      >;
      submitBatch: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt: number;
          key: string;
          messages: Array<{ key: string; payload: string }>;
          topic: string;
        },
        Array<{ jobId: string; webhookId: string }>,
        Name
      >;
    };
  };
