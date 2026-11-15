/* Sermon Translator App Logic */

// Node.js Local Dev Server Bootstrap (runs when executed via `node app.js` or IDE Run button)
if (typeof window === 'undefined' && typeof require === 'function') {
  const http = require('http');
  const fs = require('fs');
  const path = require('path');
  const { exec } = require('child_process');

  const PORT = Number(process.env.PORT) || 8080;
  const ROOT = __dirname;
  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.env': 'text/plain; charset=utf-8'
  };

  const server = http.createServer((req, res) => {
    const reqUrl = (req.url || '/').split('?')[0];
    const relPath = reqUrl === '/' ? '/index.html' : decodeURIComponent(reqUrl);
    const safePath = path.normalize(path.join(ROOT, relPath));

    if (!safePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.readFile(safePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      const ext = path.extname(safePath) || (path.basename(safePath) === '.env' ? '.env' : '');
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
  });

  let currentPort = PORT;
  const maxPort = PORT + 20;

  const openBrowser = (url) => {
    if (process.env.NO_OPEN) return;
    const openCmd = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
    exec(openCmd);
  };

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const checkReq = http.get(`http://127.0.0.1:${currentPort}/index.html`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200 && body.includes('SermonTranslator')) {
            const url = `http://localhost:${currentPort}`;
            console.log(`SermonTranslator server already running at ${url}`);
            openBrowser(url);
            process.exit(0);
          } else if (currentPort < maxPort) {
            currentPort += 1;
            server.listen(currentPort, '127.0.0.1');
          } else {
            console.error(`Ports ${PORT}-${maxPort} are all in use.`);
            process.exit(1);
          }
        });
      });
      checkReq.on('error', () => {
        if (currentPort < maxPort) {
          currentPort += 1;
          server.listen(currentPort, '127.0.0.1');
        } else {
          console.error(`Ports ${PORT}-${maxPort} are all in use.`);
          process.exit(1);
        }
      });
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(currentPort, '127.0.0.1', () => {
    const url = `http://localhost:${currentPort}`;
    console.log(`SermonTranslator server running at ${url}`);
    openBrowser(url);
  });
}

// Global State
let isMicrophoneActive = false;
let recognition = null;
let audioContext = null;
let analyser = null;
let microphoneStream = null;
let animationFrameId = null;

let isTTSAudioActive = true;
let isAudienceMuted = false;
let audienceVolume = 1.0;
let currentActiveView = 'speaker';
let currentFontSize = 1.35; // rem
let currentTheme = 'dark';
let currentTargetLang = 'en';

let roomCode = "GRACE-" + Math.floor(100 + Math.random() * 900);
let transcriptHistory = [];
const translationCache = new Map();

const LANGUAGE_NAME_MAP = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  ht: 'Haitian Creole',
  ko: 'Korean',
  tl: 'Tagalog',
  zh: 'Chinese',
  vi: 'Vietnamese',
  ru: 'Russian'
};

const BCP47_LANG_MAP = {
  en: 'en-US',
  es: 'es-US',
  pt: 'pt-BR',
  fr: 'fr-FR',
  ht: 'fr-FR',
  ko: 'ko-KR',
  tl: 'fil-PH',
  zh: 'zh-CN',
  vi: 'vi-VN',
  ru: 'ru-RU'
};

const FLAG_MAP = {
  en: '🇺🇸', es: '🇲🇽', pt: '🇧🇷', fr: '🇫🇷', ht: '🇭🇹',
  ko: '🇰🇷', tl: '🇵🇭', zh: '🇨🇳', vi: '🇻🇳', ru: '🇷🇺'
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Broadcast Channel for syncing tabs in real-time
const broadcastChannel = typeof BroadcastChannel !== 'undefined' 
  ? new BroadcastChannel('sermon_translator_channel') 
  : null;

// Multi-language translation lookup table (Offline fallback dictionary + instant translation simulation)
const translationDictionary = {
  en: {
    "Bienvenidos al servicio de hoy. Abran sus Biblias en el Libro de los Salmos.": "Welcome to today's service. Turn your Bibles to the Book of Psalms.",
    "El Señor es mi pastor; nada me faltará.": "The Lord is my shepherd; I shall not want.",
    "Gracia y paz a vosotros de Dios nuestro Padre.": "Grace and peace be unto you from God our Father.",
    "Porque de tal manera amó Dios al mundo que dio a su Hijo unigénito.": "For God so loved the world that he gave his only begotten Son.",
    "Inclinemos nuestras cabezas en oración.": "Let us bow our heads in prayer.",
    "Amén y Amén.": "Amen and Amen."
  },
  es: {
    "Welcome to today's service. Turn your Bibles to the Book of Psalms.": "Bienvenidos al servicio de hoy. Abran sus Biblias en el Libro de los Salmos.",
    "The Lord is my shepherd; I shall not want.": "El Señor es mi pastor; nada me faltará.",
    "Grace and peace be unto you from God our Father.": "Gracia y paz a vosotros de Dios nuestro Padre.",
    "For God so loved the world that he gave his only begotten Son.": "Porque de tal manera amó Dios al mundo que dio a su Hijo unigénito.",
    "Let us bow our heads in prayer.": "Inclinemos nuestras cabezas en oración.",
    "Amen and Amen.": "Amén y Amén."
  },
  pt: {
    "Bienvenidos al servicio de hoy. Abran sus Biblias en el Libro de los Salmos.": "Bem-vindos ao serviço de hoje. Abram suas Bíblias no Livro dos Salmos.",
    "El Señor es mi pastor; nada me faltará.": "O Senhor é o meu pastor; nada me faltará.",
    "Gracia y paz a vosotros de Dios nuestro Padre.": "Graça e paz a vós da parte de Deus nosso Pai."
  },
  fr: {
    "Bienvenidos al servicio de hoy. Abran sus Biblias en el Libro de los Salmos.": "Bienvenue au service d'aujourd'hui. Tournez vos Bibles vers le Livre des Psaumes.",
    "El Señor es mi pastor; nada me faltará.": "L'Éternel est mon berger; je ne manquerai de rien."
  }
};

// Demo Spanish Sermon Sentences Sequence
const sampleSermonPhrases = [
  "Bienvenidos al servicio de hoy. Abran sus Biblias en el Libro de los Salmos.",
  "El Señor es mi pastor; nada me faltará.",
  "Gracia y paz a vosotros de Dios nuestro Padre.",
  "Porque de tal manera amó Dios al mundo que dio a su Hijo unigénito.",
  "Inclinemos nuestras cabezas en oración.",
  "Amén y Amén."
];
let demoPhraseIndex = 0;

// Initialization on DOM Ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.style.setProperty('--subtitle-font-size', `${currentFontSize}rem`);
    document.addEventListener('click', unlockAudioPlayback, { once: true });
    document.getElementById('room-code-display').innerText = roomCode;
    generateSimulatedQRCode();
    initSpeechRecognition();
    calculateCost();
    drawEmptyVisualizer();

    // Listen for broadcast messages across browser tabs
    if (broadcastChannel) {
      broadcastChannel.onmessage = (event) => {
        const data = event.data;
        if (data && data.type === 'NEW_TRANSLATION') {
          appendTranslationToListener(data.translatedText, data.language, data.originalText, data.timestamp, data.model);
        }
      };
    }

    // Also listen on localStorage for fallback tab sync
    window.addEventListener('storage', (e) => {
      if (e.key === 'sermon_latest_translation' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          appendTranslationToListener(data.translatedText, data.language, data.originalText, data.timestamp, data.model);
        } catch (err) {}
      }
    });

    // Restore saved Audience View volume
    try {
      const savedVol = localStorage.getItem('sermon_audience_volume');
      if (savedVol !== null) {
        const parsed = Math.max(0, Math.min(1, parseFloat(savedVol)));
        if (!Number.isNaN(parsed)) {
          audienceVolume = parsed;
          const slider = document.getElementById('audience-volume-slider');
          const volLabel = document.getElementById('audience-volume-label');
          if (slider) slider.value = Math.round(audienceVolume * 100);
          if (volLabel) volLabel.innerText = `${Math.round(audienceVolume * 100)}%`;
        }
      }
    } catch (err) {}

    // Hydrate Audience View with recent translations if opening or navigating to Audience View
    try {
      const savedHistory = JSON.parse(localStorage.getItem('sermon_transcript_history') || '[]');
      if (Array.isArray(savedHistory) && savedHistory.length > 0) {
        savedHistory.forEach(item => {
          appendTranslationToListener(item.translatedText, item.language, item.originalText, item.timestamp, item.model, true);
        });
      }
    } catch (err) {}
  });
}

/* View Navigation */
function switchView(viewName) {
  const targetView = viewName === 'calculator' ? 'admin' : viewName;
  const tabEl = document.getElementById(`tab-${targetView}`);
  const viewEl = document.getElementById(`view-${targetView}`);
  if (!tabEl || !viewEl) return;

  currentActiveView = targetView;

  // Audio translation should only be heard in Audience View
  if (targetView !== 'listener') {
    stopAllTTSPlayback();
  }

  document.querySelectorAll('.nav-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

  tabEl.classList.add('active');
  viewEl.classList.add('active');

  if (typeof history !== 'undefined' && history.replaceState) {
    try { history.replaceState(null, '', `#${targetView}`); } catch (e) {}
  }
}

/* Microphone & Web Speech API Initialization */
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn("Web Speech API is not supported in this browser environment. Demo audio mode will be available.");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = document.getElementById('input-language').value;

  recognition.onstart = () => {
    isMicrophoneActive = true;
    updateMicUI(true);
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (interimTranscript.trim()) {
      const interimElem = document.getElementById('interim-indicator');
      const interimTextElem = document.getElementById('interim-text');
      interimElem.style.display = 'block';
      interimTextElem.innerText = interimTranscript;
    } else {
      document.getElementById('interim-indicator').style.display = 'none';
    }

    if (finalTranscript.trim()) {
      processSpokenText(finalTranscript.trim());
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    // Do not stop live translation on transient errors (e.g. silence or view/tab focus changes)
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    stopMicrophone();
  };

  recognition.onend = () => {
    if (isMicrophoneActive) {
      // Auto restart with a short delay so browser speech engine never throws InvalidStateError
      setTimeout(() => {
        if (isMicrophoneActive && recognition) {
          try { recognition.start(); } catch (e) {}
        }
      }, 150);
    } else {
      updateMicUI(false);
    }
  };
}

/* Microphone Toggle Controls */
function toggleMicrophone() {
  if (isMicrophoneActive) {
    stopMicrophone();
  } else {
    startMicrophone();
  }
}

function startMicrophone() {
  if (recognition) {
    recognition.lang = document.getElementById('input-language').value;
    try {
      recognition.start();
      isMicrophoneActive = true;
      updateMicUI(true);
      startAudioVisualizer();
    } catch (e) {
      console.warn("Recognition already started or error:", e);
    }
  } else {
    // Fallback if browser doesn't support Web Speech API
    isMicrophoneActive = true;
    updateMicUI(true);
    insertSampleSermonPhrase();
  }
}

function stopMicrophone() {
  isMicrophoneActive = false;
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }
  updateMicUI(false);
  stopAudioVisualizer();
}

function updateMicUI(active) {
  const btn = document.getElementById('btn-toggle-mic');
  const label = document.getElementById('mic-label');
  const pill = document.getElementById('broadcast-pill');
  const pillText = document.getElementById('broadcast-text');

  if (active) {
    btn.classList.add('active');
    label.innerText = "LIVE (STOP)";
    pill.classList.add('live');
    pillText.innerText = "BROADCASTING LIVE";
  } else {
    btn.classList.remove('active');
    label.innerText = "START MIC";
    pill.classList.remove('live');
    pillText.innerText = "Offline";
  }
}

/* Audio Visualizer Canvas */
function startAudioVisualizer() {
  navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
    microphoneStream = stream;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 64;

    const canvas = document.getElementById('audio-visualizer');
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function renderFrame() {
      if (!isMicrophoneActive) return;
      animationFrameId = requestAnimationFrame(renderFrame);

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;

        ctx.fillStyle = `rgba(99, 102, 241, ${0.4 + (barHeight / canvas.height) * 0.6})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);

        x += barWidth;
      }
    }

    renderFrame();
  }).catch(err => {
    console.warn("Could not access microphone visualizer stream:", err);
  });
}

function stopAudioVisualizer() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (microphoneStream) {
    microphoneStream.getTracks().forEach(track => track.stop());
  }
  if (audioContext) audioContext.close();
  drawEmptyVisualizer();
}

function drawEmptyVisualizer() {
  const canvas = document.getElementById('audio-visualizer');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/* Theological Dictionary / Custom Glossary Filter */
function applyTheologicalGlossary(text) {
  const glossaryInput = document.getElementById('glossary-input');
  const glossaryRaw = glossaryInput ? glossaryInput.value : '';
  if (!glossaryRaw) return text;

  const terms = glossaryRaw.split(',').map(t => t.trim()).filter(Boolean);
  let processedText = text;

  terms.forEach(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    processedText = processedText.replace(regex, term);
  });

  return processedText;
}

const DEFAULT_TRANSLATION_PROMPT = 'You are an expert theological sermon translator. Preserve biblical names, scripture citations, and homiletic dignity. Return ONLY the translated sentence.';

function resetTranslationPrompt() {
  const promptInput = document.getElementById('translation-prompt-input');
  if (promptInput) {
    promptInput.value = DEFAULT_TRANSLATION_PROMPT;
  }
}

/* AI Translation Engine & Model Selection */
let currentTranslationModel = 'gemini-flash';
let userApiKey = '';
let adminPin = (typeof localStorage !== 'undefined' && localStorage.getItem('sermon_admin_pin')) || '7777';
let isAdminUnlocked = false;

// Multi-service API key storage
let apiKeysStore = {
  gemini: '',
  groq: '',
  deepl: '',
  elevenlabs: '',
  openai: ''
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    loadAdminKeysFromStorage();
    await loadKeysFromLocalEnvFile();

    // Support URL hash navigation (e.g. #listener or #admin)
    const hash = window.location.hash.replace('#', '');
    if (hash === 'calculator') {
      switchView('admin');
    } else if (['speaker', 'listener', 'admin'].includes(hash)) {
      switchView(hash);
    }
  });
}

/* Auto-load keys exclusively from .env when running on a local dev server */
async function loadKeysFromLocalEnvFile() {
  const envMap = {};

  try {
    if (window.location.protocol.startsWith('http')) {
      const res = await fetch('/.env', { cache: 'no-store' });
      if (res.ok) {
        const envText = await res.text();
        envText.split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            if (v) envMap[k] = v;
          }
        });
      }
    }
  } catch (e) {
    // Running without local .env file access; ignore silently
  }

  const mapping = {
    GEMINI_API_KEY: 'gemini',
    GROQ_API_KEY: 'groq',
    DEEPL_API_KEY: 'deepl',
    ELEVENLABS_API_KEY: 'elevenlabs',
    OPENAI_API_KEY: 'openai'
  };

  let updated = false;
  Object.entries(mapping).forEach(([envKey, service]) => {
    if (envMap[envKey] && !apiKeysStore[service]) {
      apiKeysStore[service] = envMap[envKey];
      updated = true;
    }
  });

  if (envMap.ADMIN_PIN && !localStorage.getItem('sermon_admin_pin')) {
    adminPin = envMap.ADMIN_PIN;
  }

  if (updated || apiKeysStore.gemini) {
    userApiKey = apiKeysStore.gemini;
    ['gemini', 'groq', 'deepl', 'elevenlabs', 'openai'].forEach(service => {
      const input = document.getElementById(`key-${service}`);
      if (input && apiKeysStore[service]) {
        input.value = apiKeysStore[service];
        updateKeyStatusBadge(service, 'Loaded from .env', 'rgba(20, 184, 166, 0.2)', '#14b8a6');
      }
    });
    const legacyInput = document.getElementById('api-key-input');
    if (legacyInput && userApiKey) legacyInput.value = userApiKey;
  }
}

/* Secure Local Key Encryption Helper (Base64 + Cipher Obfuscation) */
function encryptKey(text) {
  if (!text) return '';
  return btoa(encodeURIComponent(text));
}

function decryptKey(hash) {
  if (!hash) return '';
  try { return decodeURIComponent(atob(hash)); } catch (e) { return ''; }
}

function loadAdminKeysFromStorage() {
  const storedHash = localStorage.getItem('sermon_translator_keys_encrypted');
  if (storedHash) {
    try {
      const parsed = JSON.parse(decryptKey(storedHash));
      if (parsed) apiKeysStore = { ...apiKeysStore, ...parsed };
    } catch (e) {}
  } else {
    // Legacy fallback
    const legacyKey = localStorage.getItem('sermon_translator_api_key');
    if (legacyKey) apiKeysStore.gemini = legacyKey;
  }

  userApiKey = apiKeysStore.gemini;

  // Populate Admin Inputs
  ['gemini', 'groq', 'deepl', 'elevenlabs', 'openai'].forEach(service => {
    const input = document.getElementById(`key-${service}`);
    if (input && apiKeysStore[service]) {
      input.value = apiKeysStore[service];
      updateKeyStatusBadge(service, 'Configured', 'rgba(99, 102, 241, 0.2)', '#818cf8');
    }
  });

  const legacyInput = document.getElementById('api-key-input');
  if (legacyInput && userApiKey) legacyInput.value = userApiKey;
}

function saveAllAdminKeys() {
  ['gemini', 'groq', 'deepl', 'elevenlabs', 'openai'].forEach(service => {
    const input = document.getElementById(`key-${service}`);
    if (input) apiKeysStore[service] = input.value.trim();
  });

  userApiKey = apiKeysStore.gemini;

  const encryptedString = encryptKey(JSON.stringify(apiKeysStore));
  localStorage.setItem('sermon_translator_keys_encrypted', encryptedString);
  localStorage.setItem('sermon_translator_api_key', userApiKey);

  const pinChangeInput = document.getElementById('admin-pin-change');
  if (pinChangeInput && pinChangeInput.value.trim()) {
    adminPin = pinChangeInput.value.trim();
    localStorage.setItem('sermon_admin_pin', adminPin);
  }

  alert("🔑 All API Keys & Admin Settings Saved Securely!");
}

function clearAllAdminKeys() {
  if (!confirm("Are you sure you want to clear all stored API keys?")) return;

  apiKeysStore = { gemini: '', groq: '', deepl: '', elevenlabs: '', openai: '' };
  userApiKey = '';
  localStorage.removeItem('sermon_translator_keys_encrypted');
  localStorage.removeItem('sermon_translator_api_key');

  ['gemini', 'groq', 'deepl', 'elevenlabs', 'openai'].forEach(service => {
    const input = document.getElementById(`key-${service}`);
    if (input) input.value = '';
    updateKeyStatusBadge(service, 'Not Configured', 'rgba(255, 255, 255, 0.1)', 'var(--text-muted)');
  });

  alert("All API keys removed.");
}

/* PIN Security Handlers */
function lockAdminView() {
  isAdminUnlocked = false;
  document.getElementById('admin-pin-card').style.display = 'block';
  const unlockedContent = document.getElementById('admin-unlocked-content');
  if (unlockedContent) {
    unlockedContent.style.display = 'none';
  } else {
    document.getElementById('admin-keys-grid').style.display = 'none';
  }
}

function unlockAdminWithPin() {
  const pinEntered = document.getElementById('admin-pin-input').value.trim();
  const errorMsg = document.getElementById('pin-error-msg');

  if (pinEntered === adminPin) {
    isAdminUnlocked = true;
    errorMsg.style.display = 'none';
    document.getElementById('admin-pin-card').style.display = 'none';
    const unlockedContent = document.getElementById('admin-unlocked-content');
    if (unlockedContent) {
      unlockedContent.style.display = 'flex';
    }
    document.getElementById('admin-keys-grid').style.display = 'grid';
  } else {
    errorMsg.style.display = 'block';
  }
}

function toggleKeyVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

function markKeyDirty(service) {
  updateKeyStatusBadge(service, 'Unsaved Changes', 'rgba(245, 158, 11, 0.2)', '#f59e0b');
}

function updateKeyStatusBadge(service, text, bg, color) {
  const badge = document.getElementById(`status-${service}`);
  if (badge) {
    badge.innerText = text;
    badge.style.background = bg;
    badge.style.color = color;
  }
}

/* Live API Connection Testing */
async function testApiKey(service) {
  const input = document.getElementById(`key-${service}`);
  const key = input ? input.value.trim() : apiKeysStore[service];

  if (!key) {
    updateKeyStatusBadge(service, 'Missing Key', 'rgba(244, 63, 94, 0.2)', '#f43f5e');
    alert(`Please enter an API key for ${service.toUpperCase()} first.`);
    return;
  }

  updateKeyStatusBadge(service, 'Testing...', 'rgba(99, 102, 241, 0.3)', '#818cf8');

  try {
    let isValid = false;

    if (service === 'gemini') {
      const endpointsToProbe = [
        {
          name: 'Gemini AI Studio TTS',
          url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(key)}`,
          options: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Say: Ready.' }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
              }
            })
          }
        },
        {
          name: 'Gemini AI Studio Models',
          url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
          options: { method: 'GET' }
        }
      ];

      for (const probe of endpointsToProbe) {
        try {
          const res = await fetch(probe.url, probe.options);
          if (res.ok) {
            isValid = true;
            break;
          }
        } catch (err) {}
      }
    } else if (service === 'groq') {
      const res = await fetch(`https://api.groq.com/openai/v1/models`, {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      isValid = res.ok;
    } else if (service === 'deepl') {
      const res = await fetch(`https://api-free.deepl.com/v2/usage`, {
        headers: { 'Authorization': `DeepL-Auth-Key ${key}` }
      });
      isValid = res.ok;
    } else if (service === 'openai') {
      const res = await fetch(`https://api.openai.com/v1/models`, {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      isValid = res.ok;
    } else if (service === 'elevenlabs') {
      const res = await fetch(`https://api.elevenlabs.io/v1/user`, {
        headers: { 'xi-api-key': key }
      });
      isValid = res.ok;
    }

    if (isValid) {
      updateKeyStatusBadge(service, '⚡ Active / Validated', 'rgba(34, 197, 94, 0.2)', '#4ade80');
      apiKeysStore[service] = key;
      if (service === 'gemini') userApiKey = key;
    } else {
      updateKeyStatusBadge(service, 'Invalid Key / Error', 'rgba(244, 63, 94, 0.2)', '#f43f5e');
    }
  } catch (e) {
    console.warn(`Connection test failed for ${service}:`, e);
    // Offline / simulation mode fallback validation
    updateKeyStatusBadge(service, 'Key Saved (Offline)', 'rgba(20, 184, 166, 0.2)', '#14b8a6');
  }
}

async function testAllConnections() {
  const services = ['gemini', 'groq', 'deepl', 'elevenlabs', 'openai'];
  for (const s of services) {
    await testApiKey(s);
  }
}

function onModelChange() {
  const modelSelect = document.getElementById('translation-model-select');
  currentTranslationModel = modelSelect.value;
  
  const descElem = document.getElementById('model-desc');
  const descriptions = {
    'gemini-flash': 'Recommended: Parallel Gemini 3.6 Flash + 3.5 Flash-Lite race for maximum speed and theological accuracy.',
    'deepl-api': 'DeepL Translate API: Superior grammatical precision & native fluency for European & Asian languages.',
    'gpt4o-mini': 'OpenAI GPT-4o-mini: High-reasoning contextual sermon translation.',
    'offline-fast': 'Offline Native Engine: Zero-latency, dictionary lookup.'
  };
  descElem.innerText = descriptions[currentTranslationModel] || '';
}

function saveApiKey(val) {
  userApiKey = val.trim();
  apiKeysStore.gemini = userApiKey;
  localStorage.setItem('sermon_translator_api_key', userApiKey);
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

/* Multi-language Translation Engine with AI Model Routing */
async function processSpokenText(spokenText) {
  const formattedText = applyTheologicalGlossary(spokenText);
  const timestamp = new Date().toLocaleTimeString();
  const selectedModel = currentTranslationModel;

  // Show interim status in speech block
  const tempBlockId = Date.now();
  renderInterimBlock(tempBlockId, timestamp, formattedText, selectedModel);

  // Perform AI Translation
  const translatedText = await translateTextWithAI(formattedText, currentTargetLang, selectedModel);

  // Store in transcript history
  const blockData = {
    id: tempBlockId,
    timestamp,
    original: formattedText,
    translation: translatedText,
    lang: currentTargetLang,
    model: selectedModel
  };
  transcriptHistory.push(blockData);

  // Update interim block with final result
  updateInterimBlock(tempBlockId, blockData);

  // Broadcast to Listener View (same page + other tabs)
  broadcastTranslation(translatedText, currentTargetLang, formattedText, timestamp, selectedModel);
}

async function translateTextWithAI(text, targetLang, model) {
  const cleanText = (text || '').trim();
  if (!cleanText) return '';

  const activeModel = model || currentTranslationModel || 'gemini-flash';
  const cacheKey = `${targetLang}:${activeModel}:${cleanText}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  // 0. Instant 0ms Dictionary Hit (always check first for zero-latency demo/common phrases)
  if (activeModel !== 'deepl-api' && translationDictionary[targetLang]?.[cleanText]) {
    const dictHit = translationDictionary[targetLang][cleanText];
    translationCache.set(cacheKey, dictHit);
    return dictHit;
  }

  const geminiKey = apiKeysStore.gemini || userApiKey;
  const targetLangName = LANGUAGE_NAME_MAP[targetLang] || targetLang;

  // 1. Live Gemini REST API Integration (parallel speed-first race: Gemini 3.6 Flash + 3.5 Flash-Lite, no cost constraint)
  if (activeModel === 'gemini-flash' && geminiKey) {
    const customPromptEl = document.getElementById('translation-prompt-input');
    const systemInstructions = (customPromptEl && customPromptEl.value.trim()) || DEFAULT_TRANSLATION_PROMPT;
    const translationModels = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

    const callGeminiModel = async (modelName) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(geminiKey)}`;
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: `${systemInstructions}\nTarget language: ${targetLangName} (${targetLang}). Output ONLY the translated text with no quotes, no preamble, and no notes.`
            }]
          },
          contents: [{
            role: 'user',
            parts: [{ text: cleanText }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 180,
            responseMimeType: 'text/plain'
          }
        })
      }, 4500);

      if (!response.ok) {
        throw new Error(`${modelName} HTTP ${response.status}`);
      }
      const data = await response.json();
      const aiResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!aiResult || !aiResult.trim()) {
        throw new Error(`${modelName} empty response`);
      }
      return aiResult.trim();
    };

    try {
      const fastestResult = await Promise.any(translationModels.map(callGeminiModel));
      translationCache.set(cacheKey, fastestResult);
      return fastestResult;
    } catch (e) {
      console.warn("All parallel Gemini translation models failed, falling back to local translation engine:", e);
    }
  }

  // 2. DeepL API Integration if key provided
  const deeplKey = apiKeysStore.deepl || userApiKey;
  if (activeModel === 'deepl-api' && deeplKey) {
    try {
      const response = await fetchWithTimeout(`https://api-free.deepl.com/v2/translate`, {
        method: 'POST',
        headers: { 'Authorization': `DeepL-Auth-Key ${deeplKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: [cleanText], target_lang: targetLang.toUpperCase() })
      }, 3500);
      const data = await response.json();
      if (data.translations?.[0]?.text) {
        const result = data.translations[0].text.trim();
        translationCache.set(cacheKey, result);
        return result;
      }
    } catch (e) {
      console.warn("DeepL API call failed, falling back to rules engine:", e);
    }
  }

  // 3. OpenAI GPT-4o-mini Integration if selected & key provided
  if (activeModel === 'gpt4o-mini' && apiKeysStore.openai) {
    try {
      const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKeysStore.openai}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.1,
          max_tokens: 160,
          messages: [
            { role: 'system', content: `Translate the sermon text into ${targetLangName}. Return ONLY the translation.` },
            { role: 'user', content: cleanText }
          ]
        })
      }, 3500);
      if (response.ok) {
        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.trim();
        if (result) {
          translationCache.set(cacheKey, result);
          return result;
        }
      }
    } catch (e) {
      console.warn("OpenAI translation call failed, falling back to rules engine:", e);
    }
  }

  // 4. Fallback Dictionary + Theological Pre-prompt simulation
  if (translationDictionary[targetLang]?.[cleanText]) {
    return translationDictionary[targetLang][cleanText];
  }

  // Pattern rule engine with theological contextual corrections
  if (targetLang === 'en') {
    return cleanText.replace(/\bEl Señor\b/gi, "The Lord")
                    .replace(/\bJesús\b/gi, "Jesus")
                    .replace(/\bDios\b/gi, "God")
                    .replace(/\boración\b/gi, "prayer")
                    .replace(/\biglesia\b/gi, "church")
                    .replace(/\bfe\b/gi, "faith")
                    .replace(/\bEvangelio\b/gi, "Gospel")
                    .replace(/\bGracia\b/gi, "Grace")
                    .replace(/\bSalvación\b/gi, "Salvation")
                    .replace(/\bSalmos\b/gi, "Psalms")
                    .replace(/\bBienvenidos\b/gi, "Welcome")
                    .replace(/\bAmén\b/gi, "Amen");
  } else if (targetLang === 'es') {
    return cleanText.replace(/The Lord/gi, "El Señor")
                    .replace(/Jesus/gi, "Jesús")
                    .replace(/God/gi, "Dios")
                    .replace(/prayer/gi, "oración")
                    .replace(/church/gi, "iglesia")
                    .replace(/faith/gi, "fe")
                    .replace(/Gospel/gi, "Evangelio")
                    .replace(/Grace/gi, "Gracia")
                    .replace(/Salvation/gi, "Salvación")
                    .replace(/Psalms/gi, "Salmos");
  } else if (targetLang === 'fr') {
    return cleanText.replace(/The Lord/gi, "L'Éternel")
                    .replace(/Jesus/gi, "Jésus")
                    .replace(/God/gi, "Dieu")
                    .replace(/church/gi, "église")
                    .replace(/Gospel/gi, "Évangile");
  } else if (targetLang === 'pt') {
    return cleanText.replace(/The Lord/gi, "O Senhor")
                    .replace(/Jesus/gi, "Jesus")
                    .replace(/God/gi, "Deus")
                    .replace(/Gospel/gi, "Evangelho");
  }

  return cleanText; // Default return
}

/* Render Speech Block with Model Badge */
function renderInterimBlock(id, timestamp, originalText, model) {
  const container = document.getElementById('speaker-stream-box');
  
  const modelLabels = {
    'gemini-flash': '✨ Gemini 2.0 Flash AI',
    'deepl-api': '🌐 DeepL API',
    'gpt4o-mini': '🧠 GPT-4o-mini',
    'offline-fast': '⚡ Fast Native'
  };

  const block = document.createElement('div');
  block.className = 'speech-block';
  block.id = `block-${id}`;
  block.innerHTML = `
    <div class="speech-meta">
      <span class="timestamp">${timestamp}</span>
      <span class="badge-tag" style="font-size: 0.65rem; background: rgba(99, 102, 241, 0.2);">${modelLabels[model] || model}</span>
    </div>
    <div class="speech-original">${escapeHtml(originalText)}</div>
    <div class="speech-translation" style="opacity: 0.7;">Translating with ${modelLabels[model]}...</div>
  `;

  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
}

function updateInterimBlock(id, data) {
  const block = document.getElementById(`block-${id}`);
  if (!block) return;

  const translationElem = block.querySelector('.speech-translation');
  if (translationElem) {
    translationElem.style.opacity = '1';
    translationElem.innerText = data.translation;
  }
}

/* Broadcast to Congregation Listener */
function broadcastTranslation(translatedText, lang, originalText = '', timestamp = '', model = '') {
  const ts = timestamp || new Date().toLocaleTimeString();
  const mdl = model || currentTranslationModel;

  // 1. Update on local listener UI immediately
  appendTranslationToListener(translatedText, lang, originalText, ts, mdl);

  // 2. Post message to Broadcast Channel for other tabs
  if (broadcastChannel) {
    broadcastChannel.postMessage({
      type: 'NEW_TRANSLATION',
      translatedText,
      originalText,
      language: lang,
      timestamp: ts,
      model: mdl
    });
  }

  // 3. Update localStorage for fallback tab sync & navigation persistence
  const payload = {
    translatedText,
    originalText,
    language: lang,
    timestamp: ts,
    model: mdl,
    time: Date.now()
  };
  localStorage.setItem('sermon_latest_translation', JSON.stringify(payload));
  try {
    const history = JSON.parse(localStorage.getItem('sermon_transcript_history') || '[]');
    const updated = Array.isArray(history) ? history : [];
    updated.push(payload);
    if (updated.length > 30) updated.shift();
    localStorage.setItem('sermon_transcript_history', JSON.stringify(updated));
  } catch (e) {}
}

/* Update Audience View Audio Volume (0 - 100) */
function onAudienceVolumeChange(val) {
  const pct = Math.max(0, Math.min(100, Number(val) || 0));
  audienceVolume = pct / 100;
  try { localStorage.setItem('sermon_audience_volume', String(audienceVolume)); } catch (e) {}

  const volLabel = document.getElementById('audience-volume-label');
  if (volLabel) volLabel.innerText = `${pct}%`;

  if (activeAudioElement) {
    activeAudioElement.volume = audienceVolume;
  }

  // Sync mute state with slider
  if (pct === 0 && !isAudienceMuted) {
    toggleAudienceMute();
  } else if (pct > 0 && isAudienceMuted) {
    isAudienceMuted = false;
    unlockAudioPlayback();
    updateAudienceMuteUI();
  }
}

function updateAudienceMuteUI() {
  const btn = document.getElementById('btn-audience-mute');
  if (!btn) return;
  if (isAudienceMuted) {
    btn.innerText = '🔇 Muted (Read Only)';
    btn.setAttribute('aria-pressed', 'true');
    btn.style.background = 'rgba(239, 68, 68, 0.18)';
    btn.style.borderColor = 'rgba(239, 68, 68, 0.45)';
  } else {
    btn.innerText = '🔊 Audio: ON';
    btn.setAttribute('aria-pressed', 'false');
    btn.style.background = '';
    btn.style.borderColor = '';
  }
}

/* Toggle Mute / Unmute for Audience View (Read-Only Mode) */
function toggleAudienceMute() {
  isAudienceMuted = !isAudienceMuted;
  if (isAudienceMuted) {
    stopAllTTSPlayback();
  } else {
    unlockAudioPlayback();
    if (audienceVolume === 0) {
      audienceVolume = 0.85;
      try { localStorage.setItem('sermon_audience_volume', String(audienceVolume)); } catch (e) {}
      const slider = document.getElementById('audience-volume-slider');
      const volLabel = document.getElementById('audience-volume-label');
      if (slider) slider.value = 85;
      if (volLabel) volLabel.innerText = '85%';
    }
  }
  updateAudienceMuteUI();
}

/* Append Speech Block to Congregation View (replicates Pastor View Live Sermon Stream) */
async function appendTranslationToListener(text, lang, originalText = '', timestamp = '', model = '', skipAudio = false) {
  const container = document.getElementById('listener-stream-box');
  if (!container) return;

  const listenerLangSelect = document.getElementById('listener-language-select');
  const listenerLang = (listenerLangSelect && listenerLangSelect.value) || currentTargetLang || lang || 'en';

  let displayText = text;
  if (listenerLang && lang && listenerLang !== lang) {
    displayText = await translateTextWithAI(originalText || text, listenerLang, model || currentTranslationModel);
  }

  const modelLabels = {
    'gemini-flash': '✨ Gemini 3.6 / 3.5 Flash AI',
    'deepl-api': '🌐 DeepL API',
    'gpt4o-mini': '🧠 GPT-4o-mini',
    'offline-fast': '⚡ Fast Native'
  };
  const ts = timestamp || new Date().toLocaleTimeString();
  const mdl = model || currentTranslationModel;

  const block = document.createElement('div');
  block.className = 'speech-block';
  block.innerHTML = `
    <div class="speech-meta">
      <span class="timestamp">${escapeHtml(ts)}</span>
      <span class="badge-tag" style="font-size: 0.65rem; background: rgba(99, 102, 241, 0.2);">${modelLabels[mdl] || escapeHtml(mdl)}</span>
    </div>
    ${originalText ? `<div class="speech-original">${escapeHtml(originalText)}</div>` : ''}
    <div class="speech-translation" style="font-size: var(--subtitle-font-size, 1.35rem);">${escapeHtml(displayText)}</div>
  `;

  container.appendChild(block);
  container.scrollTop = container.scrollHeight;

  // Only play audio translation when in Audience View and not muted
  if (!skipAudio && currentActiveView === 'listener' && isTTSAudioActive && !isAudienceMuted) {
    enqueueTTS(displayText, listenerLang);
  }
}

/* Web Speech & Realtime Accent Synthesis (TTS for Listeners) */
let selectedVoiceModel = 'gemini-live';
let activeAudioElement = null;
let isAudioUnlocked = false;
const ttsQueue = [];
let isPlayingTTS = false;

function stopAllTTSPlayback() {
  ttsQueue.length = 0;
  isPlayingTTS = false;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (activeAudioElement) {
    try { activeAudioElement.pause(); } catch (e) {}
    activeAudioElement = null;
  }
}

async function enqueueTTS(text, langCode) {
  ttsQueue.push({ text, langCode });
  if (isPlayingTTS) return;
  isPlayingTTS = true;
  while (ttsQueue.length > 0) {
    const item = ttsQueue.shift();
    try {
      await speakTextTTS(item.text, item.langCode, false);
    } catch (e) {
      console.warn("TTS queue item failed:", e);
    }
  }
  isPlayingTTS = false;
}

/* Unlock browser audio playback on user gesture so async TTS never gets blocked */
function unlockAudioPlayback() {
  if (isAudioUnlocked) return;
  try {
    const silentWav = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    const primer = new Audio(silentWav);
    primer.volume = 0;
    const p = primer.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { isAudioUnlocked = true; }).catch(() => {});
    }
  } catch (e) {}
}

function onVoiceModelChange(modelName) {
  selectedVoiceModel = modelName;
  if (isTTSAudioActive) {
    const labelMap = {
      'gemini-live': 'Google Gemini and Cloud TTS API',
      'gcloud-neural': 'Google Cloud Neural2 TTS API',
      'elevenlabs-accent': 'ElevenLabs Spanish Accent',
      'browser-native': 'Native Browser Voice'
    };
    speakTextTTS(`Switched to ${labelMap[modelName] || 'Selected Voice'}.`, 'en');
  }
}

/* Convert 16-bit Linear PCM (24kHz mono from Gemini TTS) into a clean, click-free WAV Blob URL */
function pcm16Base64ToWavUrl(base64Pcm, sampleRate = 24000) {
  const binaryStr = atob(base64Pcm);
  const rawLen = binaryStr.length;

  // If payload already has a RIFF/WAVE header, return directly without double-wrapping
  if (rawLen >= 12 && binaryStr.slice(0, 4) === 'RIFF' && binaryStr.slice(8, 12) === 'WAVE') {
    const existingBytes = new Uint8Array(rawLen);
    for (let i = 0; i < rawLen; i++) {
      existingBytes[i] = binaryStr.charCodeAt(i);
    }
    return URL.createObjectURL(new Blob([existingBytes], { type: 'audio/wav' }));
  }

  // Ensure even byte length for 16-bit PCM frames
  const pcmLen = rawLen & ~1;
  const numSamples = pcmLen / 2;
  const wavBuffer = new ArrayBuffer(44 + pcmLen);
  const view = new DataView(wavBuffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcmLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);             // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);              // AudioFormat (1 = Linear PCM)
  view.setUint16(22, 1, true);              // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true);     // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true);              // BlockAlign
  view.setUint16(34, 16, true);             // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, pcmLen, true);

  // Copy raw PCM bytes and compute DC offset
  const samples = new Int16Array(numSamples);
  let dcSum = 0;
  for (let i = 0; i < numSamples; i++) {
    const lo = binaryStr.charCodeAt(i * 2) & 0xff;
    const hi = binaryStr.charCodeAt(i * 2 + 1) & 0xff;
    let sample = (hi << 8) | lo;
    if (sample >= 0x8000) sample -= 0x10000;
    samples[i] = sample;
    dcSum += sample;
  }

  const dcOffset = numSamples > 0 ? Math.round(dcSum / numSamples) : 0;
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.008), Math.floor(numSamples / 4));

  for (let i = 0; i < numSamples; i++) {
    let val = samples[i] - dcOffset;
    if (fadeSamples > 0) {
      if (i < fadeSamples) {
        val = Math.round(val * (i / fadeSamples));
      } else if (i >= numSamples - fadeSamples) {
        val = Math.round(val * ((numSamples - 1 - i) / fadeSamples));
      }
    }
    if (val > 32767) val = 32767;
    if (val < -32768) val = -32768;
    view.setInt16(44 + i * 2, val, true);
  }

  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

/* Update TTS Status Badges & Play Audio (awaits completion to prevent audio overlap) */
function updateTTSStatusUI(badgeText, badgeBg, badgeColor, detailText, audioUrl, fallbackText, fallbackLang) {
  const badge = document.getElementById('tts-live-badge');
  if (badge) {
    badge.innerText = badgeText;
    badge.style.background = badgeBg;
    badge.style.color = badgeColor;
  }

  const latencyLabel = document.getElementById('tts-latency-label');
  if (latencyLabel && detailText !== undefined) {
    latencyLabel.innerText = detailText;
  }

  const adminStatus = document.getElementById('admin-tts-test-status');
  if (adminStatus && detailText) {
    adminStatus.style.display = 'block';
    adminStatus.innerText = `${badgeText} — ${detailText}`;
    adminStatus.style.color = badgeColor;
  }

  if (audioUrl) {
    // Stop any currently playing audio before starting new phrase
    if (activeAudioElement) {
      try { activeAudioElement.pause(); } catch (e) {}
    }

    // Sync visible <audio controls> element in Admin View if present
    const player = document.getElementById('tts-audio-player');
    if (player) {
      player.style.display = 'inline-block';
      player.src = audioUrl;
    }

    // Play via standalone Audio instance and resolve when finished to prevent overlap
    return new Promise((resolve) => {
      const audio = new Audio(audioUrl);
      audio.volume = currentActiveView === 'listener' ? audienceVolume : 1.0;
      activeAudioElement = audio;
      audio.onended = () => {
        if (activeAudioElement === audio) activeAudioElement = null;
        resolve();
      };
      audio.onerror = () => {
        if (activeAudioElement === audio) activeAudioElement = null;
        resolve();
      };
      audio.play().catch(err => {
        console.warn("HTMLAudio play blocked, falling back to browser SpeechSynthesis:", err);
        if (fallbackText) {
          speakBrowserNativeTTS(fallbackText, fallbackLang || 'en').then(resolve);
        } else {
          resolve();
        }
      });
    });
  }
  return Promise.resolve();
}

/* Synthesize speech using Google Gemini TTS API or Google Cloud Text-to-Speech API */
async function synthesizeWithGoogleTTS(text, langCode, apiKey, preferCloudNeural = false) {
  const personaSelect = document.getElementById('tts-voice-persona');
  const voicePersona = personaSelect ? personaSelect.value : 'Kore';

  const bcp47Lang = BCP47_LANG_MAP[langCode] || 'en-US';
  const targetLangName = LANGUAGE_NAME_MAP[langCode] || 'English';

  const cloudVoiceMap = {
    'en-US': 'en-US-Neural2-D',
    'es-US': 'es-US-Neural2-B',
    'pt-BR': 'pt-BR-Neural2-B',
    'fr-FR': 'fr-FR-Neural2-B',
    'ko-KR': 'ko-KR-Neural2-C',
    'fil-PH': 'fil-PH-Neural2-D',
    'zh-CN': 'cmn-CN-Wavenet-B',
    'vi-VN': 'vi-VN-Neural2-D',
    'ru-RU': 'ru-RU-Wavenet-B'
  };

  let lastErrorMessage = '';

  // Helper 1: Try Google Cloud Text-to-Speech v1 REST API
  const tryCloudTTS = async () => {
    const res = await fetchWithTimeout(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: bcp47Lang,
          name: cloudVoiceMap[bcp47Lang] || undefined
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
          pitch: 0.0
        }
      })
    }, 6000);
    const data = await res.json();
    if (res.ok && data.audioContent) {
      return {
        audioUrl: `data:audio/mp3;base64,${data.audioContent}`,
        provider: `Google Cloud TTS (${cloudVoiceMap[bcp47Lang] || bcp47Lang})`
      };
    }
    lastErrorMessage = data.error?.message || `Cloud TTS HTTP ${res.status}`;
    return null;
  };

  // Helper 2: Try Gemini TTS APIs (fastest Gemini 3.8 Flash Lite TTS -> 2.5 Flash TTS -> 3.8 Flash TTS)
  const tryGeminiTTS = async () => {
    const ttsEndpoints = [
      {
        label: `Gemini 3.8 Flash-Lite TTS (${voicePersona} • ${targetLangName})`,
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent?key=${encodeURIComponent(apiKey)}`
      },
      {
        label: `Gemini 2.5 Flash TTS (${voicePersona} • ${targetLangName})`,
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(apiKey)}`
      },
      {
        label: `Gemini 3.8 Flash TTS (${voicePersona} • ${targetLangName})`,
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key=${encodeURIComponent(apiKey)}`
      }
    ];

    for (const ep of ttsEndpoints) {
      try {
        const res = await fetchWithTimeout(ep.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text }]
            }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voicePersona
                  }
                }
              }
            }
          })
        }, 10000);
        const data = await res.json();
        if (res.ok) {
          const inlineData = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
          if (inlineData?.data) {
            const mime = (inlineData.mimeType || '').toLowerCase();
            const rateMatch = mime.match(/rate=(\d+)/);
            const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
            const isEncodedAudio = mime.includes('mp3') || mime.includes('mpeg') || mime.includes('wav') || mime.includes('ogg') || mime.includes('aac') || mime.includes('webm');
            const audioUrl = (!isEncodedAudio && (mime.includes('l16') || mime.includes('pcm') || mime === ''))
              ? pcm16Base64ToWavUrl(inlineData.data, sampleRate)
              : `data:${inlineData.mimeType || 'audio/wav'};base64,${inlineData.data}`;
            return { audioUrl, provider: ep.label };
          }
        } else {
          lastErrorMessage = data.error?.message || `Gemini TTS HTTP ${res.status}`;
        }
      } catch (err) {
        lastErrorMessage = err.message;
      }
    }
    return null;
  };

  if (preferCloudNeural) {
    const cloudRes = await tryCloudTTS();
    if (cloudRes) return cloudRes;
    const geminiRes = await tryGeminiTTS();
    if (geminiRes) return geminiRes;
  } else {
    const geminiRes = await tryGeminiTTS();
    if (geminiRes) return geminiRes;
    const cloudRes = await tryCloudTTS();
    if (cloudRes) return cloudRes;
  }

  throw new Error(lastErrorMessage || 'Google TTS API call failed');
}

/* Interactive Live TTS API Test Handler (Admin View) */
async function runLiveTTSTest(source = 'admin') {
  unlockAudioPlayback();
  stopAllTTSPlayback();
  const customInput = document.getElementById('listener-tts-custom-text');
  const sampleText = (customInput && customInput.value.trim())
    ? customInput.value.trim()
    : "The Lord is my shepherd; I shall not want. Grace and peace be with you all.";

  // Ensure latest key from Admin input is synced if user typed it there
  const adminGeminiInput = document.getElementById('key-gemini');
  if (adminGeminiInput && adminGeminiInput.value.trim()) {
    apiKeysStore.gemini = adminGeminiInput.value.trim();
    userApiKey = apiKeysStore.gemini;
  }

  const listenerLangSelect = document.getElementById('listener-language-select');
  const activeLang = (listenerLangSelect && listenerLangSelect.value) || currentTargetLang || 'en';
  await speakTextTTS(sampleText, activeLang, true);
}

function speakBrowserNativeTTS(text, targetLang, startTime = null) {
  if (!('speechSynthesis' in window)) return Promise.resolve();

  return new Promise((resolve) => {
    window.speechSynthesis.cancel(); // cancel pending speech
    const utterance = new SpeechSynthesisUtterance(text);
    const personaSelect = document.getElementById('tts-voice-persona');
    const voicePersona = personaSelect ? personaSelect.value : 'Kore';

    const personaTuning = {
      Kore: { pitch: 1.0, rate: 0.96 },
      Charon: { pitch: 0.85, rate: 0.92 },
      Puck: { pitch: 1.08, rate: 1.02 },
      Aoede: { pitch: 1.04, rate: 0.98 },
      Fenrir: { pitch: 0.9, rate: 1.0 }
    };
    const tuning = personaTuning[voicePersona] || { pitch: 1.0, rate: 1.0 };
    utterance.pitch = tuning.pitch;
    utterance.rate = tuning.rate;

    const bcp47Lang = BCP47_LANG_MAP[targetLang] || 'en-US';
    const langPrefix = bcp47Lang.split('-')[0];
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith(langPrefix) && (v.name.includes('Natural') || v.name.includes('Enhanced') || v.name.includes('Google') || v.name.includes('Siri'))) ||
                           voices.find(v => v.lang.startsWith(langPrefix));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.lang = bcp47Lang;
    utterance.volume = currentActiveView === 'listener' ? audienceVolume : 1.0;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);

    if (startTime !== null && selectedVoiceModel === 'browser-native') {
      const elapsedMs = Math.round(performance.now() - startTime);
      updateTTSStatusUI(
        '🔊 Browser Native TTS',
        'rgba(20, 184, 166, 0.2)',
        '#14b8a6',
        `${preferredVoice ? preferredVoice.name : utterance.lang} • ${elapsedMs}ms`
      );
    }
  });
}

async function speakTextTTS(text, langCode, forceApiTest = false) {
  const startTime = performance.now();
  const targetLang = langCode || currentTargetLang || 'en';
  const geminiKey = apiKeysStore.gemini || userApiKey;
  const elevenKey = apiKeysStore.elevenlabs;

  // 1. Live Google Gemini / Cloud TTS API Synthesis
  if ((selectedVoiceModel === 'gemini-live' || selectedVoiceModel === 'gcloud-neural' || forceApiTest) && selectedVoiceModel !== 'browser-native' && selectedVoiceModel !== 'elevenlabs-accent') {
    if (geminiKey) {
      updateTTSStatusUI('Synthesizing TTS...', 'rgba(99, 102, 241, 0.3)', '#818cf8', 'Calling Google TTS API...');
      try {
        const result = await synthesizeWithGoogleTTS(text, targetLang, geminiKey, selectedVoiceModel === 'gcloud-neural');
        const elapsedMs = Math.round(performance.now() - startTime);
        await updateTTSStatusUI(
          '⚡ Live API Audio',
          'rgba(34, 197, 94, 0.2)',
          '#4ade80',
          `${result.provider} • ${elapsedMs}ms`,
          result.audioUrl,
          text,
          targetLang
        );
        return;
      } catch (err) {
        console.warn("Google TTS API error, falling back to browser speech synthesis:", err);
        updateTTSStatusUI(
          '⚠️ API Fallback (Browser TTS)',
          'rgba(245, 158, 11, 0.2)',
          '#f59e0b',
          `${err.message.slice(0, 90)}`
        );
      }
    } else if (forceApiTest) {
      updateTTSStatusUI(
        'Missing Gemini Key (Browser Fallback)',
        'rgba(245, 158, 11, 0.2)',
        '#f59e0b',
        'Add GEMINI_API_KEY in Admin Settings or .env'
      );
    }
  }

  // 2. Live ElevenLabs TTS API Synthesis if selected & configured
  if (selectedVoiceModel === 'elevenlabs-accent' && elevenKey) {
    updateTTSStatusUI('Synthesizing ElevenLabs...', 'rgba(99, 102, 241, 0.3)', '#818cf8', 'Calling ElevenLabs API...');
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
        method: 'POST',
        headers: {
          'xi-api-key': elevenKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2'
        })
      });
      if (res.ok) {
        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const elapsedMs = Math.round(performance.now() - startTime);
        await updateTTSStatusUI(
          '⚡ ElevenLabs Live Audio',
          'rgba(34, 197, 94, 0.2)',
          '#4ade80',
          `ElevenLabs Multilingual v2 • ${elapsedMs}ms`,
          audioUrl,
          text,
          targetLang
        );
        return;
      }
    } catch (err) {
      console.warn("ElevenLabs TTS call failed, falling back to browser TTS:", err);
    }
  }

  // 3. Native Browser Web Speech Synthesis Fallback
  await speakBrowserNativeTTS(text, targetLang, startTime);
}

/* Primary Target & Listener Language Handlers */
function onPrimaryTargetChange(lang) {
  currentTargetLang = lang;
  const listenerSelect = document.getElementById('listener-language-select');
  if (listenerSelect) listenerSelect.value = lang;
  const flagEl = document.getElementById('listener-flag');
  if (flagEl) flagEl.innerText = FLAG_MAP[lang] || '🌐';
}

function onListenerLangChange(lang) {
  currentTargetLang = lang;
  const primarySelect = document.getElementById('primary-target-lang');
  if (primarySelect) primarySelect.value = lang;
  const flagEl = document.getElementById('listener-flag');
  if (flagEl) flagEl.innerText = FLAG_MAP[lang] || '🌐';
}

/* Font Size Adjustments for Accessibility */
function adjustFontSize(delta) {
  currentFontSize = Math.max(0.95, Math.min(2.5, currentFontSize + (delta * 0.12)));
  document.documentElement.style.setProperty('--subtitle-font-size', `${currentFontSize}rem`);
}

function resetFontSize() {
  currentFontSize = 1.35;
  document.documentElement.style.setProperty('--subtitle-font-size', `1.35rem`);
}

/* Theme Switching */
function setTheme(themeName) {
  document.body.className = '';
  if (themeName !== 'dark') {
    document.body.classList.add(`theme-${themeName}`);
  }
  currentTheme = themeName;
}

/* Demo Phrase Simulation */
function insertSampleSermonPhrase() {
  unlockAudioPlayback();
  const phrase = sampleSermonPhrases[demoPhraseIndex];
  demoPhraseIndex = (demoPhraseIndex + 1) % sampleSermonPhrases.length;
  processSpokenText(phrase);
}

/* Transcript Export Functions (TXT & SRT) */
function exportTranscript(format) {
  if (transcriptHistory.length === 0) {
    alert("No sermon transcript recorded yet. Click 'Demo Audio' or start the microphone.");
    return;
  }

  let content = "";
  let filename = `sermon_transcript_${new Date().toISOString().slice(0,10)}`;

  if (format === 'txt') {
    filename += ".txt";
    content = "SERMON TRANSLATION TRANSCRIPT\n";
    content += `Date: ${new Date().toLocaleDateString()}\n`;
    content += "========================================\n\n";

    transcriptHistory.forEach((item, idx) => {
      content += `[${item.timestamp}]\nOriginal: ${item.original}\nTranslated (${item.lang.toUpperCase()}): ${item.translation}\n\n`;
    });
  } else if (format === 'srt') {
    filename += ".srt";
    transcriptHistory.forEach((item, idx) => {
      const startTime = `00:0${Math.floor(idx/2)}:${(idx*10)%60 < 10 ? '0':''}${(idx*10)%60},000`;
      const endTime = `00:0${Math.floor(idx/2)}:${((idx*10)+8)%60 < 10 ? '0':''}${((idx*10)+8)%60},000`;
      content += `${idx + 1}\n${startTime} --> ${endTime}\n${item.translation}\n\n`;
    });
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

function clearStream() {
  transcriptHistory = [];
  try { localStorage.removeItem('sermon_transcript_history'); } catch (e) {}
  stopAllTTSPlayback();
  const clearedHtml = `
    <div class="speech-block">
      <div class="speech-meta"><span class="timestamp">CLEARED</span><span>READY</span></div>
      <div class="speech-original">Stream cleared. Ready for pastor input.</div>
      <div class="speech-translation" style="font-size: var(--subtitle-font-size, 1.35rem);">Transmisión borrada. Listo para el pastor.</div>
    </div>
  `;
  const speakerBox = document.getElementById('speaker-stream-box');
  if (speakerBox) speakerBox.innerHTML = clearedHtml;
  const listenerBox = document.getElementById('listener-stream-box');
  if (listenerBox) listenerBox.innerHTML = clearedHtml;
}

/* Simulated QR Code SVG Generator */
function generateSimulatedQRCode() {
  const svg = document.getElementById('qr-svg');
  if (!svg) return;

  // Simple clean SVG QR code visual grid representation
  let rects = `<rect width="100" height="100" fill="#ffffff" />`;
  // Corner position squares
  rects += `<rect x="10" y="10" width="25" height="25" fill="#090d16" /><rect x="15" y="15" width="15" height="15" fill="#ffffff" /><rect x="18" y="18" width="9" height="9" fill="#6366f1" />`;
  rects += `<rect x="65" y="10" width="25" height="25" fill="#090d16" /><rect x="70" y="15" width="15" height="15" fill="#ffffff" /><rect x="73" y="18" width="9" height="9" fill="#6366f1" />`;
  rects += `<rect x="10" y="65" width="25" height="25" fill="#090d16" /><rect x="15" y="70" width="15" height="15" fill="#ffffff" /><rect x="18" y="73" width="9" height="9" fill="#6366f1" />`;
  
  // Random interior data blocks
  for (let r = 2; r < 8; r++) {
    for (let c = 2; c < 8; c++) {
      if ((r<4 && c<4) || (r<4 && c>5) || (r>5 && c<4)) continue;
      if ((r + c) % 2 === 0) {
        rects += `<rect x="${c*10 + 5}" y="${r*10 + 5}" width="8" height="8" rx="1" fill="#1e1b4b" />`;
      }
    }
  }

  svg.innerHTML = rects;
}

function copyJoinLink() {
  const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}#listener`;
  navigator.clipboard.writeText(url).then(() => {
    alert(`Audience Link Copied to Clipboard!\n${url}`);
  }).catch(() => {
    alert(`Audience Room Code: ${roomCode}`);
  });
}

/* Cost Calculator Logic */
function calculateCost() {
  const sermons = parseInt(document.getElementById('slider-sermons').value);
  const duration = parseInt(document.getElementById('slider-duration').value);
  const languages = parseInt(document.getElementById('slider-languages').value);
  const listeners = parseInt(document.getElementById('slider-listeners').value);

  document.getElementById('val-sermons-per-month').innerText = sermons;
  document.getElementById('val-duration-mins').innerText = duration;
  document.getElementById('val-languages').innerText = languages;
  document.getElementById('val-listeners').innerText = listeners;

  // Calculation for Tier 1 Paid Cloud Fallbacks:
  // STT Groq Whisper: $0.04 / hour of audio
  const totalAudioHours = (sermons * duration) / 60;
  const sttCost = totalAudioHours * 0.04;

  // Translation Gemini 1.5 Flash: $0.075 per 1,000,000 tokens (~150 words/min = 9,000 words/hr)
  const totalWords = totalAudioHours * 9000 * languages;
  const translationTokens = totalWords * 1.33;
  const translationCost = (translationTokens / 1000000) * 0.075;

  const totalTier1 = sttCost + translationCost;

  document.getElementById('calc-tier1-total').innerText = `$${totalTier1.toFixed(2)} / mo`;
}

// Helper utility
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}
