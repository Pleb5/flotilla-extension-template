<script lang="ts">
  import {
    WidgetBridge,
    createWidgetBridge,
    createTextNote,
    type UnsignedEvent,
    type WidgetContext,
  } from '@flotilla/ext-shared';

  // Bridge + host-provided context (optional/demo)
  let bridge = $state<WidgetBridge | null>(null);
  let context = $state<WidgetContext | null>(null);

  // UI state
  let hasContext = $state(false);
  let note = $state('');
  let status = $state('Initializing Smart Widget...');
  let lastPublishResult = $state<string | null>(null);
  let lastError = $state<string | null>(null);

  // Initialize bridge and set up handlers
  $effect(() => {
    const b = createWidgetBridge({
      targetWindow: window.parent,
      targetOrigin: '*',
      timeoutMs: 15000,
    });

    bridge = b;
    status = 'Ready. Waiting for optional host context...';
    lastPublishResult = null;
    lastError = null;

    const offContext = b.onEvent('context:update', (ctx) => {
      context = ctx;
      hasContext = true;

      const ctxId = typeof ctx?.contextId === 'string' ? ctx.contextId : undefined;
      status = ctxId ? `Connected (contextId: ${ctxId})` : 'Connected (context received)';
    });

    return () => {
      offContext();
      b.destroy();
      bridge = null;
    };
  });

  function buildNoteEvent(content: string): UnsignedEvent {
    const tags: string[][] = [];

    const ctxId = typeof context?.contextId === 'string' ? context.contextId : undefined;
    if (ctxId) {
      tags.push(['h', ctxId]);
    }

    return createTextNote(content, tags);
  }

  async function publishNote(): Promise<void> {
    if (!bridge) return;

    const content = note.trim();
    if (!content) return;

    lastPublishResult = null;
    lastError = null;
    status = 'Publishing note via host (nostr:publish)...';

    const event = buildNoteEvent(content);

    try {
      const res = await bridge.request('nostr:publish', event);

      if (res && typeof res === 'object' && 'error' in res && typeof res.error === 'string') {
        lastError = res.error;
        status = `Publish failed: ${res.error}`;
        return;
      }

      lastPublishResult = 'ok';
      status = 'Published successfully';
      note = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      status = `Publish failed: ${msg}`;
    }
  }

  async function showToast(): Promise<void> {
    if (!bridge) return;

    lastError = null;

    const message = hasContext
      ? 'Hello from Smart Widget (context connected)'
      : 'Hello from Smart Widget';

    try {
      const res = await bridge.request('ui:toast', { message, type: 'info' });

      if (res && typeof res === 'object' && 'error' in res && typeof res.error === 'string') {
        lastError = res.error;
        status = `Toast failed: ${res.error}`;
        return;
      }

      status = 'Toast requested';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      status = `Toast failed: ${msg}`;
    }
  }
</script>

<div class="container">
  <header>
    <h1>Flotilla Smart Widget Template (Tool)</h1>
    <p class="status" class:ready={hasContext}>{status}</p>
  </header>

  {#if context}
    <section class="context">
      <h2>Host Context (optional)</h2>
      <dl>
        {#if context.contextId}
          <dt>Context ID:</dt>
          <dd>{String(context.contextId)}</dd>
        {/if}

        {#if context.userPubkey}
          <dt>User Pubkey:</dt>
          <dd class="pubkey">{String(context.userPubkey)}</dd>
        {/if}

        {#if Array.isArray(context.relays) && context.relays.length > 0}
          <dt>Relays:</dt>
          <dd>{context.relays.join(', ')}</dd>
        {/if}
      </dl>

      <details class="context-raw">
        <summary>Raw context payload</summary>
        <pre>{JSON.stringify(context, null, 2)}</pre>
      </details>
    </section>
  {:else}
    <section class="waiting">
      <h2>Waiting for host context</h2>
      <p>
        This Smart Widget works without context, but can optionally receive it via
        <code>context:update</code>.
      </p>
      <p class="hint">If you are testing locally, your host must post a <code>type: "event"</code> message.</p>
    </section>
  {/if}

  <section class="actions">
    <h2>Actions</h2>

    <div class="action-group">
      <h3>Publish a note (nostr:publish)</h3>
      <div class="input-group">
        <input
          type="text"
          bind:value={note}
          placeholder="Type a note to publish..."
          onkeydown={(e) => e.key === 'Enter' && publishNote()}
        />
        <button onclick={publishNote} disabled={!bridge || !note.trim()}>
          Publish
        </button>
      </div>

      {#if lastPublishResult}
        <p class="result">Last publish result: {lastPublishResult}</p>
      {/if}
    </div>

    <div class="action-group">
      <h3>Request a toast (ui:toast)</h3>
      <div class="button-group">
        <button onclick={showToast} disabled={!bridge}>
          Show Toast
        </button>
      </div>
    </div>

    {#if lastError}
      <div class="error">
        <strong>Error:</strong> {lastError}
      </div>
    {/if}
  </section>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
      sans-serif;
    background: #f5f5f5;
  }

  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0 0 0.5rem 0;
    color: #333;
  }

  .status {
    padding: 0.5rem 1rem;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 4px;
    color: #856404;
    font-size: 0.9rem;
  }

  .status.ready {
    background: #d4edda;
    border-color: #28a745;
    color: #155724;
  }

  section {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  h2 {
    margin: 0 0 1rem 0;
    color: #333;
    font-size: 1.25rem;
  }

  h3 {
    margin: 0 0 0.75rem 0;
    color: #666;
    font-size: 1rem;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.5rem 1rem;
    margin: 0;
  }

  dt {
    font-weight: 600;
    color: #666;
  }

  dd {
    margin: 0;
    color: #333;
  }

  .pubkey {
    font-family: monospace;
    font-size: 0.85rem;
    word-break: break-all;
  }

  .context-raw {
    margin-top: 1rem;
  }

  .context-raw pre {
    margin: 0.75rem 0 0 0;
    padding: 0.75rem;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #eee;
    overflow: auto;
    font-size: 0.85rem;
  }

  .action-group {
    margin-bottom: 1.5rem;
  }

  .action-group:last-child {
    margin-bottom: 0;
  }

  .input-group {
    display: flex;
    gap: 0.5rem;
  }

  input[type='text'] {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }

  .button-group {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  button {
    padding: 0.5rem 1rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  button:hover:not(:disabled) {
    background: #0056b3;
  }

  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .result {
    margin: 0.75rem 0 0 0;
    color: #333;
    font-size: 0.95rem;
  }

  .error {
    margin-top: 1rem;
    padding: 0.75rem;
    border: 1px solid #dc3545;
    background: #f8d7da;
    border-radius: 6px;
    color: #721c24;
  }

  .waiting {
    text-align: center;
  }

  .waiting p {
    margin: 0.5rem 0;
    color: #666;
  }

  .hint {
    font-size: 0.9rem;
    color: #999;
  }
</style>
