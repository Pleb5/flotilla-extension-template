# flotilla-sdk

SDK for building [Flotilla](https://flotilla.social) Smart Widget extensions.

## Install

```bash
npm install flotilla-sdk
```

## Usage

### Bridge (iframe ↔ host communication)

```ts
import { createWidgetBridge, type WidgetBridge } from 'flotilla-sdk';

const bridge = createWidgetBridge(window.parent, '*');

// Signal readiness to host
bridge.signalReady();

// Publish a Nostr event
const result = await bridge.request('nostr:publish', {
  kind: 1,
  content: 'Hello from my widget!',
  tags: [],
  created_at: Math.floor(Date.now() / 1000),
});

// Subscribe to events
const sub = await bridge.subscribe({
  subscriptionId: 'my-feed',
  relays: ['wss://relay.example.com'],
  filter: { kinds: [1], limit: 50 },
});

bridge.onEvent('nostr:event', ({ subscriptionId, event }) => {
  console.log('New event:', event);
});

// Cleanup
await sub.unsubscribe();
bridge.destroy();
```

### Manifest CLI

Generate a Smart Widget event (kind 30033):

```bash
npx flotilla-generate \
  --title 'My Widget' \
  --type tool \
  --app-url 'https://cdn.example.com/my-widget/index.html' \
  --icon 'https://cdn.example.com/my-widget/icon.png' \
  --image 'https://cdn.example.com/my-widget/preview.png' \
  --permissions 'nostr:publish,nostr:query,nostr:subscribe,ui:toast' \
  --nostr-kinds '30301,30302'
```

### Programmatic manifest generation

```ts
import { generateSmartWidgetEvent } from 'flotilla-sdk/manifest';

const event = generateSmartWidgetEvent({
  title: 'My Widget',
  widgetType: 'tool',
  appUrl: 'https://cdn.example.com/my-widget/index.html',
  iconUrl: 'https://cdn.example.com/my-widget/icon.png',
  imageUrl: 'https://cdn.example.com/my-widget/preview.png',
  permissions: ['nostr:publish', 'ui:toast'],
  nostrKinds: [30301, 30302],
});
```

### Testing

```ts
import { createMockWidgetBridge } from 'flotilla-sdk/testing';

const mock = createMockWidgetBridge();

// Simulate widget requesting a publish
const promise = mock.request('nostr:publish', { kind: 1, content: 'test', tags: [], created_at: 0 });

// Simulate host responding
const msg = mock.sentMessages[0];
mock.respondTo(msg.id!, { status: 'ok' });

const result = await promise; // { status: 'ok' }
```

### Worker bridge

```ts
import { createWorkerBridge } from 'flotilla-sdk/worker';

const bridge = createWorkerBridge((msg) => self.postMessage(msg));
self.addEventListener('message', (e) => bridge.handleMessage(e.data));
```

## Subpath Exports

| Import | Contents |
|--------|----------|
| `flotilla-sdk` | Types, WidgetBridge, signaling helpers |
| `flotilla-sdk/manifest` | Event generator, CLI utilities |
| `flotilla-sdk/testing` | MockWidgetBridge, test helpers |
| `flotilla-sdk/worker` | Worker bridge |

## Scaffold a new widget

```bash
npx create-flotilla-widget my-widget
```

## License

MIT
