import { describe, it, expect } from 'vitest';
import {
  generateSmartWidgetEvent,
  formatWidgetEvent,
  generateWidgetJson,
  generatePublishingInstructions,
} from './generator.js';

describe('generateSmartWidgetEvent()', () => {
  const baseOptions = {
    title: 'Test Widget',
    widgetType: 'tool' as const,
    imageUrl: 'https://example.com/image.png',
    iconUrl: 'https://example.com/icon.png',
    appUrl: 'https://example.com/app/index.html',
    buttonTitle: 'Open',
  };

  it('should generate a kind 30033 event', () => {
    const event = generateSmartWidgetEvent(baseOptions);

    expect(event.kind).toBe(30033);
    expect(event.content).toBe('Test Widget');
    expect(typeof event.created_at).toBe('number');
  });

  it('should include required tags', () => {
    const event = generateSmartWidgetEvent(baseOptions);
    const tagMap = new Map(event.tags.map((t) => [t[0], t]));

    expect(tagMap.get('l')).toEqual(['l', 'tool']);
    expect(tagMap.get('image')).toEqual(['image', 'https://example.com/image.png']);
    expect(tagMap.get('icon')).toEqual(['icon', 'https://example.com/icon.png']);
    expect(tagMap.get('button')).toEqual([
      'button',
      'Open',
      'app',
      'https://example.com/app/index.html',
    ]);
  });

  it('should derive stable identifier from title + appUrl when omitted', () => {
    const event1 = generateSmartWidgetEvent(baseOptions);
    const event2 = generateSmartWidgetEvent(baseOptions);

    const d1 = event1.tags.find((t) => t[0] === 'd')?.[1];
    const d2 = event2.tags.find((t) => t[0] === 'd')?.[1];

    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[a-f0-9]{24}$/);
  });

  it('should use explicit identifier when provided', () => {
    const event = generateSmartWidgetEvent({
      ...baseOptions,
      identifier: 'my-custom-id',
    });

    const d = event.tags.find((t) => t[0] === 'd')?.[1];
    expect(d).toBe('my-custom-id');
  });

  it('should generate different identifiers for different inputs', () => {
    const event1 = generateSmartWidgetEvent(baseOptions);
    const event2 = generateSmartWidgetEvent({ ...baseOptions, title: 'Other Widget' });

    const d1 = event1.tags.find((t) => t[0] === 'd')?.[1];
    const d2 = event2.tags.find((t) => t[0] === 'd')?.[1];

    expect(d1).not.toBe(d2);
  });

  it('should add permission tags', () => {
    const event = generateSmartWidgetEvent({
      ...baseOptions,
      permissions: ['nostr:publish', 'nostr:query', 'ui:toast'],
    });

    const permTags = event.tags.filter((t) => t[0] === 'permission');
    expect(permTags).toEqual([
      ['permission', 'nostr:publish'],
      ['permission', 'nostr:query'],
      ['permission', 'ui:toast'],
    ]);
  });

  it('should skip empty permission strings', () => {
    const event = generateSmartWidgetEvent({
      ...baseOptions,
      permissions: ['nostr:publish', '', '  ', 'ui:toast'],
    });

    const permTags = event.tags.filter((t) => t[0] === 'permission');
    expect(permTags).toHaveLength(2);
  });

  it('should add nostrKinds tags', () => {
    const event = generateSmartWidgetEvent({
      ...baseOptions,
      nostrKinds: [30301, 30302],
    });

    const kindTags = event.tags.filter((t) => t[0] === 'nostrKinds');
    expect(kindTags).toEqual([
      ['nostrKinds', '30301'],
      ['nostrKinds', '30302'],
    ]);
  });

  it('should add slot configuration', () => {
    const event = generateSmartWidgetEvent({
      ...baseOptions,
      slot: { type: 'repo-tab', label: 'Pipeline', path: 'pipelines' },
    });

    const slotTag = event.tags.find((t) => t[0] === 'slot');
    expect(slotTag).toEqual(['slot', 'repo-tab', 'Pipeline', 'pipelines']);
  });

  it('should add client tag when provided', () => {
    const event = generateSmartWidgetEvent({
      ...baseOptions,
      client: { name: 'budabit', originHint: 'https://budabit.com' },
    });

    const clientTag = event.tags.find((t) => t[0] === 'client');
    expect(clientTag).toEqual(['client', 'budabit', 'https://budabit.com']);
  });

  it('should use custom createdAt timestamp', () => {
    const event = generateSmartWidgetEvent({
      ...baseOptions,
      createdAt: 1700000000,
    });

    expect(event.created_at).toBe(1700000000);
  });
});

describe('formatWidgetEvent()', () => {
  it('should return pretty-printed JSON', () => {
    const event = generateSmartWidgetEvent({
      title: 'Test',
      widgetType: 'tool',
      imageUrl: 'https://example.com/img.png',
      iconUrl: 'https://example.com/icon.png',
      appUrl: 'https://example.com/app',
      buttonTitle: 'Open',
      createdAt: 1700000000,
    });

    const json = formatWidgetEvent(event);
    const parsed = JSON.parse(json);

    expect(parsed.kind).toBe(30033);
    expect(json).toContain('\n'); // pretty-printed
  });
});

describe('generateWidgetJson()', () => {
  it('should generate valid widget.json content', () => {
    const json = generateWidgetJson({
      title: 'My Widget',
      appUrl: 'https://example.com/app',
      iconUrl: 'https://example.com/icon.png',
      imageUrl: 'https://example.com/image.png',
      buttonTitle: 'Open',
    });

    const parsed = JSON.parse(json);
    expect(parsed.widget.title).toBe('My Widget');
    expect(parsed.widget.appUrl).toBe('https://example.com/app');
    expect(parsed.pubkey).toBeUndefined();
  });

  it('should include pubkey when provided', () => {
    const json = generateWidgetJson({
      title: 'My Widget',
      appUrl: 'https://example.com/app',
      iconUrl: 'https://example.com/icon.png',
      imageUrl: 'https://example.com/image.png',
      buttonTitle: 'Open',
      pubkey: 'hex-pubkey-123',
    });

    const parsed = JSON.parse(json);
    expect(parsed.pubkey).toBe('hex-pubkey-123');
  });
});

describe('generatePublishingInstructions()', () => {
  it('should return markdown with signing instructions', () => {
    const md = generatePublishingInstructions();

    expect(md).toContain('# Publishing');
    expect(md).toContain('finalizeEvent');
    expect(md).toContain('naddr');
    expect(md).toContain('relay');
  });
});
