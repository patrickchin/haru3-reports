import { createDb, type Database } from './client.js';

let _db: Database | undefined;

export function getDb(): Database {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not configured');
    _db = createDb(url);
  }
  return _db;
}
