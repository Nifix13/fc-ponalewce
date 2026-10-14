/**
 * Tresci, ktore wpisujesz sam: posty i odnosniki do Instagrama.
 *
 * Swiadomie oddzielone od tabel synchronizowanych (snapshots): zadne
 * pobranie danych z lig nie moze nadpisac tego, co tu wpiszesz.
 */

import { db } from "./db.ts";

export type Post = {
  id: number;
  slug: string;
  title: string;
  lead: string;
  body: string;
  coverPath: string | null;
  coverAuthor: string | null;
  publishedAt: string;
};

export type InstaPost = {
  id: number;
  url: string;
  addedAt: string;
};

let ready = false;

function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      lead TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      cover_path TEXT,
      cover_author TEXT,
      published_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS insta_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      added_at TEXT NOT NULL
    );
    /*
      Strzelcy konkretnego meczu. Zadne ze zrodel ich nie podaje dla otwockiej
      ligi (pole na statystyki zawodnikow w meczu jest tam puste), a Jozefow
      tylko przez tydzien po kolejce. Dlatego wpisujemy je sami i zapamietujemy
      przy identyfikatorze meczu - raz wpisane zostaja na zawsze.
    */
    CREATE TABLE IF NOT EXISTS match_scorers (
      league TEXT NOT NULL,
      source_id TEXT NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (league, source_id)
    );
  `);
  ready = true;
}

export function getMatchScorers(league: string, sourceId: string): string {
  ensure();
  const row = db()
    .prepare(`SELECT text FROM match_scorers WHERE league = ? AND source_id = ?`)
    .get(league, sourceId) as { text: string } | undefined;
  return row?.text ?? "";
}

export function setMatchScorers(
  league: string,
  sourceId: string,
  text: string,
): void {
  ensure();
  const trimmed = text.trim();
  if (trimmed === "") {
    db()
      .prepare(`DELETE FROM match_scorers WHERE league = ? AND source_id = ?`)
      .run(league, sourceId);
    return;
  }
  db()
    .prepare(
      `INSERT INTO match_scorers (league, source_id, text) VALUES (?, ?, ?)
       ON CONFLICT(league, source_id) DO UPDATE SET text = excluded.text`,
    )
    .run(league, sourceId, trimmed);
}

/** "Nowak 2G / 1A, Kot 1G" -> ["Nowak 2G / 1A", "Kot 1G"] */
export function splitScorers(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/** "Wygrana z WKS 3:1" -> "wygrana-z-wks-3-1" */
export function slugify(title: string): string {
  const map: Record<string, string> = {
    ą: "a", ć: "c", ę: "e", ł: "l", ń: "n",
    ó: "o", ś: "s", ź: "z", ż: "z",
  };
  return title
    .toLocaleLowerCase("pl-PL")
    .replace(/[ąćęłńóśźż]/g, (ch) => map[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "post";
}

type PostRow = {
  id: number;
  slug: string;
  title: string;
  lead: string;
  body: string;
  cover_path: string | null;
  cover_author: string | null;
  published_at: string;
};

function toPost(row: PostRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    lead: row.lead,
    body: row.body,
    coverPath: row.cover_path,
    coverAuthor: row.cover_author,
    publishedAt: row.published_at,
  };
}

export function listPosts(limit = 50): Post[] {
  ensure();
  const rows = db()
    .prepare(`SELECT * FROM posts ORDER BY published_at DESC, id DESC LIMIT ?`)
    .all(limit) as PostRow[];
  return rows.map(toPost);
}

export function getPost(slug: string): Post | null {
  ensure();
  const row = db()
    .prepare(`SELECT * FROM posts WHERE slug = ?`)
    .get(slug) as PostRow | undefined;
  return row ? toPost(row) : null;
}

export function createPost(input: {
  title: string;
  lead: string;
  body: string;
  coverPath: string | null;
  coverAuthor: string | null;
}): string {
  ensure();
  const base = slugify(input.title);
  let slug = base;
  let attempt = 2;
  while (db().prepare(`SELECT 1 FROM posts WHERE slug = ?`).get(slug)) {
    slug = `${base}-${attempt}`;
    attempt += 1;
  }
  db()
    .prepare(
      `INSERT INTO posts (slug, title, lead, body, cover_path, cover_author, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      slug,
      input.title,
      input.lead,
      input.body,
      input.coverPath,
      input.coverAuthor,
      new Date().toISOString(),
    );
  return slug;
}

export function deletePost(id: number): void {
  ensure();
  db().prepare(`DELETE FROM posts WHERE id = ?`).run(id);
}

// --- Instagram -------------------------------------------------------------

/**
 * Z adresu posta wyciaga kod, ktorego potrzebuje oficjalny osadzony podglad.
 * Akceptuje /p/, /reel/ i /tv/, z parametrami lub bez.
 */
export function instaCode(url: string): string | null {
  const match = url
    .trim()
    .match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

export function listInsta(limit = 6): InstaPost[] {
  ensure();
  const rows = db()
    .prepare(`SELECT * FROM insta_posts ORDER BY added_at DESC, id DESC LIMIT ?`)
    .all(limit) as { id: number; url: string; added_at: string }[];
  return rows.map((r) => ({ id: r.id, url: r.url, addedAt: r.added_at }));
}

export function addInsta(url: string): boolean {
  ensure();
  const code = instaCode(url);
  if (!code) return false;
  db()
    .prepare(
      `INSERT OR IGNORE INTO insta_posts (url, added_at) VALUES (?, ?)`,
    )
    .run(`https://www.instagram.com/p/${code}/`, new Date().toISOString());
  return true;
}

export function deleteInsta(id: number): void {
  ensure();
  db().prepare(`DELETE FROM insta_posts WHERE id = ?`).run(id);
}
