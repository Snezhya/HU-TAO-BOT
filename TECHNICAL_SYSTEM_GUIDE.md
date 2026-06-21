# Hu Tao AI Bot - Technical System Guide

This document serves as the primary engineering specification and architectural reference for the **Hu Tao AI Bot**. It outlines the core subsystems, data flow, and interaction logic to ensure consistent and high-quality development.

---

## 🏗️ Architectural Overview

The bot is designed with a **decoupled, event-driven architecture** centered around a modular pipeline. It prioritizes resilience, character consistency, and performance.

### 1. Message Lifecycle
1.  **Ingress:** `lib/connection.js` listens to WhatsApp events via Baileys.
2.  **Normalization:** `lib/handler.js` wraps the raw message into a unified **Context (`ctx`)** object.
3.  **Plugin Layer:** Event-based plugins (sorted by priority) process the message (e.g., Anti-link, AI Auto-reply).
4.  **Command Layer:** If no plugin consumes the message, prefix-based commands are parsed and executed.
5.  **Egress:** Responses are sent back via `ctx.reply()` or `ctx.react()`.

---

## 🧠 Hu Tao Intelligence Engine

The "soul" of the bot is a dynamic personality system that adapts to each user's interaction history.

### A. Dynamic Personalization
Located in `lib/persona.js`, the system tracks three primary vectors:
- **Persona Seed:** A consistent base personality (e.g., *Jutek*, *Ceria*, *Santai*) assigned via JID hashing.
- **Intimacy Level:** Ranges from `Stranger` to `Bestie` based on session counts.
- **Mood Score:** A real-time value (-100 to 100) affected by user sentiment, politeness, or rude behavior.

### B. Prompt Engineering Strategy
The system prompt is **dynamically reconstructed** for every AI interaction:
- **Narrative Injection:** Detailed behavioral instructions based on current Mood and Intimacy.
- **Serious Mode Detection:** Automatic suppression of "Hu Tao" persona if sensitive topics (e.g., depression, emergencies) are detected.
- **Interaction Rules:** Strict guidelines on formatting (bolding modes, using backticks for commands) and avoiding "AI-as-assistant" tropes.

---

## 🗄️ Data Persistence & Resilience

### Hybrid Storage Model (`lib/database.js`)
- **Primary:** MongoDB Atlas via Mongoose.
- **Fallback:** In-memory store with lazy-flushing to a local `data.json` file.
- **Optimization:** Uses a **Dirty User Cache** and periodic flushing to minimize database writes while ensuring data safety.

### Schemas (`lib/db/models.js`)
- **User:** XP, levels, interaction memory, and premium status.
- **UserProfile:** Persona seeds, mood scores, and session timestamps.
- **WaSession:** MongoDB-backed session persistence for multi-device login.

---

## 🛠️ Developer Interface

### The Context Object (`ctx`)
Every handler receives a `ctx` object with a high-level API:
- `ctx.reply(content)`: Smart quoting and message sending.
- `ctx.react(emoji)`: Simple reaction interface.
- `ctx.sendTyping()`: Triggers the "composing" state for AI delays.
- `ctx.isOwner / ctx.isAdmin`: Cached permission flags.

### Modular Extension
- **Commands (`/commands`):** Export an object with `name`, `run`, and optional constraints (`ownerOnly`, `cooldown`, etc.).
- **Plugins (`/plugins`):** Export an object with `name`, `priority`, and a `run` function that returns `true` if it handles the message.

---

## 📏 Engineering Standards

1.  **ES Modules:** All files must use `import/export`.
2.  **Asynchronous Integrity:** Use `async/await` for all I/O and DB operations.
3.  **Logging:** Use the centralized `log` utility in `lib/logger.js`.
4.  **Error Resilience:** Never crash the main process on decryption errors; use the `recordSessionError` mechanism instead.
5.  **Hu Tao Consistency:** Maintain the "Hu Tao" voice in all AI-driven responses—playful, slightly morbid, and deeply personal.

---

## 🚀 Deployment & Scaling

- **Environment:** Optimized for Railway with automatic environment detection.
- **Media Stack:**
    - **Sharp:** Image processing and sticker generation.
    - **FFmpeg:** Video/Audio conversion for `bratvid` and `tts`.
    - **Tesseract.js:** OCR capabilities.
- **Healthchecks:** Express server handles Railway health checks while the WhatsApp socket initializes.
