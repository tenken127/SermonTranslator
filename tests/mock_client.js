/* Offline Test Harness (injected ONLY when running via tests/mock_server.py?mock=1) */
(function () {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const opts = init || {};

    if (url.includes('generativelanguage.googleapis.com') && url.includes(':generateContent')) {
      let parsedBody = {};
      try { parsedBody = JSON.parse(opts.body || '{}'); } catch (e) {}
      const isAudio = parsedBody.generationConfig &&
        Array.isArray(parsedBody.generationConfig.responseModalities) &&
        parsedBody.generationConfig.responseModalities.includes('AUDIO');
      const mockPath = isAudio ? '/api/mock/gemini/tts' : '/api/mock/gemini/generateContent';
      return originalFetch(mockPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body || '{}'
      });
    }

    if (url.includes('api.openai.com/v1/chat/completions')) {
      return originalFetch('/api/mock/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body || '{}'
      });
    }

    if (url.includes('api-free.deepl.com/v2/translate')) {
      return originalFetch('/api/mock/deepl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body || '{}'
      });
    }

    if (url.includes('texttospeech.googleapis.com')) {
      return originalFetch('/api/mock/cloud-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body || '{}'
      });
    }

    return originalFetch(input, init);
  };

  let sermonSegments = [];
  let sermonMetadata = {};
  let replayIdx = 0;
  let replayTimer = null;

  async function loadMockSermon() {
    try {
      const res = await originalFetch('/api/mock/sermon');
      const data = await res.json();
      sermonMetadata = data.metadata || {};
      sermonSegments = data.segments || [];
      updateBarStatus();
    } catch (e) {
      console.warn('Mock sermon load failed:', e);
    }
  }

  function ensureMockApiKeys() {
    if (typeof apiKeysStore === 'object' && apiKeysStore) {
      if (!apiKeysStore.gemini) apiKeysStore.gemini = 'mock-offline-gemini-key';
      if (!apiKeysStore.openai) apiKeysStore.openai = 'mock-offline-openai-key';
      if (!apiKeysStore.deepl) apiKeysStore.deepl = 'mock-offline-deepl-key';
    }
    if (typeof userApiKey !== 'undefined' && !userApiKey) {
      userApiKey = 'mock-offline-gemini-key';
    }
  }

  function applyMockSermonContext() {
    const topicEl = document.getElementById('sermon-topic-input');
    const termsEl = document.getElementById('sermon-terms-input');
    const ctxEl = document.getElementById('sermon-context-input');
    if (topicEl && !topicEl.value) topicEl.value = sermonMetadata.title || '';
    if (termsEl && !termsEl.value) termsEl.value = sermonMetadata.key_terms || '';
    if (ctxEl && !ctxEl.value) ctxEl.value = `${sermonMetadata.scripture || ''} — ${sermonMetadata.context || ''}`.trim();
    if (typeof onTranslationContextChange === 'function') onTranslationContextChange();
  }

  function updateBarStatus(label) {
    const statusEl = document.getElementById('mock-replay-status');
    if (statusEl) {
      statusEl.innerText = label || `${replayIdx}/${sermonSegments.length}`;
    }
  }

  async function stepNextLine() {
    ensureMockApiKeys();
    if (sermonSegments.length === 0) await loadMockSermon();
    if (replayIdx >= sermonSegments.length) replayIdx = 0;
    const seg = sermonSegments[replayIdx++];
    updateBarStatus(`${replayIdx}/${sermonSegments.length} (${seg.phase})`);
    if (typeof processSpokenText === 'function') {
      await processSpokenText(seg.source_text);
    }
  }

  function stopReplay() {
    if (replayTimer) {
      clearTimeout(replayTimer);
      replayTimer = null;
    }
    updateBarStatus(`Stopped (${replayIdx}/${sermonSegments.length})`);
  }

  async function startAutoReplay() {
    stopReplay();
    ensureMockApiKeys();
    applyMockSermonContext();
    if (sermonSegments.length === 0) await loadMockSermon();
    if (replayIdx >= sermonSegments.length) replayIdx = 0;

    const runNext = async () => {
      if (replayIdx >= sermonSegments.length) {
        replayTimer = null;
        updateBarStatus(`Done (${sermonSegments.length}/${sermonSegments.length})`);
        return;
      }
      const seg = sermonSegments[replayIdx];
      await stepNextLine();
      const delayMs = Math.max(800, Math.round((seg.delay_sec || 2.5) * 1000));
      replayTimer = setTimeout(runNext, delayMs);
    };
    runNext();
  }

  function mountReplayBar() {
    if (document.getElementById('mock-replay-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'mock-replay-bar';
    bar.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:9999;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:rgba(15,23,42,0.95);border:1px solid rgba(99,102,241,0.55);color:#e2e8f0;font-family:Inter,sans-serif;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,0.45);';
    bar.innerHTML = `
      <span style="font-weight:700;color:#818cf8;">MOCK MODE</span>
      <button id="mock-btn-play" style="cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid #4f46e5;background:#4f46e5;color:#fff;font-weight:600;">▶ Replay Sermon</button>
      <button id="mock-btn-step" style="cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;">⏭ Next</button>
      <button id="mock-btn-stop" style="cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;">⏹ Stop</button>
      <span id="mock-replay-status" style="color:#94a3b8;min-width:56px;">0/0</span>
    `;
    document.body.appendChild(bar);
    document.getElementById('mock-btn-play').onclick = startAutoReplay;
    document.getElementById('mock-btn-step').onclick = stepNextLine;
    document.getElementById('mock-btn-stop').onclick = stopReplay;
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureMockApiKeys();
    mountReplayBar();
    loadMockSermon();
  });
})();
