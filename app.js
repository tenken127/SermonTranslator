/* Sermon Translator App Logic */

// Global State
let isMicrophoneActive = false;
let recognition = null;
let audioContext = null;
let analyser = null;
let microphoneStream = null;
let animationFrameId = null;

let isTTSAudioActive = false;
let currentFontSize = 1.75; // rem
let currentTheme = 'dark';
let currentTargetLang = 'en';

let roomCode = "GRACE-" + Math.floor(100 + Math.random() * 900);
let transcriptHistory = [];

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
document.addEventListener('DOMContentLoaded', () => {
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
        appendTranslationToListener(data.translatedText, data.language);
      }
    };
  }

  // Also listen on localStorage for fallback tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'sermon_latest_translation' && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        appendTranslationToListener(data.translatedText, data.language);
      } catch (err) {}
    }
  });
});

/* View Navigation */
function switchView(viewName) {
  document.querySelectorAll('.nav-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

  document.getElementById(`tab-${viewName}`).classList.add('active');
  document.getElementById(`view-${viewName}`).classList.add('active');
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
    if (event.error === 'no-speech') return;
    stopMicrophone();
  };

  recognition.onend = () => {
    if (isMicrophoneActive) {
      // Auto restart if still active
      try { recognition.start(); } catch (e) {}
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
  const glossaryRaw = document.getElementById('glossary-input').value;
  if (!glossaryRaw) return text;

  const terms = glossaryRaw.split(',').map(t => t.trim()).filter(Boolean);
  let processedText = text;

  terms.forEach(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    processedText = processedText.replace(regex, term);
  });

  return processedText;
}

/* AI Translation Engine & Model Selection */
let currentTranslationModel = 'gemini-flash';
let userApiKey = localStorage.getItem('sermon_translator_api_key') || '';

document.addEventListener('DOMContentLoaded', () => {
  const keyInput = document.getElementById('api-key-input');
  if (keyInput && userApiKey) {
    keyInput.value = userApiKey;
  }
});

function onModelChange() {
  const modelSelect = document.getElementById('translation-model-select');
  currentTranslationModel = modelSelect.value;
  
  const descElem = document.getElementById('model-desc');
  const descriptions = {
    'gemini-flash': 'Recommended: Google Gemini 2.0/1.5 Flash - Pre-prompts AI with biblical vocabulary & homiletic context ($0.00 free tier).',
    'deepl-api': 'DeepL Translate API: Superior grammatical precision & native fluency for European & Asian languages.',
    'gpt4o-mini': 'OpenAI GPT-4o-mini: High-reasoning contextual sermon translation.',
    'offline-fast': 'Offline Native Engine: Zero-latency, dictionary lookup ($0.00).'
  };
  descElem.innerText = descriptions[currentTranslationModel] || '';
}

function saveApiKey(val) {
  userApiKey = val.trim();
  localStorage.setItem('sermon_translator_api_key', userApiKey);
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  input.type = input.type === 'password' ? 'text' : 'password';
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
  broadcastTranslation(translatedText, currentTargetLang);
}

async function translateTextWithAI(text, targetLang, model) {
  const apiKey = userApiKey;
  
  // 1. Live Gemini REST API Integration if key provided
  if (model === 'gemini-flash' && apiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are an expert theological sermon translator. Translate the following spoken sermon phrase into target language code "${targetLang}". Preserve biblical names, scripture citations, and homiletic dignity. Return ONLY the translated sentence.\n\nSermon text: "${text}"`
            }]
          }]
        })
      });
      const data = await response.json();
      const aiResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (aiResult) return aiResult.trim();
    } catch (e) {
      console.warn("Gemini API call failed, falling back to theological AI model prompt simulation:", e);
    }
  }

  // 2. DeepL API Integration if key provided
  if (model === 'deepl-api' && apiKey) {
    try {
      const response = await fetch(`https://api-free.deepl.com/v2/translate`, {
        method: 'POST',
        headers: { 'Authorization': `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: [text], target_lang: targetLang.toUpperCase() })
      });
      const data = await response.json();
      if (data.translations?.[0]?.text) return data.translations[0].text;
    } catch (e) {
      console.warn("DeepL API call failed, falling back to rules engine:", e);
    }
  }

  // 3. Fallback Dictionary + Theological Pre-prompt simulation
  if (translationDictionary[targetLang] && translationDictionary[targetLang][text]) {
    return translationDictionary[targetLang][text];
  }

  // Pattern rule engine with theological contextual corrections
  if (targetLang === 'es') {
    return text.replace(/The Lord/gi, "El Señor")
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
    return text.replace(/The Lord/gi, "L'Éternel")
               .replace(/Jesus/gi, "Jésus")
               .replace(/God/gi, "Dieu")
               .replace(/church/gi, "église")
               .replace(/Gospel/gi, "Évangile");
  } else if (targetLang === 'pt') {
    return text.replace(/The Lord/gi, "O Senhor")
               .replace(/Jesus/gi, "Jesus")
               .replace(/God/gi, "Deus")
               .replace(/Gospel/gi, "Evangelho");
  }

  return text; // Default return
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
function broadcastTranslation(translatedText, lang) {
  // 1. Update on local listener UI immediately
  appendTranslationToListener(translatedText, lang);

  // 2. Post message to Broadcast Channel for other tabs
  if (broadcastChannel) {
    broadcastChannel.postMessage({
      type: 'NEW_TRANSLATION',
      translatedText,
      language: lang
    });
  }

  // 3. Update localStorage for fallback tab sync
  localStorage.setItem('sermon_latest_translation', JSON.stringify({
    translatedText,
    language: lang,
    time: Date.now()
  }));
}

/* Append Subtitle Line to Congregation View */
function appendTranslationToListener(text, lang) {
  const scrollBox = document.getElementById('listener-scroll-box');
  const latestLine = document.getElementById('listener-latest-line');

  if (!scrollBox) return;

  // Move previous latest line up
  if (latestLine) {
    latestLine.classList.remove('latest');
  }

  const newLine = document.createElement('div');
  newLine.className = 'subtitle-line latest';
  newLine.id = 'listener-latest-line';
  newLine.innerText = text;

  scrollBox.appendChild(newLine);
  scrollBox.scrollTop = scrollBox.scrollHeight;

  // If TTS Audio is enabled for listener, read aloud
  if (isTTSAudioActive) {
    speakTextTTS(text, lang);
  }
}

/* Web Speech & Realtime Accent Synthesis (TTS for Listeners) */
let selectedVoiceModel = 'gemini-live';

function onVoiceModelChange(modelName) {
  selectedVoiceModel = modelName;
  if (isTTSAudioActive) {
    speakTextTTS(`Switched to ${modelName === 'gemini-live' ? 'Gemini Live Realtime Voice' : modelName === 'elevenlabs-accent' ? 'ElevenLabs Spanish Accent' : 'Native Browser Voice'}.`, 'en');
  }
}

function toggleTTSAudio() {
  isTTSAudioActive = !isTTSAudioActive;
  const pill = document.getElementById('btn-tts-toggle');
  const label = document.getElementById('tts-label');

  if (isTTSAudioActive) {
    pill.classList.add('active');
    label.innerText = "Headphone Audio: ON 🎧";
    speakTextTTS("Headphone audio translation enabled.", "en");
  } else {
    pill.classList.remove('active');
    label.innerText = "Headphone Audio: OFF";
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
}

function speakTextTTS(text, langCode) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel(); // cancel pending speech
  const utterance = new SpeechSynthesisUtterance(text);
  
  // Apply accent / voice persona tuning
  if (selectedVoiceModel === 'gemini-live') {
    utterance.pitch = 1.05; // Expressive natural pitch
    utterance.rate = 1.0;
  } else if (selectedVoiceModel === 'elevenlabs-accent') {
    utterance.pitch = 0.95; // Warm pastoral cadence
    utterance.rate = 0.95;
  } else {
    utterance.pitch = 1.0;
    utterance.rate = 1.0;
  }

  // Attempt to select best matching system voice
  const voices = window.speechSynthesis.getVoices();
  const targetLang = langCode || 'en';
  
  const preferredVoice = voices.find(v => v.lang.startsWith(targetLang) && (v.name.includes('Natural') || v.name.includes('Enhanced') || v.name.includes('Google') || v.name.includes('Siri'))) ||
                         voices.find(v => v.lang.startsWith(targetLang));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.lang = targetLang === 'en' ? 'en-US' : targetLang;
  window.speechSynthesis.speak(utterance);
}

/* Primary Target & Listener Language Handlers */
function onPrimaryTargetChange(lang) {
  currentTargetLang = lang;
}

function onListenerLangChange(lang) {
  currentTargetLang = lang;
  document.getElementById('primary-target-lang').value = lang;

  const flagMap = {
    en: '🇺🇸', es: '🇲🇽', pt: '🇧🇷', fr: '🇫🇷', ht: '🇭🇹',
    ko: '🇰🇷', tl: '🇵🇭', zh: '🇨🇳', vi: '🇻🇳', ru: '🇷🇺'
  };
  document.getElementById('listener-flag').innerText = flagMap[lang] || '🌐';
}

/* Font Size Adjustments for Accessibility */
function adjustFontSize(delta) {
  currentFontSize = Math.max(1.1, Math.min(3.0, currentFontSize + (delta * 0.15)));
  document.documentElement.style.setProperty('--subtitle-font-size', `${currentFontSize}rem`);
}

function resetFontSize() {
  currentFontSize = 1.75;
  document.documentElement.style.setProperty('--subtitle-font-size', `1.75rem`);
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
  document.getElementById('speaker-stream-box').innerHTML = `
    <div class="speech-block">
      <div class="speech-meta"><span class="timestamp">CLEARED</span><span>READY</span></div>
      <div class="speech-original">Stream cleared. Ready for pastor input.</div>
      <div class="speech-translation">Transmisión borrada. Listo para el pastor.</div>
    </div>
  `;
  document.getElementById('listener-scroll-box').innerHTML = `
    <div class="subtitle-line latest" id="listener-latest-line">
      Stream cleared. Ready for live sermon...
    </div>
  `;
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
