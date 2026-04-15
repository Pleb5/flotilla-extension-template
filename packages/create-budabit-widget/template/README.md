# My BudaBit Widget

A [BudaBit](https://budabit.com) Smart Widget extension.

## What is a Smart Widget?

A BudaBit Smart Widget is represented on Nostr as a **kind `30033` addressable event**. The event describes:

- The widget identifier (`d` tag)
- Widget type (`l` tag): `action` or `tool`
- Display metadata (`image`, `icon`)
- A launch button that points to your hosted iframe app (`button ... app ...`)
- Declared permissions (`permission` tags)
- Declared Nostr event kinds (`nostrKinds` tags)

BudaBit discovers and renders widgets based on these events and enforces privileged actions based on declared permissions.

## Quick Start

```bash
pnpm install
pnpm dev        # Start dev server at http://localhost:5173
pnpm build      # Build for production
pnpm test       # Run unit tests
pnpm e2e        # Run end-to-end tests
pnpm verify     # Full CI: lint → typecheck → coverage → e2e
```

## Bridge Protocol

BudaBit uses an action-based postMessage protocol between the host and your widget iframe:

- Widget → Host requests: `{ type: 'request', id, action, payload }`
- Host → Widget responses: `{ type: 'response', id, action, payload }`
- Host → Widget events: `{ type: 'event', action, payload }`

The `budabit-sdk` provides a typed `WidgetBridge` with:

- `request(action, payload) → Promise<responsePayload>`
- `onEvent(action, handler)` for host-initiated events (lifecycle: `widget:init`, `widget:mounted`, `widget:unmounting`)
- `onRequest(action, handler)` for bidirectional "tool" widgets

### Example: publish a note + show a toast

```ts
import { createWidgetBridge, createEvent } from 'budabit-sdk';

const bridge = createWidgetBridge({
  targetWindow: window.parent,
  targetOrigin: '*',
  timeoutMs: 15000,
});

async function publishNote(content: string) {
  const event = createEvent(1, content, []);
  const res = await bridge.request('nostr:publish', event);

  if (res && typeof res === 'object' && 'error' in res) {
    await bridge.request('ui:toast', { message: res.error, type: 'error' });
    return;
  }

  await bridge.request('ui:toast', { message: 'Published', type: 'success' });
}
```

### Lifecycle Events

The host sends lifecycle events at key moments:

```ts
// Receive initial context on init
bridge.onEvent('widget:init', (payload) => {
  console.log('Extension ID:', payload.extensionId);
  console.log('Host version:', payload.hostVersion);
});

// Know when bridge is ready for operations
bridge.onEvent('widget:mounted', (payload) => {
  console.log('Mounted at:', payload.mountedAt);
});

// Cleanup before removal
bridge.onEvent('widget:unmounting', (payload) => {
  console.log('Unmounting, reason:', payload.reason);
  bridge.destroy();
});
```

## Permissions

Smart Widgets declare permissions using `permission` tags. This project defaults to:

- `nostr:publish` — Publish Nostr events
- `nostr:query` — Query events from relays
- `nostr:subscribe` — Real-time relay subscriptions
- `ui:toast` — Show toast notifications (rate-limited, no explicit permission needed)

Declare which event kinds your widget needs via `nostrKinds` tags.

## Project Structure

```
my-widget/
├── packages/
│   └── iframe-app/      # Svelte 5 iframe app (your widget UI)
│       └── src/
│           ├── App.svelte
│           └── main.ts
├── docs/                # Architecture and integration guides
├── e2e/                 # Playwright E2E tests
├── .github/workflows/   # CI pipeline
└── [config files]
```

Your widget code lives in `packages/iframe-app/`. The `budabit-sdk` package provides the bridge, types, manifest CLI, and test utilities.

### SDK Subpath Imports

| Import | Contents |
|--------|----------|
| `budabit-sdk` | Types, WidgetBridge, signaling helpers |
| `budabit-sdk/manifest` | Event generator, CLI utilities |
| `budabit-sdk/testing` | MockWidgetBridge, test helpers |
| `budabit-sdk/worker` | Worker bridge |

## Publishing

### Generate Manifest

```bash
pnpm manifest:generate
```

This generates a kind `30033` event JSON in `dist/widget/`.

### Quick Publish to Blossom

```bash
export NOSTR_SK=your_secret_key_hex

# Build, upload to Blossom, sign, and publish to relays
pnpm widget:publish:blossom
```

### Publish to GitHub Releases

```bash
export NOSTR_SK=your_secret_key_hex
export GITHUB_REPO=owner/repo
export GITHUB_TAG=v1.0.0
export GITHUB_TOKEN=your_github_token

pnpm widget:publish:github
```

### Manual Publishing

1. Build: `pnpm build`
2. Host `packages/iframe-app/dist/index.html` on HTTPS
3. Generate manifest: `pnpm manifest:generate --app-url 'https://your-cdn.com/widget/index.html'`
4. Sign and publish the kind `30033` event (see `dist/widget/PUBLISHING.md`)

### Publishing Commands

| Command | Description |
|---------|-------------|
| `pnpm widget:build` | Build + generate manifest |
| `pnpm widget:publish` | Build + generate + publish to relays |
| `pnpm widget:publish:dry-run` | Full pipeline without publishing |
| `pnpm widget:publish:blossom` | Upload to Blossom CDN + publish |
| `pnpm widget:publish:github` | Upload to GitHub release + publish |

## Testing

```bash
pnpm test              # Unit tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report
pnpm test:ui           # Interactive Vitest UI
pnpm e2e               # Playwright E2E tests
pnpm e2e:headed        # E2E in headed browser
pnpm e2e:debug         # E2E debug mode
```

## Documentation

See `docs/` for detailed guides:

- [Architecture](./docs/architecture.md) — System design
- [Host Bridge](./docs/host-bridge.md) — Host integration guide
- [Lifecycle Events](./docs/lifecycle.md) — Widget init, mount, cleanup
- [Storage API](./docs/storage.md) — Persistent data storage
- [Slot System](./docs/slots.md) — Where widgets can be mounted
- [Manifest](./docs/manifest.md) — Kind 30033 event structure
- [Security](./docs/security.md) — Security guidelines
- [Quick Start](./docs/quickstart.md) — Getting started

## License

MIT
