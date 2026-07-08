import fs from 'fs';
import path from 'path';
import { QueueItem } from '../state';

const DB_PATH = path.join(__dirname, '../../playlists.json');

interface UserPlaylists {
  [playlistName: string]: Partial<QueueItem>[];
}

interface Database {
  [userId: string]: UserPlaylists;
}

function loadDb(): Database {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveDb(db: Database) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function savePlaylist(userId: string, name: string, tracks: Partial<QueueItem>[]) {
  const db = loadDb();
  if (!db[userId]) db[userId] = {};
  db[userId][name] = tracks;
  saveDb(db);
}

export function getPlaylist(userId: string, name: string): Partial<QueueItem>[] | null {
  const db = loadDb();
  return db[userId]?.[name] || null;
}

export function listPlaylists(userId: string): string[] {
  const db = loadDb();
  return Object.keys(db[userId] || {});
}
