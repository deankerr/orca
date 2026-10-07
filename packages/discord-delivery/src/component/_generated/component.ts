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
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          deadLetterDestinationKey?: string;
          destinationKey: string;
          key: string;
          maxAgeMs?: number;
          maxAttempts?: number;
          messages: Array<{ key: string; payload: string }>;
          reference?: string;
          sendAt: number;
        },
        string,
        Name
      >;
      getDestination: FunctionReference<
        "query",
        "internal",
        { key: string },
        {
          _creationTime: number;
          _id: string;
          disabledReason?: string;
          key: string;
          name?: string;
          url: string;
        } | null,
        Name
      >;
      getGroup: FunctionReference<
        "query",
        "internal",
        { groupId: string },
        {
          group: {
            _creationTime: number;
            _id: string;
            deadLetterDestinationKey?: string;
            destinationId: string;
            destinationKey: string;
            expiresAt?: number;
            key: string;
            maxAttempts: number;
            messageCount: number;
            reference?: string;
            sendAt: number;
            url: string;
          };
          task: {
            _creationTime: number;
            _id: string;
            attemptsUsed: number;
            cursor: number;
            finishedAt?: number;
            groupId: string;
            nextAttemptAt: number;
            reason?: string;
            sendAt: number;
            status: "queued" | "active" | "succeeded" | "failed" | "expired";
          };
        } | null,
        Name
      >;
      getMessage: FunctionReference<
        "query",
        "internal",
        { messageId: string },
        {
          message: {
            _creationTime: number;
            _id: string;
            groupId: string;
            key: string;
            operation: "send" | "get" | "edit" | "delete";
            payload?: string;
            position: number;
            remoteMessageId?: string;
            sourceMessageId?: string;
          };
          result: {
            _creationTime: number;
            _id: string;
            attemptId: string;
            completedAt: number;
            groupId: string;
            messageId: string;
            recovered: boolean;
            response: {
              body: string;
              channelId?: string;
              error?: string;
              headers: Record<string, string>;
              messageId?: string;
              retryAfterMs?: number;
              skipped?: "expired" | "paused";
              status: number | null;
            };
          } | null;
          status:
            | "queued"
            | "active"
            | "succeeded"
            | "failed"
            | "expired"
            | "sent"
            | "completed";
        } | null,
        Name
      >;
      listAttempts: FunctionReference<
        "query",
        "internal",
        { from?: number; limit?: number; messageId?: string; to?: number },
        Array<{
          attempt: {
            _creationTime: number;
            _id: string;
            groupId: string;
            messageId: string;
            number: number;
            scheduledId?: string;
            startedAt: number;
          };
          result: {
            _creationTime: number;
            _id: string;
            attemptId: string;
            completedAt: number;
            groupId: string;
            messageId: string;
            recovered: boolean;
            response: {
              body: string;
              channelId?: string;
              error?: string;
              headers: Record<string, string>;
              messageId?: string;
              retryAfterMs?: number;
              skipped?: "expired" | "paused";
              status: number | null;
            };
          } | null;
        }>,
        Name
      >;
      listDestinations: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          disabledReason?: string;
          key: string;
          name?: string;
          url: string;
        }>,
        Name
      >;
      listGroups: FunctionReference<
        "query",
        "internal",
        {
          destinationKey?: string;
          from?: number;
          key?: string;
          limit?: number;
          status?: "queued" | "active" | "succeeded" | "failed" | "expired";
          to?: number;
        },
        Array<{
          group: {
            _creationTime: number;
            _id: string;
            deadLetterDestinationKey?: string;
            destinationId: string;
            destinationKey: string;
            expiresAt?: number;
            key: string;
            maxAttempts: number;
            messageCount: number;
            reference?: string;
            sendAt: number;
            url: string;
          };
          task: {
            _creationTime: number;
            _id: string;
            attemptsUsed: number;
            cursor: number;
            finishedAt?: number;
            groupId: string;
            nextAttemptAt: number;
            reason?: string;
            sendAt: number;
            status: "queued" | "active" | "succeeded" | "failed" | "expired";
          };
        }>,
        Name
      >;
      listMessages: FunctionReference<
        "query",
        "internal",
        { groupId?: string; key?: string; limit?: number },
        Array<{
          message: {
            _creationTime: number;
            _id: string;
            groupId: string;
            key: string;
            operation: "send" | "get" | "edit" | "delete";
            payload?: string;
            position: number;
            remoteMessageId?: string;
            sourceMessageId?: string;
          };
          result: {
            _creationTime: number;
            _id: string;
            attemptId: string;
            completedAt: number;
            groupId: string;
            messageId: string;
            recovered: boolean;
            response: {
              body: string;
              channelId?: string;
              error?: string;
              headers: Record<string, string>;
              messageId?: string;
              retryAfterMs?: number;
              skipped?: "expired" | "paused";
              status: number | null;
            };
          } | null;
          status:
            | "queued"
            | "active"
            | "succeeded"
            | "failed"
            | "expired"
            | "sent"
            | "completed";
        }>,
        Name
      >;
      manageMessage: FunctionReference<
        "mutation",
        "internal",
        {
          key: string;
          messageId: string;
          operation: "get" | "edit" | "delete";
          payload?: string;
          sendAt: number;
        },
        string,
        Name
      >;
      registerDestination: FunctionReference<
        "mutation",
        "internal",
        { key: string; name?: string; url: string },
        string,
        Name
      >;
      setPaused: FunctionReference<
        "mutation",
        "internal",
        { paused: boolean },
        null,
        Name
      >;
    };
    history: {
      attempts: FunctionReference<
        "query",
        "internal",
        {
          from?: number;
          messageId?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          to?: number;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            attempt: {
              _creationTime: number;
              _id: string;
              groupId: string;
              messageId: string;
              number: number;
              scheduledId?: string;
              startedAt: number;
            };
            result: {
              _creationTime: number;
              _id: string;
              attemptId: string;
              completedAt: number;
              groupId: string;
              messageId: string;
              recovered: boolean;
              response: {
                body: string;
                channelId?: string;
                error?: string;
                headers: Record<string, string>;
                messageId?: string;
                retryAfterMs?: number;
                skipped?: "expired" | "paused";
                status: number | null;
              };
            } | null;
          }>;
        },
        Name
      >;
      groups: FunctionReference<
        "query",
        "internal",
        {
          destinationKey?: string;
          from?: number;
          key?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          status?: "queued" | "active" | "succeeded" | "failed" | "expired";
          to?: number;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            group: {
              _creationTime: number;
              _id: string;
              deadLetterDestinationKey?: string;
              destinationId: string;
              destinationKey: string;
              expiresAt?: number;
              key: string;
              maxAttempts: number;
              messageCount: number;
              reference?: string;
              sendAt: number;
              url: string;
            };
            task: {
              _creationTime: number;
              _id: string;
              attemptsUsed: number;
              cursor: number;
              finishedAt?: number;
              groupId: string;
              nextAttemptAt: number;
              reason?: string;
              sendAt: number;
              status: "queued" | "active" | "succeeded" | "failed" | "expired";
            };
          }>;
        },
        Name
      >;
      messages: FunctionReference<
        "query",
        "internal",
        {
          groupId?: string;
          key?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            message: {
              _creationTime: number;
              _id: string;
              groupId: string;
              key: string;
              operation: "send" | "get" | "edit" | "delete";
              payload?: string;
              position: number;
              remoteMessageId?: string;
              sourceMessageId?: string;
            };
            result: {
              _creationTime: number;
              _id: string;
              attemptId: string;
              completedAt: number;
              groupId: string;
              messageId: string;
              recovered: boolean;
              response: {
                body: string;
                channelId?: string;
                error?: string;
                headers: Record<string, string>;
                messageId?: string;
                retryAfterMs?: number;
                skipped?: "expired" | "paused";
                status: number | null;
              };
            } | null;
            status:
              | "queued"
              | "active"
              | "succeeded"
              | "failed"
              | "expired"
              | "sent"
              | "completed";
          }>;
        },
        Name
      >;
      results: FunctionReference<
        "query",
        "internal",
        {
          from?: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          to?: number;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _creationTime: number;
            _id: string;
            attemptId: string;
            completedAt: number;
            groupId: string;
            messageId: string;
            recovered: boolean;
            response: {
              body: string;
              channelId?: string;
              error?: string;
              headers: Record<string, string>;
              messageId?: string;
              retryAfterMs?: number;
              skipped?: "expired" | "paused";
              status: number | null;
            };
          }>;
        },
        Name
      >;
    };
  };
