# Dynamic Persona System - Implementation Guide

## Overview

The bot now has a sophisticated per-user dynamic persona system that creates unique, evolving personalities for each WhatsApp contact. Each user gets:

1. **Unique Persona** - Determined by phone number hash (stays consistent)
2. **Intimacy Level** - Grows as users interact more
3. **Mood Score** - Dynamically tracks emotional state (-100 to +100)
4. **Session Tracking** - Counts how many times a user has chatted

---

## Components

### 1. **lib/db/models.js** - Database Schema
Added `UserProfile` model with fields:
```
- jid (primary key): User's WhatsApp JID
- persona_seed (string): Persona type (jutek, ceria, serius, santai, sarkas)
- session_count (number): How many times user has chatted
- mood_score (number): Current mood -100 to +100 (starts at 0)
- first_seen (timestamp): When user first interacted
- last_seen (timestamp): Last interaction time
- nickname (string, optional): Custom nickname
- last_mood_decay (timestamp): For mood decay tracking
```

### 2. **lib/persona.js** - Core System

#### Persona Types (generated from JID hash)
- **jutek**: Cold outside, caring inside (dingin, cuek, tapi perhatian)
- **ceria**: Hyper & cheerful (energik, antusias, selalu positif)
- **serius**: Professional & focused (profesional, langsung ke poin)
- **santai**: Lazy & chill (malas, chill, minimal effort)
- **sarkas**: Sarcastic humor (sarcastic, cynical, dark humor)

#### Intimacy Levels (based on session_count)
- **Stranger** (1-3): Formal, polite, short answers
- **Kenal** (4-10): Relaxed, starts using names
- **Teman** (11-30): Casual, uses slang, jokes around
- **Bestie** (31+): Very close, remembers habits, inside jokes

#### Mood Modes (based on mood_score)
| Range | Mode | Behavior |
|-------|------|----------|
| -100 to -51 | Sulking | Barely helps, needs "repair" |
| -50 to -21 | Cold | Short answers, distant |
| -20 to +49 | Normal | Default persona behavior |
| +50 to +100 | Happy | Cheerful, jokes, proactive |

#### Mood Triggers
**Positive (+):**
- Thank you / polite words: +5
- Compliments / positive feedback: +10
- Polite requests (please, tolong, mohon): +3
- Positive emoji (😍, 🥰, ❤️, 😊, 😂, etc): +2

**Negative (-):**
- Rude words / insults: -15
- Spam / flood detection: -10
- ALL CAPS (anger): -5

**Auto-Decay:**
- Mood decays 10 points per 24 hours toward 0
- Keeps mood from getting stuck too extreme

#### Key Functions
```javascript
generatePersonaSeed(jid) // Hash-based persona assignment
getIntimacyLevel(sessionCount) // Determine intimacy tier
getMoodMode(moodScore) // Get mood state
calculateMoodDelta(userText) // Parse message for mood changes
applyMoodDecay(moodScore, lastDecayTime) // Decay mood over time
buildSystemPrompt(profile, forceSerious) // Generate dynamic system prompt
```

### 3. **lib/ai.js** - AI Integration
Enhanced to support profile-based prompts:
```javascript
generateAI(memory, userText, {
  systemPrompt, // Direct prompt (legacy)
  profile,      // UserProfile object (new)
  serious       // Force serious mode
})
```

### 4. **lib/hu-tao-ai.js** - Main Chat Handler
New profile management functions:
```javascript
getUserProfile(jid) // Get or create user profile
updateUserProfile(jid, updates) // Update profile fields
incrementSession(jid) // Increment session + apply decay
updateMoodFromMessage(jid, userText) // Calculate mood delta
respondHuTao(ctx, sender, userText, opts) // Main chat handler (enhanced)
```

**Flow on each message:**
1. Increment session count & apply mood decay
2. Calculate mood delta from message content
3. Get/update user profile
4. Build dynamic system prompt based on profile
5. Generate AI response with mood-aware persona
6. Save memory & update timestamps

---

## Commands

### .persona
Shows current profile info:
- Persona type & description
- Intimacy level & session count
- Mood score & behavior mode
- Special hint if mood < -50

**Usage:** `.persona`
**Aliases:** `.pers`

### .persona reset
Reset mood score to 0 (admin only)

**Usage:** `.persona reset`
**Requires:** Owner/admin

### .mood
Shows current mood status with personality-driven message

**Usage:** `.mood`

---

## Example System Prompt (Dynamic)

For a user with:
- Persona: sarkas
- Intimacy: Teman (11 sessions)
- Mood: Happy (+75)

The system prompt includes:
```
PERSONA: Sarkas (Humor & Sindiran)
Karakteristik: sarcastic, cynical, dark humor
Gaya: banyak sindiran, jokes, slightly mean-spirited

INTIMACY: Teman (11-30 percakapan)
Tone: casual
- Casual, bisa pakai slang
- Bisa bercanda
- Lebih familiar dan nyaman

MOOD: Happy (75)
Behavior: cheerful, jokes, proactive
- Cheerful & positive
- Banyak jokes & puns
- Proactive & helpful
```

---

## Database Initialization

The `UserProfile` collection is created automatically on first interaction:
1. User sends message
2. `respondHuTao()` calls `incrementSession(jid)`
3. `getUserProfile()` creates new profile if not exists
4. Profile stored with consistent persona (from hash)

---

## Mood Examples

### How Mood Changes

**Message: "Terima kasih banget untuk bantuannya! 🥰"**
- Polite words ("terima kasih"): +5
- Positive emoji (🥰): +2
- **Total: +7**

**Message: "KAMU BODOH BANGET GOBLOK!!!"**
- ALL CAPS: -5
- Rude words ("bodoh", "goblok"): -15
- **Total: -20**

**Message: "lagi lagi lagi lagi lagi lagi"** (spam)
- Spam/flood detection: -10
- **Total: -10**

### Mood Decay Example
- User at +60 mood on Day 1
- 24 hours later → +50 mood (decay -10)
- 48 hours later → +40 mood (decay -10)
- Continues until reaching 0 or reset

---

## Technical Notes

### Backwards Compatibility
- Legacy `getSystemPrompt(serious)` function still works
- Existing commands unchanged
- Graceful fallback if profile unavailable

### Error Handling
- If MongoDB unavailable, creates minimal fallback profile
- Persona always derivable from JID (no DB needed)
- Mood defaults to 0 if profile missing

### Performance
- Profile cached during chat session
- Mood decay calculated on-demand (lazy evaluation)
- Persona hash is deterministic (same JID = same persona always)

---

## Integration Checklist

✅ `lib/db/models.js` - UserProfile schema added
✅ `lib/persona.js` - Complete rewrite with all systems
✅ `lib/ai.js` - Support for profile-based prompts
✅ `lib/hu-tao-ai.js` - Profile tracking & mood updates
✅ `commands/persona.js` - New command to view profile
✅ `commands/mood.js` - New command to view mood

---

## Future Enhancements

Possible additions:
- `.persona name {nickname}` - Set custom nickname
- `.mood history` - Show mood trend over time
- Habit tracking - Remember user preferences
- Relationship milestones - Special messages at session counts (50, 100, etc)
- Mood corruption system - Random mood events
- Multi-user reactions - Jealousy if talked to others

---

## Example Usage

```javascript
// In any command that calls AI:
await respondHuTao(ctx, ctx.sender, userText);

// Returns object with:
{
  reply: "...", // AI response
  serious: false, // Mode used
  reaction: "😹", // Reaction emoji if any
  profile: { // User's profile
    jid: "628xxx",
    persona_seed: "jutek",
    session_count: 15,
    mood_score: +23,
    intimacy_level: "Teman"
  }
}
```

---

Created: 2025-06-07
Language: Bahasa Indonesia
Bot: Hu Tao AI (WhatsApp)
