/**
 * Baza na node:sqlite - wbudowanym w Node 24, bez zadnej zaleznosci.
 *
 * Trzymamy MIGAWKI, nie stan biezacy: kazda synchronizacja dopisuje nowy
 * wiersz. Strona czyta najnowsza UDANA migawke, wiec gdy dzisiejsze pobranie
 * padnie, odwiedzajacy nadal widzi wczorajsze dane z data, a my widzimy blad.
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import type { LeagueKey, SourceSnapshot } from "./sources/types.ts";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "dane.db");

let handle: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (handle) return handle;
  handle = new DatabaseSync(DB_PATH);
  handle.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_league
      ON snapshots(league, captured_at DESC);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      error TEXT
    );
  `);
  return handle;
}

export function saveSnapshot(snapshot: SourceSnapshot): void {
  db()
    .prepare(
      `INSERT INTO snapshots (league, captured_at, payload) VALUES (?, ?, ?)`,
    )
    .run(snapshot.league, snapshot.capturedAt, JSON.stringify(snapshot));
}

export function latestSnapshot(league: LeagueKey): SourceSnapshot | null {
  const row = db()
    .prepare(
      `SELECT payload FROM snapshots
        WHERE league = ?
     ORDER BY captured_at DESC, id DESC
        LIMIT 1`,
    )
    .get(league) as { payload: string } | undefined;

  return row ? (JSON.parse(row.payload) as SourceSnapshot) : null;
}

/** Wszystkie migawki ligi, od najstarszej. Potrzebne do liczenia roznic. */
export function allSnapshots(league: LeagueKey): SourceSnapshot[] {
  const rows = db()
    .prepare(
      `SELECT payload FROM snapshots
        WHERE league = ?
     ORDER BY captured_at ASC, id ASC`,
    )
    .all(league) as { payload: string }[];
  return rows.map((row) => JSON.parse(row.payload) as SourceSnapshot);
}

export type SyncRun = {
  league: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  error: string | null;
};

export function recordRun(run: Omit<SyncRun, "id">): void {
  db()
    .prepare(
      `INSERT INTO sync_runs (league, started_at, finished_at, status, error)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(run.league, run.started_at, run.finished_at, run.status, run.error);
}

export function recentRuns(limit = 10): SyncRun[] {
  return db()
    .prepare(
      `SELECT league, started_at, finished_at, status, error
         FROM sync_runs ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as SyncRun[];
}
