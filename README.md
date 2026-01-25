# Flotilla Smart Widget Template

Reusable starter template for building Flotilla **Smart Widgets**.

This template provides a production-ready foundation for creating **iframe-based Smart Widgets** that integrate with Flotilla using:

- A **Smart Widget event** published to Nostr (kind `30033`)
- A **sandboxed iframe UI** (Svelte 5)
- A **typed, action-based postMessage bridge** compatible with Flotilla

## What is a Smart Widget?

A Flotilla Smart Widget is represented on Nostr as a **kind `30033` addressable event**. The event describes:

- The widget identifier (`d` tag)
- Widget type (`l` tag): `action` or `tool`
- Display metadata (`image`, `icon`)
- A launch button that points to your hosted iframe app (`button ... app ...`)
- Declared permissions (`permission` tags)

Flotilla discovers and renders widgets based on these events and enforces privileged actions based on declared permissions.

## Template Features

- Svelte 5 iframe app example (Smart Widget "tool" pattern)
- Framework-agnostic shared bridge package
- TypeScript strict mode
- Monorepo via pnpm workspaces
- Unit tests (Vitest) + E2E tests (Playwright)
- Smart Widget generator CLI (outputs kind `30033` event + optional `/.well-known/widget.json`)

## Quick Start

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
  --permissions 'nostr:publish,ui:toast'
```

Notes:
- `--identifier` is optional; if omitted it will be derived.
- `--pubkey` is optional; if provided, publishing instructions can include an `naddr` hint.

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
- `onEvent(action, handler)` for host-initiated events (demo: `context:update`)
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

### Optional/demo: receive host context

Hosts may send context information as an event:

```ts
bridge.onEvent('context:update', (ctx) => {
  console.log('Context:', ctx.contextId, ctx.userPubkey, ctx.relays);
});
```

This is optional: the widget should still run without context.

## Permissions

Smart Widgets can declare permissions using `permission` tags (one per permission). This template defaults to:

- `nostr:publish`
- `ui:toast`

Flotilla may treat some actions as privileged (for example `nostr:*` and `storage:*`) and enforce them based on the widget’s declared permissions.

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

- `WidgetBridge`: typed action-based postMessage bridge compatible with Flotilla
- Smart Widget message/types: `WidgetWireMessage`, `WidgetActionMap`, `WidgetContext`
- Nostr helpers: `createEvent`, `validateEvent`, and related signaling utilities

### `@flotilla/ext-iframe`

Svelte 5 iframe app demonstrating a Smart Widget "tool":

- Calls host actions via `bridge.request('nostr:publish', ...)`
- Calls UI actions via `bridge.request('ui:toast', ...)`
- Displays optional host context received via `context:update`

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

## Publishing (High Level)

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
  --icon 'https://cdn.example.com/my-widget/icon.png' \
  --image 'https://cdn.example.com/my-widget/preview.png'
```

4) Sign and publish the generated kind `30033` event using `nostr-tools` (see `dist/widget/PUBLISHING.md`).

## Documentation

Smart Widget docs live in `docs/` and cover:
- Architecture
- Host bridge expectations
- Security guidelines
- Generator output formats

## License

MIT License - see [LICENSE](LICENSE) file for details.
