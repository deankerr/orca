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
      listDeliveries: FunctionReference<
        "query",
        "internal",
        { inputId: string; webhookId?: string },
        Array<{
          _creationTime: number;
          _id: string;
          claimId?: string;
          event:
            | { kind: "claimed" }
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
            | { kind: "expired" };
          inputId: string;
          messageIndex: number;
          webhookId: string;
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
