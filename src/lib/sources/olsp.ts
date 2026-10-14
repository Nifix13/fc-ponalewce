/**
 * Otwocka Liga Szostek - olsp.pl
 *
 * Liga stoi na WordPressie z wtyczka SportsPress, ktora wystawia publiczne
 * REST API. To jest integracja, nie scraping.
 *
 * Pulapki, ktore to API zastawia (sprawdzone, nie domyslane):
 *  - parametr `team` jest IGNOROWANY: kazde zapytanie zwraca wszystkich 376
 *    zawodnikow, wiec filtrujemy po stronie klienta,
 *  - strona poza zakresem zwraca HTTP 400, a nie pusta liste,
 *  - `statistics` w rekordzie zawodnika zawiera tylko etykiety kolumn;
 *    WYLICZONE liczby sa wylacznie w `/lists/{id}`,
 *  - tytuly meczow bywaja smieciowe ("4.", "Sami Swoi vs F"), wiec nazwy
 *    druzyn budujemy z pola `teams`, nigdy z tytulu,
 *  - nazwy przychodza z encjami HTML ("Gentleman&#8217;s Club").
 */

import {
  type Fixture,
  type PlayerStat,
  type SourceSnapshot,
  type TableRow,
  isOurTeam,
} from "./types.ts";

const BASE = "https://olsp.pl/wp-json/sportspress/v2";
const USER_AGENT = "FC-Po-Nalewce-strona/1.0 (+https://fcponalewce.pl)";

/** FC Po Nalewce w bazie olsp.pl. */
export const OUR_TEAM_ID = 1002;
/** Tabela "Liga 1" - ta, w ktorej gramy. */
const TABLE_ID = 166;
/** Lista zawodnikow FC Po Nalewce. */
const OUR_LIST_ID = 1013;
/** Najlepsi strzelcy 1 ligi. */
const TOP_SCORERS_LIST_ID = 810;

type Json = Record<string, unknown>;

async function get<T>(path: string): Promise<T> {
  const response = await fetch(BASE + path, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`olsp.pl ${path} zwrocilo ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Strona poza zakresem to 400, nie pusta lista - stad ta obudowa. */
async function getPageOrEmpty<T>(path: string): Promise<T[]> {
  try {
    return await get<T[]>(path);
  } catch {
    return [];
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) =>
      NAMED_ENTITIES[name.toLowerCase()] ?? match,
    )
    .trim();
}

function toInt(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function title(post: Json): string {
  const raw = (post.title as Json | undefined)?.rendered;
  return decodeEntities(typeof raw === "string" ? raw : "");
}

// --- tabela ---------------------------------------------------------------

function parseTable(payload: Json): TableRow[] {
  const data = (payload.data ?? {}) as Record<string, Json>;
  const rows: TableRow[] = [];

  for (const [teamId, raw] of Object.entries(data)) {
    if (!/^\d+$/.test(teamId) || teamId === "0") continue;
    const name = decodeEntities(String(raw.name ?? ""));
    if (name === "") continue;
    rows.push({
      position: toInt(raw.pos),
      teamName: name,
      isOurs: Number(teamId) === OUR_TEAM_ID,
      played: toInt(raw.p),
      points: toInt(raw.pts),
      wins: toInt(raw.w),
      draws: toInt(raw.d),
      losses: toInt(raw.l),
      goalsFor: toInt(raw.f),
      goalsAgainst: toInt(raw.a),
      goalDiff: toInt(raw.gd),
      groupName: null,
    });
  }

  return rows.sort((a, b) => a.position - b.position);
}

// --- zawodnicy ------------------------------------------------------------

async function loadPlayerNames(): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  for (let page = 1; page <= 10; page += 1) {
    const chunk = await getPageOrEmpty<Json>(
      `/players?per_page=100&page=${page}`,
    );
    if (chunk.length === 0) break;
    for (const player of chunk) {
      names.set(Number(player.id), title(player));
    }
  }
  return names;
}

function parseList(payload: Json, names: Map<number, string>): PlayerStat[] {
  const data = (payload.data ?? {}) as Record<string, Json>;
  const stats: PlayerStat[] = [];

  for (const [playerId, raw] of Object.entries(data)) {
    // Klucz "0" to wiersz z etykietami kolumn, nie zawodnik.
    if (!/^\d+$/.test(playerId) || playerId === "0") continue;
    // Gdy wartosc goli nie jest liczba, to tez wiersz naglowkowy.
    if (typeof raw.goals !== "number" && !/^\d+$/.test(String(raw.goals ?? "")))
      continue;

    const name = names.get(Number(playerId));
    if (!name) continue;

    stats.push({
      sourcePlayerId: playerId,
      name,
      goals: toInt(raw.goals),
      assists: toInt(raw.assists),
      appearances: toInt(raw.eventsplayed),
    });
  }

  return stats.sort(
    (a, b) => b.goals - a.goals || (b.assists ?? 0) - (a.assists ?? 0),
  );
}

// --- mecze ----------------------------------------------------------------

async function loadTeamNames(): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  for (let page = 1; page <= 5; page += 1) {
    const chunk = await getPageOrEmpty<Json>(`/teams?per_page=100&page=${page}`);
    if (chunk.length === 0) break;
    for (const team of chunk) names.set(Number(team.id), title(team));
  }
  return names;
}

function parseFixtures(events: Json[], teams: Map<number, string>): Fixture[] {
  const fixtures: Fixture[] = [];

  for (const event of events) {
    const teamIds = (event.teams as number[] | undefined) ?? [];
    if (teamIds.length < 2) continue;

    const [homeId, awayId] = teamIds;
    const homeTeam = teams.get(homeId) ?? "?";
    const awayTeam = teams.get(awayId) ?? "?";

    const results = (event.results ?? {}) as Record<string, unknown>;
    const goalsOf = (id: number): number | null => {
      const row = results[String(id)];
      if (!row || typeof row !== "object") return null;
      const value = (row as Json).goals;
      if (typeof value === "number") return value;
      if (typeof value === "string" && /^\d+$/.test(value)) {
        return Number.parseInt(value, 10);
      }
      return null;
    };

    const date = typeof event.date === "string" ? event.date : null;
    fixtures.push({
      sourceId: `olsp-${event.id}`,
      kickoff: date,
      dateLabel: date ? date.slice(0, 10) : "",
      homeTeam,
      awayTeam,
      homeGoals: goalsOf(homeId),
      awayGoals: goalsOf(awayId),
      isOurs: homeId === OUR_TEAM_ID || awayId === OUR_TEAM_ID,
      // SportsPress ma pole `performance` na strzelcow, ale liga go nie
      // wypelnia - sprawdzone, wszystkie wpisy puste.
      homeScorers: [],
      awayScorers: [],
      round: null,
    });
  }

  return fixtures.sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""));
}

// --- wejscie --------------------------------------------------------------

export async function fetchOtwock(): Promise<SourceSnapshot> {
  const [tablePayload, ourList, scorersList, playerNames, teamNames] =
    await Promise.all([
      get<Json>(`/tables/${TABLE_ID}`),
      get<Json>(`/lists/${OUR_LIST_ID}`),
      get<Json>(`/lists/${TOP_SCORERS_LIST_ID}`),
      loadPlayerNames(),
      loadTeamNames(),
    ]);

  const events: Json[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const chunk = await getPageOrEmpty<Json>(`/events?per_page=100&page=${page}`);
    if (chunk.length === 0) break;
    events.push(...chunk);
  }

  return {
    league: "otwock",
    capturedAt: new Date().toISOString(),
    table: parseTable(tablePayload),
    fixtures: parseFixtures(events, teamNames),
    ourPlayers: parseList(ourList, playerNames),
    topScorers: parseList(scorersList, playerNames).slice(0, 10),
  };
}

export { isOurTeam };
