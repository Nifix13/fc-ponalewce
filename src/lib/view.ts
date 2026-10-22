/** Przygotowanie danych pod widok. Czyste funkcje, bez JSX. */

import { latestSnapshot } from "./db.ts";
import { formatLeagueDateTime, leagueTimeToInstant } from "./czas.ts";
import {
  type Fixture,
  type LeagueKey,
  type SourceSnapshot,
  type TableRow,
  isOurTeam,
  teamSlug,
} from "./sources/types.ts";

export type LeagueSummary = {
  league: LeagueKey;
  capturedAt: string | null;
  ourRow: TableRow | null;
  /** Tabela naszej grupy - Jozefow dzieli lige, Otwock nie. */
  ourGroup: TableRow[];
  nextMatch: Fixture | null;
  lastMatch: Fixture | null;
  /** Ostatnie wyniki od najnowszego. */
  recent: Fixture[];
  topScorers: SourceSnapshot["topScorers"];
  ourPlayers: SourceSnapshot["ourPlayers"];
};

function sortByDate(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort((a, b) =>
    (a.kickoff ?? "").localeCompare(b.kickoff ?? ""),
  );
}

export function leagueSummary(league: LeagueKey): LeagueSummary {
  const snapshot = latestSnapshot(league);
  if (!snapshot) {
    return {
      league,
      capturedAt: null,
      ourRow: null,
      ourGroup: [],
      nextMatch: null,
      lastMatch: null,
      recent: [],
      topScorers: [],
      ourPlayers: [],
    };
  }

  const ourRow = snapshot.table.find((row) => row.isOurs) ?? null;
  const ourGroup = snapshot.table.filter(
    (row) => row.groupName === (ourRow?.groupName ?? null),
  );

  const ours = snapshot.fixtures.filter((f) => f.isOurs);
  const played = sortByDate(ours.filter((f) => f.homeGoals !== null));
  const scheduled = sortByDate(ours.filter((f) => f.homeGoals === null));

  return {
    league,
    capturedAt: snapshot.capturedAt,
    ourRow,
    ourGroup,
    nextMatch: scheduled[0] ?? null,
    lastMatch: played[played.length - 1] ?? null,
    recent: played.reverse(),
    topScorers: snapshot.topScorers,
    ourPlayers: snapshot.ourPlayers,
  };
}

export type TeamView = {
  league: LeagueKey;
  name: string;
  row: TableRow | null;
  played: Fixture[];
  upcoming: Fixture[];
};

/**
 * Zwiezly obraz dowolnej druzyny w lidze - do strony otwieranej kliknieciem
 * w tabeli. Wszystko liczymy z tej samej migawki, co reszta strony, wiec
 * nie ma tu zadnego dodatkowego pobierania.
 */
export function teamSummary(league: LeagueKey, slug: string): TeamView | null {
  const snapshot = latestSnapshot(league);
  if (!snapshot) return null;

  const row = snapshot.table.find((r) => teamSlug(r.teamName) === slug) ?? null;
  const theirs = snapshot.fixtures.filter(
    (f) => teamSlug(f.homeTeam) === slug || teamSlug(f.awayTeam) === slug,
  );
  if (!row && theirs.length === 0) return null;

  const name =
    row?.teamName ??
    (teamSlug(theirs[0].homeTeam) === slug
      ? theirs[0].homeTeam
      : theirs[0].awayTeam);

  return {
    league,
    name,
    row,
    played: sortByDate(theirs.filter((f) => f.homeGoals !== null)).reverse(),
    upcoming: sortByDate(theirs.filter((f) => f.homeGoals === null)),
  };
}

/** "wygrana" | "remis" | "porazka" z naszej perspektywy. */
export function outcome(fixture: Fixture): "W" | "R" | "P" | null {
  if (fixture.homeGoals === null || fixture.awayGoals === null) return null;
  const weAreHome = isOurTeam(fixture.homeTeam);
  const ourGoals = weAreHome ? fixture.homeGoals : fixture.awayGoals;
  const theirGoals = weAreHome ? fixture.awayGoals : fixture.homeGoals;
  if (ourGoals > theirGoals) return "W";
  if (ourGoals < theirGoals) return "P";
  return "R";
}

export function opponentOf(fixture: Fixture): string {
  return isOurTeam(fixture.homeTeam) ? fixture.awayTeam : fixture.homeTeam;
}

/** Gramy u siebie? Decyduje o kolorze kompletu: biel w domu, neon na wyjezdzie. */
export function atHome(fixture: Fixture): boolean {
  return isOurTeam(fixture.homeTeam);
}

/*
  Daty z terminarza sa w czasie warszawskim i bez strefy. Formatujemy je
  jawnie w tej strefie, zeby na serwerze w UTC nie pokazac godziny
  przesunietej o dwie godziny.

  Otwock podaje pelna date ISO (z literą Z), Jozefow - naiwny czas lokalny.
  Jedno i drugie konczy jako konkretna chwila, a potem jest formatowane
  po warszawsku.
*/
function toInstant(iso: string): number {
  // Z koncowka Z albo przesunieciem - to juz konkretna chwila.
  if (/(Z|[+-]\d{2}:\d{2})$/.test(iso)) return Date.parse(iso);
  return leagueTimeToInstant(iso);
}

export function formatDate(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const instant = toInstant(iso);
  if (Number.isNaN(instant)) return fallback;
  return formatLeagueDateTime(instant, false);
}

export function formatDateTime(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const instant = toInstant(iso);
  if (Number.isNaN(instant)) return fallback;
  return formatLeagueDateTime(instant, iso.includes("T"));
}
