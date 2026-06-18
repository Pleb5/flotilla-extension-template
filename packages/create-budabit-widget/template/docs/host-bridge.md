# Host Bridge Integration

Guide for BudaBit host developers integrating **Smart Widgets**.

## Overview

BudaBit Smart Widgets are represented on Nostr as **kind `30033` addressable events**. The host application discovers widget events, renders widget metadata, and (for `action`/`tool` widgets) loads an **iframe UI** that communicates with the host via an **action-based postMessage protocol**:

- Widget → Host **request**: `{ type: "request", id, action, payload }`
- Host → Widget **response**: `{ type: "response", id, action, payload }`
- Host → Widget **event**: `{ type: "event", action, payload }`

The host also supports the **Smart Widget Handler protocol** (`{kind, data}`) for compatibility with widgets built using the `smart-widget-handler` npm package.

The host is responsible for:

- creating a sandboxed iframe
- validating message origins + shapes
- enforcing permissions for privileged actions
- executing host-only capabilities (publishing, storage, subscriptions)
- routing Nostr operations through its relay infrastructure (welshman)
- managing per-extension subscription lifecycle
- correlating requests/responses by `id`

## Architecture

```
┌─────────────────────────────────────┐
│         BudaBit Host               │
│  ┌───────────────────────────────┐  │
│  │      Host Widget Bridge       │  │
│  │  - Validates origin + schema  │  │
│  │  - Correlates req/res by id   │  │
│  │  - Enforces permissions       │  │
│  │  - Enforces nostrKinds        │  │
│  │  - Rate limits ui:* actions   │  │
│  │  - Tracks subscriptions       │  │
│  │  - 30s request timeout        │  │
│  │  - Dual-protocol detection    │  │
│  └──────────┬────────────────────┘  │
│             │                       │
│  ┌──────────▼────────────────────┐  │
│  │     Welshman Relay Pool       │  │
│  │  - Shared connections         │  │
│  │  - Auth (NIP-42)             │  │
│  │  - Connection pooling         │  │
│  └───────────────────────────────┘  │
│             │ postMessage           │
└─────────────┼───────────────────────┘
              │
┌─────────────┼───────────────────────┐
│  Sandboxed iframe (Smart Widget UI) │
│  ┌──────────▼────────────────────┐  │
│  │   WidgetBridge (in iframe)    │  │
│  │  - request(action, payload)   │  │
│  │  - onEvent(action, handler)   │  │
│  │  - signalReady()              │  │
│  │  - subscribe()                │  │
│  │  - nostr-tools only           │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Key dependency boundary:** Extensions depend on `nostr-tools` only. All relay operations are fulfilled by the host using welshman. Extensions never import welshman.

## Smart Widget Event (kind 30033)

```json
{
  "kind": 30033,
  "content": "My Smart Widget",
  "tags": [
    ["d", "my-smart-widget"],
    ["l", "tool"],
    ["icon", "https://cdn.example.com/my-widget/icon.png"],
    ["image", "https://cdn.example.com/my-widget/preview.png"],
    ["button", "Open", "app", "https://cdn.example.com/my-widget/index.html"],
    ["permission", "nostr:publish"],
    ["permission", "nostr:query"],
    ["permission", "nostr:subscribe"],
    ["permission", "ui:toast"],
    ["nostrKinds", "30301"],
    ["nostrKinds", "30302"]
  ],
  "created_at": 1700000000
}
```

### `nostrKinds` Tags

Extensions declare which Nostr event kinds they need access to:

```json
["nostrKinds", "30301"]
["nostrKinds", "30302"]
```

The host only allows queries/subscriptions for declared kinds plus universal read kinds (0 = profiles, 10002 = relay lists). The host has **no hardcoded application-specific kinds**.

## Loading a Smart Widget

### 1) Discover via persistent subscriptions

Discovery is subscription-based, not one-shot:

```ts
import { load, request } from '@welshman/net';

// Historical events
await load({
  relays: SMART_WIDGET_RELAYS,
  filters: [{ kinds: [30033] }],
  onEvent: (event) => handleWidgetEvent(event),
});

// Real-time updates (stays open)
const controller = new AbortController();
request({
  relays: SMART_WIDGET_RELAYS,
  filters: [{ kinds: [30033] }],
  signal: controller.signal,
  onEvent: (event) => handleWidgetEvent(event),
});
```

### 2) Parse and validate

```ts
function parseWidgetEvent(ev: NostrEvent) {
  if (ev.kind !== 30033) throw new Error('Not a Smart Widget event');

  const identifier = getTagValue(ev.tags, 'd');
  const widgetType = getTagValue(ev.tags, 'l');
  const appUrl = getButtonAppUrl(ev.tags);
  const nostrKinds = ev.tags
    .filter((t) => t[0] === 'nostrKinds')
    .map((t) => parseInt(t[1], 10))
    .filter((n) => !isNaN(n));

  if (!identifier) throw new Error('Missing d tag');
  if (widgetType !== 'action' && widgetType !== 'tool') throw new Error('Invalid l tag');
  if (!appUrl) throw new Error('Missing button/app URL');

  return {
    identifier,
    widgetType,
    appUrl,
    nostrKinds,
    permissions: getPermissions(ev.tags),
    title: ev.content,
  };
}
```

### 3) Create sandboxed iframe

```ts
const iframe = document.createElement('iframe');
iframe.src = parsed.appUrl;
iframe.sandbox.add('allow-scripts');
iframe.sandbox.add('allow-same-origin');
container.appendChild(iframe);
```

### 4) Create host bridge with readiness handshake

```ts
type WidgetWireMessage =
  | { type: 'request'; id: string; action: string; payload?: unknown }
  | { type: 'response'; id: string; action: string; payload?: unknown }
  | { type: 'event'; action: string; payload?: unknown };
```

#### Minimal host bridge skeleton

```ts
function createHostWidgetBridge(opts: {
  iframe: HTMLIFrameElement;
  widgetOrigin: string; // must match iframe src origin
  permissions: string[];
  handleAction: (action: string, payload: unknown) => Promise<unknown>;
}) {
  const { iframe, widgetOrigin, permissions, handleAction } = opts;

  const postToWidget = (msg: WidgetWireMessage) => {
    iframe.contentWindow?.postMessage(msg, widgetOrigin);
  };

  const isPrivileged = (action: string) =>
    action.startsWith('nostr:') || action.startsWith('storage:');

  const isActionAllowed = (action: string) => {
    if (!isPrivileged(action)) return true;
    return permissions.includes(action);
  };

  const onMessage = async (ev: MessageEvent) => {
    if (ev.origin !== widgetOrigin) return;
    const msg = ev.data as Partial<WidgetWireMessage> | null;

    if (!msg || typeof msg !== 'object') return;
    if (msg.type !== 'request') return;

    if (typeof msg.id !== 'string' || typeof msg.action !== 'string') return;

    if (!isActionAllowed(msg.action)) {
      postToWidget({
        type: 'response',
        id: msg.id,
        action: msg.action,
        payload: { error: `Permission denied for action: ${msg.action}` },
      });
      return;
    }

    try {
      const result = await handleAction(msg.action, msg.payload);
      postToWidget({
        type: 'response',
        id: msg.id,
        action: msg.action,
        payload: { status: 'ok', result },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      postToWidget({
        type: 'response',
        id: msg.id,
        action: msg.action,
        payload: { error: message },
      });
    }
  };

  window.addEventListener('message', onMessage);

  return {
    postEvent(action: string, payload: unknown) {
      postToWidget({ type: 'event', action, payload });
    },
    destroy() {
      window.removeEventListener('message', onMessage);
    },
  };
}
```

### 5) Send lifecycle events and context

The host should send lifecycle events to the widget at appropriate times. See [Lifecycle Events](./lifecycle.md) for full documentation.

```ts
const widgetOrigin = new URL(parsed.appUrl).origin;

const bridge = createHostWidgetBridge({
  iframe,
  widgetOrigin,
  permissions: parsed.permissions,
  async handleAction(action, payload) {
    if (action === 'ui:toast') {
      // Host UI toast; payload shape is host-defined.
      console.log('Toast:', payload);
      return { ok: true };
    }

    if (action === 'nostr:publish') {
      // payload is an unsigned nostr event; host signs/publishes.
      // return a result payload that the widget can display.
      return { eventId: 'fake-event-id' };
    }

    if (action === 'context:getRepo') {
      // Widget is proactively requesting repo context
      return {
        owner: 'example-org',
        name: 'example-repo',
        fullName: 'example-org/example-repo',
        defaultBranch: 'main',
      };
    }

    throw new Error(`Unknown action: ${action}`);
  },
});

// Send widget:init immediately after iframe creation
bridge.postEvent('widget:init', {
  extensionId: parsed.identifier,
  hostVersion: '1.0.0',
  repoContext: {
    owner: 'example-org',
    name: 'example-repo',
    fullName: 'example-org/example-repo',
    defaultBranch: 'main',
  },
});

// Send widget:mounted once iframe is loaded and bridge ready
iframe.addEventListener('load', () => {
  bridge.postEvent('widget:mounted', {
    mountedAt: Date.now(),
    slot: 'repo-tab',
    viewport: { width: 400, height: 600 },
  });
});

// Send widget:unmounting before removal
function unmountWidget() {
  bridge.postEvent('widget:unmounting', {
    reason: 'navigation',
    gracePeriodMs: 1000,
  });

  // Give widget time to cleanup, then remove
  setTimeout(() => {
    iframe.remove();
    bridge.destroy();
  }, 1000);
}

// For repo context changes, send context:repoUpdate
function onRepoChange(newRepo) {
  bridge.postEvent('context:repoUpdate', {
    owner: newRepo.owner,
    name: newRepo.name,
    fullName: newRepo.fullName,
    defaultBranch: newRepo.defaultBranch,
  });
}
```

## Handling Actions

### All Registered Actions

| Action              | Permission        | Description                                     |
| ------------------- | ----------------- | ----------------------------------------------- |
| `nostr:publish`     | `nostr:publish`   | Sign and publish via welshman                   |
| `nostr:query`       | `nostr:query`     | One-shot relay query (EOSE-based + 15s timeout) |
| `nostr:subscribe`   | `nostr:subscribe` | Persistent subscription (max 10/extension)      |
| `nostr:unsubscribe` | —                 | Close subscription by ID                        |
| `ui:toast`          | — (rate limited)  | Toast notification                              |
| `ui:resize`         | — (rate limited)  | Iframe height change                            |
| `storage:get`       | `storage:get`     | Read scoped storage                             |
| `storage:set`       | `storage:set`     | Write scoped storage                            |
| `storage:remove`    | `storage:remove`  | Remove from scoped storage                      |
| `storage:keys`      | `storage:keys`    | List storage keys                               |
| `context:getRepo`   | —                 | Get repo context                                |

### `nostr:subscribe` — Persistent Subscriptions

```ts
async function handleSubscribe(payload, ext) {
  const { subscriptionId, relays, filter } = payload;

  // Validate kinds against declared nostrKinds
  validateKinds(filter.kinds, ext.nostrKinds);

  const controller = new AbortController();
  trackSubscription(ext.id, subscriptionId, controller);

  request({
    relays: normalizedRelays,
    filters: [validatedFilter],
    signal: controller.signal,
    onEvent: (event) => {
      ext.bridge.post('nostr:event', { subscriptionId, event });
    },
    onEose: (relay) => {
      ext.bridge.post('nostr:eose', { subscriptionId, relay });
    },
  });

  return { status: 'ok', subscriptionId };
}
```

### Unknown Actions

Unknown actions return `{error: "Unsupported action: \"...\""}` — not `undefined`.

## Security

### Origin + Source Validation

- `ev.origin === widgetOrigin` derived from `button/app` URL
- `ev.source === iframe.contentWindow` (recommended)
- Message shape: `{ type, action, id }`

### Permission Enforcement

- Privileged: `nostr:*`, `storage:*` — require explicit `permission` tags
- Non-privileged: `ui:*` — rate-limited (10 actions / 5 seconds / extension)
- `nostrKinds` enforcement: queries/subscriptions can only access declared kinds

### Rate Limiting

Apply rate limits for `ui:*` actions and expensive operations like `nostr:publish`.

### Request Timeout

All bridge requests have a 30-second timeout. On bridge detach, pending promises are rejected.

### Never expose private keys to widgets

All signing must occur in the host application. Extensions only send unsigned events.

## Resources

- [Nostr NIP-33: Parameterized Replaceable Events](https://github.com/nostr-protocol/nips/blob/master/33.md)
- [postMessage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-sandbox)
- [smart-widget-handler](https://www.npmjs.com/package/smart-widget-handler)
