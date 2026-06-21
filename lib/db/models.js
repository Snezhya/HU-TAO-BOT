import mongoose from 'mongoose';

const memoryEntrySchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    at: { type: Number, default: Date.now }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    jid: { type: String, required: true, unique: true, index: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    messages: { type: Number, default: 0 },
    memory: { type: [memoryEntrySchema], default: [] },
    lastChat: { type: Number, default: null },
    seriousMode: { type: Boolean, default: false },
    premium: { type: Boolean, default: false },
    registeredAt: { type: Number, default: Date.now },
    notifUpdate: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const groupSchema = new mongoose.Schema(
  {
    gid: { type: String, required: true, unique: true, index: true },
    antilink: { type: Boolean, default: null },
    welcome: { type: Boolean, default: true },
    goodbye: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  mode: { type: String, enum: ['self', 'public'], default: 'public' },
  antilink: { type: Boolean, default: true }
});

/** Mirror Baileys multi-file auth — satu dokumen per path file */
const waSessionSchema = new mongoose.Schema(
  {
    path: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

/** User persona & mood profile — per JID */
const userProfileSchema = new mongoose.Schema(
  {
    jid: { type: String, required: true, unique: true, index: true },
    persona_seed: { type: String, required: true },
    session_count: { type: Number, default: 0 },
    mood_score: { type: Number, default: 0, min: -100, max: 100 },
    first_seen: { type: Number, default: Date.now },
    last_seen: { type: Number, default: Date.now },
    nickname: { type: String, default: null },
    last_mood_decay: { type: Number, default: Date.now },
    serious_mode: { type: Boolean, default: false },
    serious_since: { type: Number, default: null },
    total_interactions: { type: Number, default: 0 },
    longest_gap_days: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const groupMemorySchema = new mongoose.Schema({
  jid: { type: String, required: true, unique: true, index: true },
  messages: [{
    sender: { type: String, required: true },
    senderName: { type: String, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Number, default: Date.now }
  }]
});

export const User =
  mongoose.models.User || mongoose.model('User', userSchema);
export const Group =
  mongoose.models.Group || mongoose.model('Group', groupSchema);
export const BotSettings =
  mongoose.models.BotSettings || mongoose.model('BotSettings', settingsSchema);
export const WaSession =
  mongoose.models.WaSession || mongoose.model('WaSession', waSessionSchema);
export const UserProfile =
  mongoose.models.UserProfile || mongoose.model('UserProfile', userProfileSchema);
export const GroupMemory =
  mongoose.models.GroupMemory || mongoose.model('GroupMemory', groupMemorySchema);

/** Reminder config per JID — persists across Railway restarts */
const reminderScheduleItemSchema = new mongoose.Schema(
  {
    hour:   { type: Number, required: true },
    minute: { type: Number, required: true },
    type:   { type: String, required: true },
    date:   { type: String, default: null }, // YYYY-MM-DD, null = recurring
    text:   { type: String, default: null }  // for 'tugas' type
  },
  { _id: false }
);

const reminderConfigSchema = new mongoose.Schema(
  {
    jid:      { type: String, required: true, unique: true, index: true },
    enabled:  { type: Boolean, default: false },
    isGroup:  { type: Boolean, default: false },
    mentions: { type: [String], default: [] },
    schedule: { type: [reminderScheduleItemSchema], default: null }
  },
  { timestamps: true }
);

export const ReminderConfig =
  mongoose.models.ReminderConfig ||
  mongoose.model('ReminderConfig', reminderConfigSchema);

const chatSettingsSchema = new mongoose.Schema(
  {
    jid: { type: String, required: true, unique: true, index: true },
    features: { type: Map, of: Boolean, default: () => new Map() }
  },
  { timestamps: true }
);

export const ChatSettings =
  mongoose.models.ChatSettings || mongoose.model('ChatSettings', chatSettingsSchema);
