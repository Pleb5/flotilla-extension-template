import { z } from 'zod';
import type { Event as NostrEvent } from 'nostr-tools';

export type { NostrEvent };

/**
 * Shared types for Flotilla Smart Widgets (kind 30033) and the Flotilla host bridge.
 *
 * Flotilla's host runtime communicates with iframe widgets via an action-based postMessage protocol:
 *   { type: 'request'|'response'|'event', action: string, payload?: any, id?: string }
 *
 * This file defines:
 * - UnsignedEvent (used by signaling helpers; no pubkey/id/sig required)
 * - WidgetContext (optional host-provided context; demo action: `context:update`)
 * - WidgetActionMap (typed actions used by the template)
 * - WidgetWireMessage (wire shapes compatible with Flotilla)
 * - SmartWidgetNostrEvent (raw kind 30033 event structure for publishing)
 */

/**
 * Unsigned event template (before signing).
 * The host is expected to add pubkey/id/sig when signing/publishing.
 */
export type UnsignedEvent = {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey?: string;
};

export const UnsignedEventSchema = z.object({
  kind: z.number(),
  content: z.string(),
  tags: z.array(z.array(z.string())),
  created_at: z.number(),
  pubkey: z.string().optional(),
});

/**
 * Host-provided context for widgets.
 *
 * NOTE: This template treats context as optional and demo-only. Flotilla may evolve
 * a richer set of host-to-iframe events over time.
 */
export type WidgetContext = {
  contextId?: string;
  userPubkey?: string;
  relays?: string[];
  [k: string]: unknown;
};

export const WidgetContextSchema = z
  .object({
    contextId: z.string().optional(),
    userPubkey: z.string().optional(),
    relays: z.array(z.string()).optional(),
  })
  .catchall(z.unknown());

/**
 * A minimal shared error shape commonly returned by host bridge handlers.
 */
export type BridgeError = {
  error: string;
};

/**
 * UI toast request payload.
 * Flotilla currently exposes `ui:toast` as an action; enforcement is host-defined.
 */
export type ToastType = 'info' | 'success' | 'warning' | 'error';

export type UiToastRequest = {
  message: string;
  type?: ToastType;
};

export type UiToastResponse = { status: 'ok' } | BridgeError;

/**
 * Nostr publish request payload. This matches Flotilla's `nostr:publish` handler expectations.
 */
export type NostrPublishRequest = UnsignedEvent;

export type NostrPublishResponse = { status: 'ok'; result?: unknown } | BridgeError;

export type NostrQueryRequest = {
  relays: string[];
  filter: Record<string, unknown>;
};

export type NostrQueryResponse = { status: 'ok'; events: NostrEvent[] } | BridgeError;

/**
 * Action map used by the canonical Smart Widget starter kit.
 *
 * - `nostr:publish` is a request/response action.
 * - `ui:toast` is a request/response action.
 * - `context:update` is a host-to-iframe event (optional/demo).
 */
export interface WidgetActionMap {
  'nostr:publish': {
    req: NostrPublishRequest;
    res: NostrPublishResponse;
  };

  'nostr:query': {
    req: NostrQueryRequest;
    res: NostrQueryResponse;
  };

  'ui:toast': {
    req: UiToastRequest;
    res: UiToastResponse;
  };

  'context:update': {
    event: WidgetContext;
  };
}

export type WidgetAction = keyof WidgetActionMap;

export type WidgetRequestAction = {
  [K in WidgetAction]: 'req' extends keyof WidgetActionMap[K] ? K : never;
}[WidgetAction];

export type WidgetResponseAction = {
  [K in WidgetAction]: 'res' extends keyof WidgetActionMap[K] ? K : never;
}[WidgetAction];

export type WidgetEventAction = {
  [K in WidgetAction]: 'event' extends keyof WidgetActionMap[K] ? K : never;
}[WidgetAction];

/**
 * Wire message shapes (compatible with Flotilla host bridge).
 *
 * Flotilla host uses:
 * - type: 'request' | 'response' | 'event'
 * - action: string
 * - payload?: any
 * - id?: string (required for request/response, not used for event)
 *
 * We provide:
 * - strongly-typed messages for known actions in WidgetActionMap
 * - a permissive fallback message union for custom/unknown actions
 */

export type WidgetRequestMessage<A extends WidgetRequestAction = WidgetRequestAction> = {
  type: 'request';
  id: string;
  action: A;
  payload?: WidgetActionMap[A]['req'];
};

export type WidgetResponseMessage<A extends WidgetResponseAction = WidgetResponseAction> = {
  type: 'response';
  id: string;
  action: A;
  payload?: WidgetActionMap[A]['res'];
};

export type WidgetEventMessage<A extends WidgetEventAction = WidgetEventAction> = {
  type: 'event';
  action: A;
  payload?: WidgetActionMap[A]['event'];
};

/**
 * Fallback wire message (for host/client extensions beyond WidgetActionMap).
 */
export type WidgetUnknownMessage =
  | {
      type: 'request' | 'response';
      action: string;
      payload?: unknown;
      id: string;
    }
  | {
      type: 'event';
      action: string;
      payload?: unknown;
      id?: never;
    };

export type WidgetWireMessage =
  | WidgetRequestMessage
  | WidgetResponseMessage
  | WidgetEventMessage
  | WidgetUnknownMessage;

export const WidgetRequestMessageSchema = z.object({
  type: z.literal('request'),
  id: z.string(),
  action: z.string(),
  payload: z.unknown().optional(),
});

export const WidgetResponseMessageSchema = z.object({
  type: z.literal('response'),
  id: z.string(),
  action: z.string(),
  payload: z.unknown().optional(),
});

export const WidgetEventMessageSchema = z.object({
  type: z.literal('event'),
  action: z.string(),
  payload: z.unknown().optional(),
});

export const WidgetWireMessageSchema = z.union([
  WidgetRequestMessageSchema,
  WidgetResponseMessageSchema,
  WidgetEventMessageSchema,
]);

/**
 * Raw Smart Widget Nostr event (kind 30033).
 *
 * This is the on-relay event structure (addressable event).
 * The CLI in `@flotilla/ext-manifest` will generate an *unsigned* version of this.
 */
export type SmartWidgetNostrEvent = {
  kind: 30033;
  content: string;
  tags: string[][];
  created_at: number;
  pubkey?: string;
  id?: string;
  sig?: string;
};

export const SmartWidgetNostrEventSchema = z.object({
  kind: z.literal(30033),
  content: z.string(),
  tags: z.array(z.array(z.string())),
  created_at: z.number(),
  pubkey: z.string().optional(),
  id: z.string().optional(),
  sig: z.string().optional(),
});

/**
 * Convenience type for permissions declared in widget tags.
 * Flotilla's host enforces these by comparing against requested actions.
 */
export type WidgetPermission = 'nostr:publish' | 'nostr:query' | 'ui:toast' | (string & {});
