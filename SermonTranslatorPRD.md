# Product Requirements Document (PRD): Sermon Translator Web Application

**Document Version:** `v2.0`  
**Last Updated:** `2026-11-11`  
**Status:** Active Specification (Tracked under Version Control)

## Document Version Control & Revision History

| Version | Date | Summary of Changes from Previous Requirements |
| :--- | :--- | :--- |
| **v1.0** | 2026-09-27 | Initial PRD release: Core real-time speech-to-text (STT), multi-language theological translation, Speaker Console, Congregation Listener View, and Church Cost Calculator. |
| **v1.1** | 2026-09-29 | Added Admin Control Panel (`#view-admin`) for multi-provider API key management, client-side key obfuscation, basic PIN lock, and connection testing. |
| **v1.2** | 2026-11-10 | Added live Google Gemini 2.5 Flash TTS (`gemini-2.5-flash-preview-tts`) and Google Cloud Neural2 TTS voice persona synthesis, interactive TTS testing controls, and strict `.env`-only secret isolation (prohibiting API keys or PII in `app.js`, `index.html`, or auxiliary code files). |
| **v2.0** | 2026-11-11 | **Current Release:** Added mandatory **Admin View Authentication & Permission Security** (locked-by-default access gate, Role-Based Access Control, session timeout, failed-attempt lockout) and the **AI Model Performance & Metrics Dashboard** in Admin View to track STT, Translation, and TTS model latency, token/character usage, success/fallback rates, and provider benchmarks. |

---

## 1. Executive Summary
**Sermon Translator** is a low-latency, high-accuracy web-based real-time transcription and translation system tailored specifically for churches and religious organizations. It allows pastors and speakers to deliver sermons in their native language while instantly broadcasting real-time translated subtitles and synthesized audio to congregants' smartphones, tablets, or sanctuary displays.

This document outlines the product requirements, low-cost architectural approaches, pricing breakdown, and feature specs.

---

## 2. Lowest-Cost Architectural Approach

To achieve the lowest total cost of ownership (TCO)—ranging from **$0.00/month** for small-to-medium congregations up to **<$5.00/month** for large churches—we leverage client-side browser capabilities combined with free-tier AI APIs.

### Cost Matrix & Comparison

| Tier | Component | Technology / Service | Pricing Structure | Monthly Cost (4 Sermons/mo) |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 0: 100% Free** | Speech-to-Text | Web Speech API (`webkitSpeechRecognition`) | 100% Free (Native Browser Engine) | **$0.00** |
| | Translation | Gemini 2.0 Flash / 1.5 Flash Free Tier | 15 RPM / 1M tokens/day free | **$0.00** |
| | Broadcasting | PeerJS (WebRTC) / BroadcastChannel / Local Storage | Free & Peer-to-Peer | **$0.00** |
| | Listener TTS | Web Speech Synthesis API | Native Browser Engine | **$0.00** |
| | Hosting | Vercel / GitHub Pages / Cloudflare Pages | Free Tier with SSL | **$0.00** |
| **Total Tier 0 Cost** | | | | **$0.00 / month** |

| Tier | Component | Technology / Service | Pricing Structure | Monthly Cost (4 Sermons/mo) |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Hybrid High-Accuracy** | Speech-to-Text | Groq Whisper API (`whisper-large-v3-turbo`) | $0.04 / hour of audio | ~$0.16 |
| | Translation | Gemini 1.5 Flash API | $0.075 / 1M tokens | ~$0.02 |
| | Live Data Sync | Firebase Realtime DB (Spark Plan) | Free up to 100 concurrent users & 10GB/mo | $0.00 |
| | Hosting | Cloudflare Pages / Vercel | Free Tier | $0.00 |
| **Total Tier 1 Cost** | | | | **~$0.18 / month** |

---

## 3. Key User Roles & Workflows

### 3.1 Pastor / Speaker (Broadcast Host)
*   **Goal:** Focus on sermon delivery in native language (e.g. Spanish) without tech distractions.
*   **Workflow:**
    1. Opens the Speaker Dashboard on laptop/tablet.
    2. Selects input microphone and primary spoken language (e.g., **Spanish** `es-ES / es-MX`).
    3. Selects primary target translation output (e.g., **English** `en-US` or other target languages).
    4. Clicks "Start Live Sermon Broadcast".
    5. Generates a QR Code / Short Room URL for the congregation.
    6. Views real-time transcript stream with pause/resume and quick correction capabilities.

### 3.2 Audience / Congregation Listener
*   **Goal:** Read or listen to the sermon live in English (or their native language) on their mobile device.
*   **Workflow:**
    1. Scans QR Code or enters 4-digit room code on mobile web browser (no app download required).
    2. Selects desired target language (e.g., **English**, Spanish, Portuguese, French, Haitian Creole, Korean, Tagalog).
    3. Views real-time scrolling subtitles with adjustable font sizes.
    4. Optionally toggles "Audio Headphone Mode" (Text-to-Speech) for spoken translated audio.

### 3.3 System Administrator / Ministry Tech Director (Added in v2.0)
*   **Goal:** Securely manage API credentials, enforce role-based permissions, and monitor real-time AI model performance and reliability metrics.
*   **Workflow:**
    1. Navigates to the **Admin Settings** (`#view-admin`) tab, which is **locked by default** behind an authentication gate.
    2. Authenticates using verified administrator credentials / PIN to unlock privileged permissions.
    3. Configures and validates provider API keys (loaded strictly from `.env` or encrypted storage with zero keys exposed in source code).
    4. Reviews the **AI Model Performance & Metrics Dashboard** to inspect STT, Translation, and TTS latency (`p50`/`p95`), token/character consumption, error/fallback rates, and provider health during or after a service.
    5. Locks the Admin session manually (or relies on automatic inactivity timeout) before leaving the console.

---

## 4. Feature Requirements & Functional Specs

### 4.1 Speech Recognition & Audio Processing
- **Real-Time Streaming:** Sub-second latency audio-to-text processing.
- **Theological Jargon & Bible Dictionary:** Custom keyword boosting for biblical names (e.g., Leviticus, Nebuchadnezzar, Ecclesiastes, Resurrection, Grace) to ensure high transcription accuracy.
- **Audio Meter Visualizer:** Real-time microphone input volume indicator.

### 4.2 Multi-Language Translation
- **Supported Languages:** Spanish, Portuguese, French, Haitian Creole, Chinese (Simplified/Traditional), Korean, Tagalog, Vietnamese, Russian, Ukrainian, German, Italian, Arabic, Japanese, Hindi.
- **Contextual Theological Translation:** Preserves scriptural context (e.g., translating "Gospel" as "Evangelio" in religious context).

### 4.3 AI Model & Engine Selection (Translation & STT Quality Controls)
To maximize translation accuracy for complex sermons, biblical metaphors, and theological terms, the platform allows pastors/administrators to select their preferred Speech-to-Text and Translation AI engines:

#### Translation Model Options:
1. **Gemini 2.0 Flash / 1.5 Flash (Recommended - Free Tier):**
   - **Cost:** $0.00 (15 Requests/Min, 1M tokens/day free).
   - **Strengths:** Excellent theological understanding, high speed (~200ms latency), handles scripture verse context.
2. **DeepL API (Free / Pro):**
   - **Cost:** Free up to 500,000 characters/mo, then $5.49/mo + usage.
   - **Strengths:** Highest natural language fluency and grammatical precision for European and Asian languages.
3. **Gemini 1.5 Pro / Claude 3.5 Sonnet / GPT-4o:**
   - **Cost:** Pay-per-token API usage.
   - **Strengths:** Unrivaled deep theological nuance, archaic bible translation alignment (KJV/NIV equivalents).
4. **Browser Native / Offline Rules Engine:**
   - **Cost:** $0.00.
   - **Strengths:** Zero-latency, works completely offline without API keys.

#### Realtime Accent Voice & Audio Synthesis Options:
To broadcast spoken translations over headphones to congregants with natural, human-like voice inflection and accent controls (similar to ChatGPT Realtime Voice):

1. **Gemini Multimodal Live API (Gemini 2.0 Flash - WebSocket Bidirectional Audio):**
   - **Cost:** ~$0.05 - $0.15 per hour of audio streaming (or Free Tier quota).
   - **Capabilities:** Direct audio-in to audio-out streaming via WebSockets. Supports native accent voices (e.g. Spanish-accented English, warm pastoral English, expressive cadence), custom voice instructions, sub-300ms latency, and live speech interruption.
2. **OpenAI Realtime API (`gpt-4o-realtime-preview`):**
   - **Cost:** ~$18.00 / hour of audio ($0.06/min in, $0.24/min out).
   - **Capabilities:** Ultra-realistic voice models (Alloy, Echo, Shimmer), highly expressive, but substantially higher operational cost for churches.
3. **ElevenLabs Conversational Voice API / Custom Accent Cloning:**
   - **Cost:** ~$0.15 / 1,000 characters (~$1.50/hr).
   - **Capabilities:** Industry gold-standard voice cloning (can clone the pastor's actual voice!), precise accent matching, and natural emotional delivery.
4. **Browser Native Web Speech Synthesis (TTS):**
   - **Cost:** $0.00.
   - **Capabilities:** Zero-cost, client-side browser speech engines (Siri/Google voices with language/voice pitch adjustment).

### 4.5 Audience Experience & Accessibility
- **Zero App Download:** Web-based PWA accessible on iOS Safari, Android Chrome, and desktop browsers.
- **Customizable Display:**
  - Font scaling (Small, Medium, Large, Extra Large).
  - High-contrast themes (Dark Glass, High Contrast Black, Warm Reading, Light Modern).
  - Auto-scroll to latest translation with manual lock override.
- **Accent Voice Read-Aloud (TTS):** Choice of AI Realtime Voice engine (Gemini Multimodal Live, ElevenLabs Accent Voice, or Browser Native) for translated audio over headphones.

### 4.6 Data Export & Archiving
- Export complete sermon transcript and translations in formatted TXT or Subtitle (`.srt`) files for video re-broadcasting.

### 4.7 Admin View Authentication, Permission Security & Secret Isolation (Updated in v2.0)
- **Mandatory Authentication Gate (Locked by Default):**
  - The Admin Control Panel (`#view-admin`) **must require authentication by default** before rendering or enabling any sensitive controls, API key inputs, or telemetry reset actions.
  - Unauthenticated users attempting to switch to `#view-admin` are presented exclusively with the authentication prompt.
- **Role-Based Access Control (RBAC) & Permission Scopes:**
  - **Administrator (Authenticated):** Full permission to view/update API keys, trigger live connection & TTS tests, view/export the AI Model Performance & Metrics Dashboard, and modify security credentials.
  - **Pastor / Broadcast Operator:** Permission to operate the Speaker Dashboard (`#view-speaker`), select active AI models, and manage the theological glossary without exposing underlying API keys.
  - **Congregation Listener:** Restricted to the Audience View (`#view-listener`) with zero access to broadcast controls or admin configurations.
- **Session Lifecycle & Brute-Force Protection:**
  - **Inactivity Auto-Lock:** Authenticated admin sessions automatically expire and re-lock after a configurable inactivity window (e.g., 10 minutes) or when the user clicks `🔒 Lock Admin View`.
  - **Failed Attempt Throttling:** Temporary lockout after 5 consecutive failed authentication attempts to prevent brute-force PIN/credential guessing.
- **Strict `.env` Secret & PII Isolation Policy:**
  - API keys must **never** be placed in any file other than `.env` (which is gitignored).
  - Application code (`app.js`, `index.html`, `styles.css`) must contain zero hardcoded API keys, key prefixes, or personally identifiable information (PII).
- **Live Connection & TTS API Testing (`⚡ Test Connection` / `🔊 Test TTS Voice`):**
  - Automated endpoint validation testing key validity and voice synthesis across Google Gemini (`gemini-2.5-flash`, `gemini-2.5-flash-preview-tts`), Google Cloud TTS, Groq Cloud, DeepL Translate, ElevenLabs, and OpenAI.

### 4.8 AI Model Performance & Metrics Dashboard in Admin View (Added in v2.0)
To give church technical teams visibility into AI translation accuracy, responsiveness, and quota consumption, the authenticated Admin View (`#view-admin`) must include a dedicated **AI Model Performance & Metrics Dashboard**:

- **Real-Time & Historical Latency Tracking:**
  - Tracks per-request and rolling session latency (`Last`, `Avg`, `p50`, `p95`, `Max` in milliseconds) across each pipeline stage:
    1. **STT Latency:** Audio capture to finalized transcript block (`Web Speech API`, `Groq Whisper Large v3`, `OpenAI Whisper-1`).
    2. **Translation Latency:** Source phrase to translated theological output (`Gemini 2.5/2.0 Flash`, `DeepL API`, `GPT-4o-mini`, `Offline Dictionary`).
    3. **TTS Synthesis Latency:** Translated text to playable audio stream (`Gemini 2.5 Flash Preview TTS`, `Google Cloud Neural2 TTS`, `ElevenLabs Multilingual v2`, `Browser SpeechSynthesis`).
- **Throughput, Token & Character Quota Telemetry:**
  - Displays total API requests, current Requests Per Minute (RPM) against free-tier rate limits (e.g., Gemini 15 RPM free tier), estimated input/output tokens consumed, and total characters synthesized for TTS/DeepL.
- **Reliability, Error Rate & Fallback Monitoring:**
  - Tracks per-provider **Success Rate (%)**, HTTP error counts (`401`, `403`, `429 Rate Limit`, `5xx`), and **Automated Fallback Events** (how often a cloud API call fell back to the offline dictionary or native browser TTS).
- **Theological Glossary & Quality Metrics:**
  - Tracks total sermon phrases processed, theological glossary term matches/enforcements applied, and active voice persona utilization (`Kore`, `Charon`, `Puck`, `Aoede`, `Fenrir`).
- **Model Comparison Table & Metrics Export:**
  - Side-by-side performance breakdown table in `#view-admin` comparing active models by average latency, success rate, token/character volume, and estimated session cost, with controls to **Reset Session Metrics** or **Export Metrics Report (CSV / JSON)**.

---

## 5. System Architecture Diagram

```mermaid
flowchart TD
    subgraph Speaker Console
        A[Pastor Microphone] --> B[Web Speech API / Groq Whisper]
        B --> C[Speech-to-Text Stream]
    end

    subgraph Translation Engine
        C --> D{Theological Glossary Filter}
        D --> E[Gemini / DeepL API Translation]
    end

    subgraph Real-Time Broadcast
        E --> F[Firebase Realtime DB / WebRTC Channel]
    end

    subgraph Listener Devices
        F --> G[Listener Mobile UI]
        G --> H1[Live Subtitle Stream]
        G --> H2[Gemini TTS / Cloud TTS / Web Speech Audio]
    end

    subgraph Secured Admin Console
        Auth[Authentication & RBAC Gate] --> AdminUI[Admin Key Manager & .env Loader]
        Auth --> Metrics[AI Model Performance & Metrics Dashboard]
        B -.->|STT Telemetry| Metrics
        E -.->|Translation Latency & Tokens| Metrics
        H2 -.->|TTS Synthesis Latency & Status| Metrics
    end
```

---

## 6. Implementation Roadmap

- **Phase 1 (Working Demo - Completed):** Single-page web application featuring live browser STT, instant multi-language translation, Speaker View, Listener UI with QR code sharing, font controls, TTS audio synthesis, and an interactive cost calculator.
- **Phase 1.5 (Admin & Live TTS API Integration - Completed):** Multi-provider API key management, live Google Gemini 2.5 Flash TTS & Cloud Neural2 TTS audio synthesis with voice personas, and strict `.env`-only secret isolation.
- **Phase 2 (Security & Telemetry MVP - Current Requirement v2.0):** Mandatory Admin View authentication & RBAC permission enforcement (locked by default with inactivity auto-lock) and the embedded **AI Model Performance & Metrics Dashboard** in `#view-admin`.
- **Phase 3 (Production Scale):** Integration with Groq Whisper API for noisier sanctuary environments, Firebase Realtime DB for multi-device network syncing, custom church branding, and automated sermon summary generation.
