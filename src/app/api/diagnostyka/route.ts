/**
 * Punkt diagnostyczny: pokazuje, która warstwa zawodzi, gdy na stronie
 * nie ma danych.
 *
 * Sprawdza po kolei całą drogę: zmienne środowiskowe -> katalog na dane ->
 * zapis do bazy -> zawartość bazy -> historia synchronizacji -> wyjście
 * w sieć do obu lig.
 *
 * Celowo NIE pokazuje wartości haseł ani sekretów, tylko to, czy są
 * ustawione. Komunikaty błędów dotyczą stron lig, nie zawierają danych
 * wrażliwych.
 */

import fs from "node:fs";
import path from "node:path";
import { db, latestSnapshot, recentRuns } from "../../../lib/db.ts";
import type { LeagueKey } from "../../../lib/sources/types.ts";

const LEAGUES: LeagueKey[] = ["otwock", "jozefow"];

async function reachable(url: string): Promise<string> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "user-agent": "FC-Po-Nalewce-diagnostyka/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    return `HTTP ${response.status} w ${Date.now() - started} ms`;
  } catch (error) {
    return `BŁĄD: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function GET(): Promise<Response> {
  const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), "dane.db");
  const dbDir = path.dirname(dbPath);

  const report: Record<string, unknown> = {
    czas: new Date().toISOString(),
    strefa_serwera: Intl.DateTimeFormat().resolvedOptions().timeZone,
    teraz_po_polsku: new Intl.DateTimeFormat('pl-PL', {
      timeZone: 'Europe/Warsaw',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date()),
    srodowisko: {
      NODE_ENV: process.env.NODE_ENV ?? null,
      ADMIN_PASSWORD_ustawione: Boolean(process.env.ADMIN_PASSWORD),
      SESSION_SECRET_ustawione: Boolean(process.env.SESSION_SECRET),
      SESSION_SECRET_dlugosc: process.env.SESSION_SECRET?.length ?? 0,
    },
    baza: { sciezka: dbPath, katalog: dbDir },
  };

  // --- katalog i plik bazy ---
  const baza = report.baza as Record<string, unknown>;
  try {
    baza.katalog_istnieje = fs.existsSync(/*turbopackIgnore: true*/ dbDir);
    fs.accessSync(/*turbopackIgnore: true*/ dbDir, fs.constants.W_OK);
    baza.katalog_zapisywalny = true;
  } catch (error) {
    baza.katalog_zapisywalny = false;
    baza.katalog_blad = error instanceof Error ? error.message : String(error);
  }
  try {
    baza.plik_istnieje = fs.existsSync(/*turbopackIgnore: true*/ dbPath);
    baza.rozmiar_bajtow = baza.plik_istnieje ? fs.statSync(/*turbopackIgnore: true*/ dbPath).size : 0;
  } catch (error) {
    baza.plik_blad = error instanceof Error ? error.message : String(error);
  }

  // --- zawartosc bazy ---
  try {
    const counts = db()
      .prepare(`SELECT league, COUNT(*) AS ile FROM snapshots GROUP BY league`)
      .all() as { league: string; ile: number }[];
    report.migawki = Object.fromEntries(counts.map((r) => [r.league, r.ile]));

    report.najnowsze = Object.fromEntries(
      LEAGUES.map((league) => {
        const snap = latestSnapshot(league);
        return [
          league,
          snap
            ? {
                pobrano: snap.capturedAt,
                druzyn: snap.table.length,
                meczow: snap.fixtures.length,
                naszych_zawodnikow: snap.ourPlayers.length,
              }
            : null,
        ];
      }),
    );

    report.ostatnie_proby = recentRuns(8);
  } catch (error) {
    report.baza_blad = error instanceof Error ? error.message : String(error);
  }

  // --- czy kontener w ogole wychodzi w swiat ---
  report.siec = {
    "olsp.pl (API)": await reachable(
      "https://olsp.pl/wp-json/sportspress/v2/tables/166",
    ),
    "jlsp.pl (HTML)": await reachable("https://jlsp.pl/1-liga/"),
  };

  return Response.json(report, {
    headers: { "cache-control": "no-store" },
  });
}
