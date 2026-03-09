# Flotilla Smart Widget Template

Reusable starter template for building Flotilla **Smart Widgets**.

This template provides a production-ready foundation for creating **iframe-based Smart Widgets** that integrate with Flotilla using:

- A **Smart Widget event** published to Nostr (kind `30033`)
- A **sandboxed iframe UI** (Svelte 5)
- A **typed, action-based postMessage bridge** compatible with Flotilla

> **Note:** This template is specifically for **Smart Widgets (kind 30033)**. Flotilla also supports **NIP-89 Manifest Extensions (kind 31990)**, which use a different discovery and registration model. For NIP-89 extensions, see the [Flotilla Extension Developer Guide](../../docs/extensions/README.md) which covers both extension types comprehensively.

## What is a Smart Widget?

A Flotilla Smart Widget is represented on Nostr as a **kind `30033` addressable event**. The event describes:

- The widget identifier (`d` tag)
- Widget type (`l` tag): `action` or `tool`
- Display metadata (`image`, `icon`)
- A launch button that points to your hosted iframe app (`button ... app ...`)
- Declared permissions (`permission` tags)
- Declared Nostr event kinds (`nostrKinds` tags)

Flotilla discovers and renders widgets based on these events and enforces privileged actions based on declared permissions.

## Template Features

- Svelte 5 iframe app example (Smart Widget "tool" pattern)
- Framework-agnostic shared bridge package with `signalReady()` and `subscribe()` helpers
- TypeScript strict mode
- Monorepo via pnpm workspaces
- Unit tests (Vitest) + E2E tests (Playwright)
- Smart Widget generator CLI (outputs kind `30033` event with `nostrKinds` + optional `/.well-known/widget.json`)
- Dual-protocol: works with Flotilla bridge and Smart Widget Handler hosts

## Quick Start

### Bootstrap a new project (recommended)

```bash
npx create-flotilla-widget my-widget
```

This scaffolds a fresh copy with your project name, description, and dependencies pre-installed.

### Or clone and install manually

### 1) Install

```bash
pnpm install
```

### 2) Run the iframe app locally

```bash
pnpm dev
```

The widget iframe app will be available at `http://localhost:5173`.

### 3) Build

```bash
pnpm build
```

### 4) Generate Smart Widget files (kind 30033)

This writes:
- `dist/widget/event.json` (unsigned kind `30033` event)
- `dist/widget/widget.json` (optional `/.well-known/widget.json` file)
- `dist/widget/PUBLISHING.md` (signing + publishing instructions)

```bash
pnpm manifest:generate \
  --type tool \
  --title 'My Smart Widget' \
  --app-url 'https://cdn.example.com/my-widget/index.html' \
  --icon 'https://cdn.example.com/my-widget/icon.png' \
  --image 'https://cdn.example.com/my-widget/preview.png' \
  --button-title 'Open' \
  --permissions 'nostr:publish,nostr:query,nostr:subscribe,ui:toast' \
  --nostr-kinds '30301,30302'
```

Notes:
- `--identifier` is optional; if omitted it will be derived.
- `--pubkey` is optional; if provided, publishing instructions can include an `naddr` hint.
- `--nostr-kinds` declares which Nostr event kinds your widget needs.
- `--permissions` should include `nostr:subscribe` if your widget uses real-time subscriptions.

## Bridge Protocol (Action-Based)

Flotilla uses an action-based postMessage protocol:

- Widget -> Host requests:
  - `{ type: 'request', id, action, payload }`
- Host -> Widget responses:
  - `{ type: 'response', id, action, payload }`
- Host -> Widget events:
  - `{ type: 'event', action, payload }`

This template’s shared package provides a typed `WidgetBridge` with:

- `request(action, payload) -> Promise<responsePayload>`
- `onEvent(action, handler)` for host-initiated events (lifecycle: `widget:init`, `widget:mounted`, `widget:unmounting`)
- `onRequest(action, handler)` for bidirectional "tool" widgets (host can request work from the iframe)

### Example: publish a note + show a toast

```ts
import { WidgetBridge, createEvent } from '@flotilla/ext-shared';

const bridge = new WidgetBridge();

async function publishNote(content: string) {
  const event = createEvent(1, content, []);
  const res = await bridge.request('nostr:publish', event);

  if ('error' in res) {
    await bridge.request('ui:toast', { message: res.error, type: 'error' });
    return;
  }

  await bridge.request('ui:toast', { message: 'Published', type: 'success' });
}
```

### Handle lifecycle events

The host sends lifecycle events at key moments:

```ts
// Receive initial context on init
bridge.onEvent('widget:init', (payload) => {
  console.log('Extension ID:', payload.extensionId);
  console.log('Host version:', payload.hostVersion);
  if (payload.repoContext) {
    console.log('Repository:', payload.repoContext.fullName);
  }
});

// Know when bridge is ready for operations
bridge.onEvent('widget:mounted', (payload) => {
  console.log('Mounted at:', payload.mountedAt);
  initializeWidget();
});

// Cleanup before removal
bridge.onEvent('widget:unmounting', (payload) => {
  console.log('Unmounting, reason:', payload.reason);
  saveState();
  bridge.destroy();
});
```

For repository context changes, handle `context:repoUpdate`. To proactively fetch context, use `bridge.request('context:getRepo', {})`.

## Permissions

Smart Widgets can declare permissions using `permission` tags (one per permission). This template defaults to:

- `nostr:publish`
- `ui:toast`

Privileged actions (`nostr:*`, `storage:*`) require explicit permission tags. `ui:*` actions are rate-limited but don't require explicit permission.

Additionally, declare which event kinds your widget needs via `nostrKinds` tags:

```json
["nostrKinds", "30301"]
["nostrKinds", "30302"]
```

Only declared kinds (plus profiles and relay lists) can be queried/subscribed.

## Project Structure (Monorepo)

```
flotilla-extension-template/
├── packages/
│   ├── shared/          # Framework-agnostic bridge + types + signaling helpers
│   ├── iframe-app/      # Svelte 5 iframe app (Smart Widget tool demo)
│   ├── worker/          # Optional stubbed worker bridge (action protocol)
│   ├── manifest/        # CLI: generates kind 30033 + widget.json + instructions
│   └── test-utils/      # Mocks for bridge/testing
├── docs/                # Documentation (Smart Widget-focused)
├── e2e/                 # Playwright E2E tests
└── [config files]       # ESLint, Prettier, TypeScript, etc.
```

## Package Overview

### `@flotilla/ext-shared`

Shared, framework-agnostic code:

- `WidgetBridge`: typed action-based postMessage bridge with `signalReady()` and `subscribe()` helpers
- Smart Widget types: `WidgetWireMessage`, `WidgetActionMap`, `WidgetInitPayload`, `RepoContext`
- Nostr helpers: `createEvent`, `validateEvent`, and related signaling utilities

### `@flotilla/ext-iframe`

Svelte 5 iframe app demonstrating a Smart Widget "tool":

- Calls host actions via `bridge.request('nostr:publish', ...)`
- Calls UI actions via `bridge.request('ui:toast', ...)`
- Handles lifecycle events: `widget:init`, `widget:mounted`, `widget:unmounting`
- Handles `context:repoUpdate` for repository context changes

### `@flotilla/ext-manifest`

Smart Widget generator CLI:

- Generates unsigned kind `30033` event JSON
- Generates `widget.json` for optional `/.well-known/widget.json` hosting
- Generates `PUBLISHING.md` with signing + publishing steps (including naddr hint when possible)

### `@flotilla/test-utils`

Testing helpers and bridge mocks compatible with the action protocol.

### `@flotilla/ext-worker`

Optional worker stub aligned with the same action-based protocol.

## Common Commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:coverage
pnpm e2e
pnpm verify
pnpm manifest:generate
```

## Publishing

### Quick Publish to Blossom

The easiest way to publish your widget is using Blossom servers:

```bash
# Set your Nostr secret key
export NOSTR_SK=your_secret_key_hex

# Build, upload to Blossom, sign, and publish to relays
pnpm widget:publish:blossom
```

This will:
1. Build all packages
2. Generate the manifest
3. Upload `index.html` to Blossom (before signing)
4. Update the event's app URL with the Blossom URL
5. Sign the event with your key
6. Publish to Nostr relays
7. Upload to Blossom again for redundancy

### Publish to GitHub Releases

Alternatively, publish via GitHub releases:

```bash
export NOSTR_SK=your_secret_key_hex
export GITHUB_REPO=owner/repo
export GITHUB_TAG=v1.0.0
export GITHUB_TOKEN=your_github_token

pnpm widget:publish:github
```

### Manual Publishing (Advanced)

1) Build the iframe app:
```bash
pnpm build
```

2) Host the iframe HTML somewhere reachable by Flotilla (typically on HTTPS):
- `packages/iframe-app/dist/index.html`

3) Generate Smart Widget files:
```bash
pnpm manifest:generate \
  --type tool \
  --title 'My Smart Widget' \
  --app-url 'https://cdn.example.com/my-widget/index.html' \
  --icon 'Sparkles' \
  --image 'https://cdn.example.com/my-widget/preview.png' \
  --identifier 'my-widget' \
  --permissions 'nostr:publish,ui:toast'
```

4) Sign and publish the generated kind `30033` event using `nostr-tools` (see `dist/widget/PUBLISHING.md`).

### Publishing Options

- `widget:publish:dry-run` - Test without publishing
- `widget:publish:blossom` - Publish to Blossom + Nostr relays
- `widget:publish:github` - Publish to GitHub releases + Nostr relays
- `widget:publish` - Manual publish (requires pre-hosted artifact)

## Documentation

Smart Widget docs live in `docs/` and cover:
- [Architecture](./docs/architecture.md) - System design and package structure
- [Host Bridge](./docs/host-bridge.md) - Host integration guide
- [Lifecycle Events](./docs/lifecycle.md) - Widget initialization, mount, and cleanup
- [Storage API](./docs/storage.md) - Persistent data storage
- [Slot System](./docs/slots.md) - Where widgets can be mounted
- [Manifest](./docs/manifest.md) - Kind 30033 event structure
- [Security](./docs/security.md) - Security guidelines
- [Quick Start](./docs/quickstart.md) - Getting started guide

### Extension Types in Flotilla

Flotilla supports two complementary extension models:

| Model | Event Kind | Discovery | Use Case |
|-------|-----------|-----------|----------|
| **Smart Widgets** (this template) | 30033 | YakiHonne relays | Rich, event-based widgets rendered inline or in iframes |
| **NIP-89 Manifest Extensions** | 31990 | INDEXER_RELAYS or HTTPS URL | Full iframe apps with JSON manifests |

For comprehensive documentation covering both models, including migration guidance and interoperability, see the [Flotilla Extension Developer Guide](../../docs/extensions/README.md).

## License

MIT License - see [LICENSE](LICENSE) file for details.
