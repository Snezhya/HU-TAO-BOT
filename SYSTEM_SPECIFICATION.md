# HU TAO AI BOT: ARCHITECTURAL SPECIFICATION & SYSTEM MANUAL (v2.0)

## 0. EXECUTIVE SUMMARY
This document provides an exhaustive technical specification of the Hu Tao AI Bot project. It is designed for senior engineers and AI agents to facilitate maintenance, scaling, and feature extension. The system is a high-performance, event-driven WhatsApp automation platform with a specialized personality engine and resilient data persistence.

---

## 1. CORE ARCHITECTURE & SYSTEM DESIGN

### 1.1 Overview
The bot is built on a modular, asynchronous architecture using Node.js (ESM). It leverages `@whiskeysockets/baileys` for WhatsApp protocol handling and MongoDB for distributed state management.

### 1.2 Message Pipeline (The "Handler" Pattern)
Every incoming message follows a strictly defined lifecycle managed in `lib/handler.js`:

1.  **Ingress (Socket Level):** Message received via the `messages.upsert` event in `lib/connection.js`.
2.  **Contextualization:** The raw message is transformed into a `ctx` (Context) object.
    *   **Normalization:** Extracts text from various message types (conversation, extendedText, image/video captions).
    *   **Identification:** Resolves `jid`, `sender`, and `fromMe`.
    *   **Permission Mapping:** Caches `isOwner` and `isAdmin` status.
3.  **Plugin Execution (Event-Based):**
    *   Iterates through `/plugins/*.js`.
    *   Execution order is determined by the `priority` property (lowest first).
    *   If a plugin returns `true`, the pipeline terminates (useful for global interceptors like Anti-link).
4.  **Command Execution (Prefix-Based):**
    *   Parses text for prefixes (default `.` or `!`).
    *   Matches against `name` and `aliases` in `/commands/*.js`.
    *   Enforces `ownerOnly`, `groupOnly`, and `cooldown` constraints.
5.  **Analytics & Persistence:**
    *   Updates user XP and message counts.
    *   Triggers background DB flushes.

---

## 2. THE HU TAO INTELLIGENCE ENGINE

The system features a sophisticated "Personality Engine" (`lib/persona.js`) that transcends static prompting.

### 2.1 The Persona Matrix
The AI's behavior is calculated based on three dynamic vectors:

#### A. Persona Seed (Identity)
Assigned upon the first interaction using a JID-based MD5 hash. This ensures a consistent personality per user:
-   **Jutek:** High threshold for flirting, short responses, distant.
-   **Ceria:** High exclamation usage, fast-paced, proactive.
-   **Santai:** Minimalist, uses "🥱", "☕", relaxed tone.
-   **Romance/Partner:** High intimacy, puitis, attentive.

#### B. Intimacy Level (Relationship Depth)
Calculated based on `session_count`:
-   `Stranger` (1-3 sessions): Polite, guarded.
-   `Kenal` (4-10 sessions): Casual, slightly more open.
-   `Teman` (11-30 sessions): Joking allowed, high familiarity.
-   `Bestie` (31+ sessions): No filter, high emotional attachment.

#### C. Mood Scoring System
A real-time value ranging from `-100` to `100`:
-   **Positive Triggers:** Polite words (+3), Compliments (+10), Positive Emojis (+2).
-   **Negative Triggers:** Rude words (-15), ALL CAPS yelling (-5), Spamming (-10).
-   **Decay:** The mood naturally drifts toward `0` (Neutral) at a rate of 10 points per 24 hours of inactivity.

### 2.2 Serious Mode & Topic Detection
The engine implements an automatic **Cognitive Switch**:
-   **Keywords:** Detects topics like "depresi", "sedih", "tolong", or "mati".
-   **Action:** Immediately switches the AI to `Serious Mode`, stripping all "Hu Tao" eccentricities to provide empathetic, clear, and safe guidance.
-   **Timer:** Serious mode expires after 5 minutes of inactivity, reverting to the standard persona with a "reset" message.

---

## 3. DATA PERSISTENCE & HYBRID STORAGE

### 3.1 Resilience Architecture (`lib/database.js`)
To ensure high availability, the bot uses a multi-tier storage strategy:

1.  **L1: Application Cache:** In-memory `Map` objects for lightning-fast lookups during message processing.
2.  **L2: Write-Back Cache (Dirty Set):** Changed records are tracked in a `Set`.
3.  **L3: Persistence Layer:**
    *   **Primary:** MongoDB Atlas via Mongoose.
    *   **Secondary (Failover):** If MongoDB connection fails, the system automatically redirects writes to a local `database/data.json` file using a synchronous backup mechanism.

### 3.2 Database Schemas
-   **User:** Tracks `xp`, `level`, `messages`, and `premium`.
-   **UserProfile:** Stores the personality state (`persona_seed`, `mood_score`, `session_count`).
-   **WaSession:** Stores Baileys authentication keys as Mongoose documents, allowing the bot to be deployed in ephemeral environments like Heroku or Railway without losing login state.

---

## 4. COMMAND & PLUGIN DEVELOPMENT SPECIFICATION

### 4.1 Command Structure
Commands must follow this schema for auto-loading:
```javascript
export default {
  name: 'command-name',
  aliases: ['alias1', 'alias2'],
  description: 'Technical description',
  ownerOnly: false,
  groupOnly: false,
  privateOnly: false,
  cooldown: 3, // seconds
  xp: 5,       // XP granted on success
  async run(ctx, args, parsed) {
    // Implementation
  }
};
```

### 4.2 Plugin Structure
Plugins are event listeners that run before commands:
```javascript
export default {
  name: 'plugin-name',
  priority: 10, // Lower = earlier
  disabled: false,
  publicOnly: false,
  async run(ctx) {
    // Return true to stop the pipeline
    // Return false/undefined to continue
  }
};
```

---

## 5. MEDIA PROCESSING PIPELINE

The bot handles complex media operations using system-level binaries:

-   **Image Processing:** `sharp` is used for resizing, cropping, and WebP conversion for stickers.
-   **Video Manipulation:** `fluent-ffmpeg` handles video to GIF/sticker conversion and audio extraction.
-   **OCR:** `tesseract.js` allows the bot to read text from images.
-   **Sticker Generation:** Custom integration with `brat-canvas` for high-quality text-based stickers.

---

## 6. INFRASTRUCTURE & DEPLOYMENT

### 6.1 Railway Integration
The project includes a `railway.json` and `nixpacks.toml` for seamless cloud deployment:
-   **Healthchecks:** An Express server (`lib/server.js`) listens on `$PORT` to prevent Railway from killing the process during WhatsApp connection delays.
-   **Environment Variables:** Extensive use of `dotenv` for API keys (Gemini, Groq, MongoDB).

### 6.2 Connection Stability
-   **Auto-Reconnect:** Implements an exponential backoff strategy for WhatsApp disconnects.
-   **Signal Suppression:** `lib/signal-quiet.js` mutes noisy protocol-level logs to keep the console clean for actual application logs.
-   **Multi-API Support:** AI requests rotate through multiple Gemini API keys to bypass rate limits.

---

## 7. CODING STANDARDS & BEST PRACTICES

1.  **Strict ESM:** No `require()`. Use named exports for utilities and default exports for modules.
2.  **Context-First:** Always use the `ctx` helper methods for replies to ensure quoting and group handling are consistent.
3.  **Graceful Degradation:** AI features should fail silently or provide a "Hu Tao" themed error message rather than crashing the process.
4.  **Security:** Never log `JIDs` or message content in production. Use `log.info` for system events and `log.cmd` for command tracking.

---

## 8. EXTENSION ROADMAP

- [ ] **Vector Memory:** Integration with Pinecone/Milvus for long-term semantic memory.
- [ ] **Multi-Session:** Support for managing multiple WhatsApp accounts from a single instance.
- [ ] **Voice Synthesis:** Native integration with ElevenLabs for high-quality Hu Tao voice responses.
- [ ] **Admin Dashboard:** A web-based UI for managing users, mood scores, and real-time logs.

---

## 9. GLOSSARY of CORE UTILITIES

| Utility | Path | Purpose |
| :--- | :--- | :--- |
| `log` | `lib/logger.js` | Centralized chalk-based logging. |
| `config` | `lib/config.js` | Centralized environment variable management. |
| `generateAI`| `lib/ai.js` | Abstracted AI provider (Gemini/Groq). |
| `addXp` | `lib/database.js` | Logic for level-up and gamification. |
| `withTyping`| `lib/handler.js` | Helper to simulate human typing before AI reply. |

---

## 10. SYSTEM MAINTENANCE

### Database Cleanup
To reset a user's memory or persona:
```javascript
import { clearMemory } from './lib/database.js';
await clearMemory(userJid);
```

### Force Re-pairing
Delete the contents of the `sessions/` folder (or clear the `WaSession` collection in MongoDB) and restart the process to trigger a new QR code generation.

---

*This document is the source of truth for the Hu Tao AI Bot's internal logic. Maintain it with every architectural change.*
