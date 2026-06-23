# Slot System

BudaBit Smart Widgets can declare one supported slot in their kind `30033` manifest. The slot tells BudaBit where to show the widget and what context is available when the widget opens.

## Supported Slots

| Slot                               | UI                                               | Manifest tag shape                                    | Context                            |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------- | ---------------------------------- |
| `repo-tab`                         | Full repository tab                              | `["slot", "repo-tab", label, path]`                   | Repository and user                |
| `community-home-before-quicklinks` | Community home card before quick links           | `["slot", "community-home-before-quicklinks", label]` | Community and user                 |
| `community-home-after-quicklinks`  | Community home card after quick links            | `["slot", "community-home-after-quicklinks", label]`  | Community and user                 |
| `chat-message-actions`             | Compact launcher on a chat message               | `["slot", "chat-message-actions", label]`             | Community, room, message, and user |
| `global-menu`                      | Compact launcher in community route top controls | `["slot", "global-menu", label]`                      | Community and user                 |

`chat-message-actions` and `global-menu` render as semantic host launchers. BudaBit opens the widget iframe in a modal only after the user clicks the launcher.

`global-menu` is global only within targeted community routes. It is not displayed on unrelated BudaBit routes.

Community-targeted widgets only appear in communities where a widget-write-authorized account has curated the widget with a targeted publication. Use BudaBit's community widget publisher for multi-community targeting; it only exposes communities where the current account can write widget targets.

## Manifest Examples

### Repository Tab

```json
{
  "kind": 30033,
  "content": "Repository Analytics",
  "tags": [
    ["d", "repo-analytics"],
    ["l", "tool"],
    ["slot", "repo-tab", "Analytics", "analytics"],
    ["button", "Open", "app", "https://example.com/widget.html"]
  ]
}
```

This creates a repository tab labeled `Analytics` at `/repo/{owner}/{name}/analytics`.

### Community Home Card

```json
{
  "kind": 30033,
  "content": "Community Digest",
  "tags": [
    ["d", "community-digest"],
    ["l", "tool"],
    ["slot", "community-home-after-quicklinks", "Digest"],
    ["button", "Open", "app", "https://example.com/widget.html"]
  ]
}
```

### Message Action

```json
{
  "kind": 30033,
  "content": "Message Helper",
  "tags": [
    ["d", "message-helper"],
    ["l", "action"],
    ["slot", "chat-message-actions", "Help"],
    ["button", "Open", "app", "https://example.com/widget.html"]
  ]
}
```

### Community Global Menu

```json
{
  "kind": 30033,
  "content": "Community Tools",
  "tags": [
    ["d", "community-tools"],
    ["l", "tool"],
    ["slot", "global-menu", "Tools"],
    ["button", "Open", "app", "https://example.com/widget.html"]
  ]
}
```

## CLI Examples

Generate a repository tab manifest:

```bash
pnpm --filter @budabit/ext-manifest generate \
  --title "Repository Analytics" \
  --type tool \
  --app-url "https://example.com/widget.html" \
  --icon "https://example.com/icon.png" \
  --image "https://example.com/preview.png" \
  --identifier "repo-analytics" \
  --slot-type repo-tab \
  --slot-label Analytics \
  --slot-path analytics
```

Generate a message action manifest:

```bash
pnpm --filter @budabit/ext-manifest generate \
  --title "Message Helper" \
  --type action \
  --app-url "https://example.com/widget.html" \
  --icon "https://example.com/icon.png" \
  --image "https://example.com/preview.png" \
  --identifier "message-helper" \
  --slot-type chat-message-actions \
  --slot-label Help
```

`--slot-path` is required only for `repo-tab`. Community slots use `--slot-type` and `--slot-label` only.

## TypeScript Types

```typescript
export type WidgetCommunitySlotType =
  | 'community-home-before-quicklinks'
  | 'community-home-after-quicklinks'
  | 'chat-message-actions'
  | 'global-menu';

export type WidgetSlotType = 'repo-tab' | WidgetCommunitySlotType;

export type SlotConfig =
  | {
      type: 'repo-tab';
      label: string;
      path: string;
    }
  | {
      type: WidgetCommunitySlotType;
      label: string;
    };
```

## Runtime Context

Widgets receive slot and context data through the BudaBit bridge lifecycle payloads. The exact fields depend on the slot. Community slots receive a generic `communityContext` when the host has loaded the active community.

```typescript
bridge.onEvent('widget:init', (payload) => {
  console.log('Slot:', payload.slot);

  if (payload.repoContext) {
    console.log('Repository:', payload.repoContext.fullName);
  }

  if (payload.communityContext) {
    console.log('Community:', payload.communityContext.ncommunity);
    console.log('Sections:', payload.communityContext.sections);
    console.log('Calendar write access:', payload.communityContext.writeTargets.calendar?.canWrite);
  }

  if (payload.roomContext) {
    console.log('Room:', payload.roomContext.roomId);
  }

  if (payload.messageContext) {
    console.log('Message:', payload.messageContext.messageId);
  }
});
```

`communityContext.writeTargets` is keyed by logical target IDs such as `calendar`, `calendarDate`, `repository`, `widget`, `roomRoot`, and `roomMessage`. Each target reports the current community section names and writable section names, so widgets should use these mappings instead of hard-coding section names.

To query community-targeted events, request `community:queryTargetEvents` with logical target IDs. The host maps those IDs to the active community's sections and authorized writers before constructing relay filters:

```typescript
const res = await bridge.request('community:queryTargetEvents', {
  targetIds: ['calendar', 'calendarDate'],
  limit: 10,
});
```

Declare `community:queryTargetEvents` as a `permission` tag when using this action. Use write target `canWrite` values to gate configuration controls only; do not hide already configured community content from readers just because they cannot write that target.

## Design Notes

Community home slots render inline iframe widgets and can show richer card-style content directly on the community home page. Message action and global menu slots should be designed for a short launcher label and a modal experience after click. Repository tab widgets can use the full available repository content area.
