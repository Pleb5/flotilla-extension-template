import { createHash } from 'crypto';
import type { SmartWidgetNostrEvent, WidgetPermission } from '@budabit/ext-shared';

export type SmartWidgetType = 'action' | 'tool';

export type WidgetCommunitySlotType =
  | 'community-home-before-quicklinks'
  | 'community-home-after-quicklinks'
  | 'chat-message-actions'
  | 'global-menu';

export type WidgetSlotType = 'repo-tab' | WidgetCommunitySlotType;

export type SlotConfig =
  | {
      /** Full repository tab integration. */
      type: 'repo-tab';
      /** Display label for the tab. */
      label: string;
      /** URL path segment for routing. */
      path: string;
    }
  | {
      /** Community-targeted launcher/card slot. */
      type: WidgetCommunitySlotType;
      /** Display label for the launcher/card. */
      label: string;
    };

export interface SmartWidgetEventOptions {
  /** The widget identifier (maps to the `d` tag). If omitted, a stable identifier is derived. */
  identifier?: string;
  /** The widget title (maps to event.content). */
  title: string;
  /** Widget type (maps to the `l` tag). */
  widgetType: SmartWidgetType;
  /** Thumbnail/preview image URL (maps to the `image` tag). */
  imageUrl: string;
  /** Icon URL (maps to the `icon` tag). Required for action/tool widgets. */
  iconUrl: string;
  /** Iframe app URL (maps to the `button` tag of type `app`). */
  appUrl: string;
  /** Button label (maps to the `button` tag label). */
  buttonTitle: string;
  /** Optional release version metadata (maps to the `version` tag). */
  version?: string;
  /** Optional release changelog metadata (maps to the `changelog` tag). */
  changelog?: string;
  /** Permissions (maps to `permission` tags). */
  permissions?: WidgetPermission[];
  /** Optional client tag metadata (used by BudaBit as an origin hint). */
  client?: {
    name: string;
    originHint?: string;
  };
  /** Override created_at timestamp (seconds). */
  createdAt?: number;
  /** Optional supported BudaBit Smart Widget slot configuration. */
  slot?: SlotConfig;
  /** Nostr event kinds this widget queries/subscribes to (maps to `nostrKinds` tags). */
  nostrKinds?: number[];
}

function deriveIdentifier(title: string, appUrl: string): string {
  // Stable, URL+title derived identifier. Keeps output deterministic if caller omits identifier.
  // NOTE: The `d` tag can be any string; BudaBit uses it as a settings key.
  const digest = createHash('sha256').update(`${title}\n${appUrl}`).digest('hex');
  return digest.slice(0, 24);
}

/**
 * Generate a Smart Widget Nostr event (kind 30033).
 *
 * This output is UNSIGNED. The host/author should sign it with nostr-tools and publish to relays.
 *
 * Tags emitted match BudaBit's parseSmartWidget():
 * - ["d", identifier]
 * - ["l", widgetType]
 * - ["image", imageUrl]
 * - ["icon", iconUrl]
 * - ["button", buttonTitle, "app", appUrl]
 * - ["version", version] (optional)
 * - ["changelog", changelog] (optional)
 * - ["permission", "nostr:publish"] (repeatable)
 */
export function generateSmartWidgetEvent(options: SmartWidgetEventOptions): SmartWidgetNostrEvent {
  const identifier = options.identifier?.trim() || deriveIdentifier(options.title, options.appUrl);
  const version = options.version?.trim();
  const changelog = options.changelog?.trim();

  const tags: string[][] = [
    ['d', identifier],
    ['l', options.widgetType],
    ['image', options.imageUrl],
    ['icon', options.iconUrl],
    ['button', options.buttonTitle, 'app', options.appUrl],
  ];

  if (version) tags.push(['version', version]);
  if (changelog) tags.push(['changelog', changelog]);

  if (options.client?.name) {
    const clientTag: string[] = ['client', options.client.name];
    if (options.client.originHint) clientTag.push(options.client.originHint);
    tags.push(clientTag);
  }

  for (const permission of options.permissions ?? []) {
    if (permission && String(permission).trim()) {
      tags.push(['permission', String(permission).trim()]);
    }
  }

  // Add supported slot configuration. Repo tabs include a route path; launcher/card slots do not.
  if (options.slot) {
    const slotTag = ['slot', options.slot.type, options.slot.label];
    if (options.slot.type === 'repo-tab') slotTag.push(options.slot.path);
    tags.push(slotTag);
  }

  // Add nostrKinds tags for declared event kinds
  for (const kind of options.nostrKinds ?? []) {
    tags.push(['nostrKinds', String(kind)]);
  }

  return {
    kind: 30033,
    content: options.title,
    tags,
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
  };
}

/**
 * Format a Smart Widget event as JSON.
 */
export function formatWidgetEvent(event: SmartWidgetNostrEvent): string {
  return JSON.stringify(event, null, 2);
}

export interface WidgetJsonOptions {
  /** Optional creator pubkey (hex). */
  pubkey?: string;
  /** Widget title for discovery tools. */
  title: string;
  /** App URL (iframe). */
  appUrl: string;
  /** Icon URL. */
  iconUrl: string;
  /** Image URL. */
  imageUrl: string;
  /** Button label. */
  buttonTitle: string;
  /** Optional freeform tags for discovery tools. */
  tags?: string[];
}

/**
 * Generate the optional `/.well-known/widget.json` discovery file.
 *
 * NOTE: This file is part of the NIP-XX ecosystem (YakiHonne tooling). BudaBit primarily
 * installs widgets via the kind 30033 event (naddr), but emitting this helps interoperability.
 */
export function generateWidgetJson(options: WidgetJsonOptions): string {
  const body: Record<string, unknown> = {};

  if (options.pubkey) {
    body.pubkey = options.pubkey;
  }

  body.widget = {
    title: options.title,
    appUrl: options.appUrl,
    iconUrl: options.iconUrl,
    imageUrl: options.imageUrl,
    buttonTitle: options.buttonTitle,
    tags: options.tags ?? [],
  };

  return JSON.stringify(body, null, 2);
}

/**
 * Generate publishing instructions for kind 30033 Smart Widgets.
 *
 * This intentionally stays generic; the CLI can write this to `dist/widget/PUBLISHING.md`.
 */
export function generatePublishingInstructions(): string {
  return `# Publishing Your Smart Widget (kind 30033)

## Files Generated

- \`event.json\` – unsigned kind 30033 Nostr event (Smart Widget)
- \`widget.json\` – optional discovery file for \`/.well-known/widget.json\`

## Recommended Relays

BudaBit currently discovers Smart Widgets via YakiHonne relays (and naddr relay hints):

- \`wss://relay.yakihonne.com\`

You can publish to additional relays for redundancy.

## Sign + Publish (nostr-tools)

\`\`\`ts
import { finalizeEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import * as nip19 from 'nostr-tools/nip19';
import widgetEvent from './dist/widget/event.json' assert { type: 'json' };

// Load your private key from a secure source (NEVER commit it!)
const sk = process.env.NOSTR_SK;
if (!sk) throw new Error('Missing NOSTR_SK');

const relays = [
  'wss://relay.yakihonne.com',
];

const signed = finalizeEvent(widgetEvent, sk);

const pool = new SimplePool();
await Promise.all(pool.publish(relays, signed));

const identifier = signed.tags.find((t) => t[0] === 'd')?.[1] ?? '';
const naddr = nip19.naddrEncode({
  pubkey: signed.pubkey,
  kind: 30033,
  identifier,
  relays,
});

console.log('Published Smart Widget');
console.log('Event id:', signed.id);
console.log('naddr:', naddr);
\`\`\`

## Install in BudaBit

- Copy the printed \`naddr\`
- In BudaBit: Settings → Extensions → Install Smart Widget (naddr)

## Stable Release Workflow

- Pick an explicit, stable \`--identifier\` for the widget line before your first public release.
- Build the iframe app, upload the built HTML to Blossom, then publish a new kind \`30033\` event that points its \`button\`/\`app\` URL at that Blossom URL.
- For each release, reuse the same \`d\` identifier, publish a newer event with a newer \`created_at\`, and update optional \`version\` / \`changelog\` tags.
- BudaBit treats the same pubkey + kind \`30033\` + same \`d\` value as the same widget line. Installed users see update availability and manually apply the newer event.

## Notes

- For \`action\`/ \`tool\` widgets, BudaBit extracts the iframe URL from the first \`button\` tag with type \`app\`.
- Permissions are read from \`permission\` (or \`perm\`) tags and compared to requested bridge actions (e.g., \`nostr:publish\`).
`;
}
