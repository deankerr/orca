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
      cancelPendingDelivery: FunctionReference<
        "mutation",
        "internal",
        { inputId: string; webhookId: string },
        boolean,
        Name
      >;
      getInput: FunctionReference<
        "query",
        "internal",
        { inputId: string },
        {
          _creationTime: number;
          _id: string;
          expiresAt: number;
          finishedAt?: number;
          key: string;
          messages: Array<{ key: string; payload: string }>;
          webhookIds: Array<string>;
        } | null,
        Name
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { inputId: string },
        null | {
          finishedAt?: number;
          recipients: Array<{
            error?: string;
            execution?:
              | { previousAttempts: number; state: "pending" }
              | { previousAttempts: number; state: "running" }
              | { state: "finished" };
            nextMessageIndex?: number;
            scheduledAt?: number;
            sentCount: number;
            state:
              | "pending"
              | "sending"
              | "waiting"
              | "succeeded"
              | "failed"
              | "expired"
              | "canceled";
            webhookId: string;
            workId?: string;
          }>;
        },
        Name
      >;
      listDeliveries: FunctionReference<
        "query",
        "internal",
        { inputId: string; webhookId?: string },
        Array<{
          _creationTime: number;
          _id: string;
          claimId?: string;
          event:
            | { attempt: number; kind: "queued"; runAt: number }
            | { attempt: number; kind: "claimed" }
            | {
                kind: "retrying";
                response: {
                  body: string;
                  channelId?: string;
                  error?: string;
                  headers: Record<string, string>;
                  messageId?: string;
                  status: number | null;
                };
                retryAt: number;
              }
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
                error?: string;
                kind: "failed";
                response?: {
                  body: string;
                  channelId?: string;
                  error?: string;
                  headers: Record<string, string>;
                  messageId?: string;
                  status: number | null;
                };
              }
            | { kind: "expired" }
            | { kind: "canceled" };
          inputId: string;
          messageIndex: number;
          webhookId: string;
          workId: string;
        }>,
        Name
      >;
      listInputs: FunctionReference<
        "query",
        "internal",
        { from: number; limit?: number; to: number },
        {
          hasMore: boolean;
          inputs: Array<{
            _creationTime: number;
            _id: string;
            expiresAt: number;
            finishedAt?: number;
            key: string;
            messages: Array<{ key: string; payload: string }>;
            webhookIds: Array<string>;
          }>;
        },
        Name
      >;
      registerWebhook: FunctionReference<
        "mutation",
        "internal",
        { name?: string; url: string },
        string,
        Name
      >;
      submitBatch: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt: number;
          key: string;
          messages: Array<{ key: string; payload: string }>;
          webhookIds: Array<string>;
        },
        string,
        Name
      >;
    };
  };
