import mongoose from 'mongoose';
import { config } from '../config.js';
import { log } from '../logger.js';

let reconnectTimer = null;
let listenersAttached = false;

export function isMongoConfigured() {
  return Boolean(config.mongodbUri);
}

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

function attachMongoListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('connected', () => {
    log.success('MongoDB connected');
  });

  mongoose.connection.on('disconnected', () => {
    log.warn('MongoDB disconnected');
    scheduleReconnect();
  });

  mongoose.connection.on('error', (err) => {
    log.error(`MongoDB error: ${err.message}`);
  });

  mongoose.connection.on('reconnected', () => {
    log.success('MongoDB reconnected');
  });
}

function scheduleReconnect() {
  if (!isMongoConfigured() || reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (isMongoConnected()) return;
    try {
      log.info('MongoDB reconnecting...');
      await mongoose.connect(config.mongodbUri, getMongoOptions());
    } catch (err) {
      log.warn(`MongoDB reconnect gagal: ${err.message}`);
      scheduleReconnect();
    }
  }, config.dbReconnectDelayMs);
}

export function getMongoOptions() {
  return {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000
  };
}

export async function connectMongo() {
  if (!isMongoConfigured()) {
    log.warn('MONGODB_URI kosong — pakai memory fallback (+ JSON backup lokal)');
    return false;
  }

  attachMongoListeners();

  try {
    await mongoose.connect(config.mongodbUri, getMongoOptions());
    if (config.isRailway) log.success('Railway + MongoDB Atlas ready');
    return true;
  } catch (err) {
    log.error(`MongoDB connect gagal: ${err.message}`);
    return false;
  }
}

export async function disconnectMongo() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    log.info('MongoDB disconnected (shutdown)');
  }
}
