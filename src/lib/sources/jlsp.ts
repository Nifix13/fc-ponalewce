/**
 * Jozefowska Liga Szostek - jlsp.pl
 *
 * Ta liga NIE ma API. Jest WordPressem bez SportsPress, wiec dane czytamy
 * parsujac tabele HTML. To jest krauche z natury: przebudowa ich strony
 * zepsuje ten plik i tylko ten plik.
 *
 * Czego tu NIE ma, a jest w Otwocku:
 *  - przypisania strzelcow do druzyn (lista to same nazwiska, top 10 ligi),
 *  - skladu druzyny,
 *  - identyfikatorow zawodnikow.
 * Dlatego gole naszych zawodnikow z Jozefowa wpisuje sie recznie.
 */

import {
  type Fixture,
  type PlayerStat,
  type Scorer,
  type SourceSnapshot,
  type TableRow,
  isOurTeam,
} from "./types.ts";

const TABLE_URL = "https://jlsp.pl/1-liga/";
const SCORERS_URL = "https://jlsp.pl/strzelcy/";
const USER_AGENT = "FC-Po-Nalewce-strona/1.0 (+https://fcponalewce.pl)";

/**
 * jlsp.pl ma w SWOJEJ bazie tresci zapisane bajtami cp1250, a serwowane jako
 * cp1252 - stad "BIA£EK" zamiast "BIALEK". To nie blad odczytu po naszej
 * stronie, tylko uszkodzone dane u zrodla. Zadnego z tych znakow nie da sie
 * sensownie uzyc w polskim nazwisku, wiec podmiana jest bezpieczna.
 */
const BROKEN_CHARS: Record<string, string> = {
  "£": "Ł", "³": "ł",
  "¥": "Ą", "¹": "ą",
  "Æ": "Ć", "æ": "ć",
  "Ê": "Ę", "ê": "ę",
  "Ñ": "Ń", "ñ": "ń",
  "Œ": "Ś", "œ": "ś",
  "¯": "Ż", "¿": "ż",
  "Ÿ": "ź",
};

const BROKEN_RE = new RegExp(`[${Object.keys(BROKEN_CHARS).join("")}]`, "g");

export function repairEncoding(text: string): string {
  return text.replace(BROKEN_RE, (ch) => BROKEN_CHARS[ch] ?? ch);
}

/** Skroty, ktore zostaja wersalikami przy zamianie "FC PO NALEWCE" na "FC Po Nalewce". */
const KEEP_UPPER = new Set([
  "FC", "CF", "SK", "KS", "WKS", "LKS", "AP", "AS", "OSP", "JLSP", "OLSP", "II", "III",
]);

export function tidyName(raw: string): string {
  const cleaned = repairEncoding(raw).replace(/\s+/g, " ").trim();
  if (cleaned === "") return "";

  /*
    Jedna strona zapisuje nazwy na trzy sposoby: tabela wersalikami
    ("FC PO NALEWCE"), sekcja ostatnich wynikow malymi ("sparta swider"),
    a terminarz bywa mieszany. Porzadkujemy obie skrajnosci, a zapis
    mieszany zostawiamy - tam autor swiadomie uzyl wielkich liter.
  */
  const upper = cleaned.toLocaleUpperCase("pl-PL");
  const lower = cleaned.toLocaleLowerCase("pl-PL");
  if (cleaned !== upper && cleaned !== lower) return cleaned;

  return lower
    .split(" ")
    .map((word) => {
      const bare = word.replace(/[^\p{L}]/gu, "").toLocaleUpperCase("pl-PL");
      if (KEEP_UPPER.has(bare)) return word.toLocaleUpperCase("pl-PL");
      return word.charAt(0).toLocaleUpperCase("pl-PL") + word.slice(1);
    })
    .join(" ");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) =>
      NAMED_ENTITIES[name.toLowerCase()] ?? match,
    );
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Wyciaga wszystkie tabele jako tablice wierszy komorek. */
export function extractTables(html: string): string[][][] {
  const tables: string[][][] = [];
  for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows: string[][] = [];
    for (const row of table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells: string[] = [];
      for (const cell of row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        cells.push(cellText(cell[1]));
      }
      if (cells.some((c) => c !== "")) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`jlsp.pl ${url} zwrocilo ${response.status}`);
  return await response.text();
}

function toInt(value: string): number {
  const parsed = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// --- tabela ---------------------------------------------------------------

/**
 * Uklad: [poz, nazwa, M, PKT, Z, R, P, B+, B-, BILANS].
 * Wiersz zaczynajacy sie slowem "GRUPA" otwiera nowa grupe.
 */
export function parseStandings(tables: string[][][]): TableRow[] {
  const rows: TableRow[] = [];
  let group: string | null = null;

  for (const table of tables) {
    for (const cells of table) {
      if (cells.length < 8) continue;
      const first = cells[0];

      if (/grupa/i.test(first)) {
        group = tidyName(first);
        continue;
      }
      if (!/^\d+\.?$/.test(first)) continue;

      const name = tidyName(cells[1]);
      if (name === "") continue;

      rows.push({
        position: toInt(first),
        teamName: name,
        isOurs: isOurTeam(name),
        played: toInt(cells[2]),
        points: toInt(cells[3]),
        wins: toInt(cells[4]),
        draws: toInt(cells[5]),
        losses: toInt(cells[6]),
        goalsFor: toInt(cells[7]),
        goalsAgainst: toInt(cells[8] ?? "0"),
        goalDiff: toInt(cells[9] ?? "0"),
        groupName: group,
      });
    }
  }

  return rows;
}

// --- terminarz ------------------------------------------------------------

const DATE_RE = /(\d{1,2})\.(\d{1,2})\.(\d{4})/;
const TIME_RE = /(\d{1,2})[.:](\d{2})\s*$/;
/** Wynik bywa zapisany "5 : 4", a bywa z literowka "4 ; 4". */
const SCORE_RE = /^(\d{1,2})\s*[:;]\s*(\d{1,2})$/;
/** "1 x opiela", "2 x pac arkadiusz" - przy nazwie druzyny w tej samej komorce. */
const SCORER_RE = /(\d+)\s*x\s*([^\d]+?)(?=\s*\d+\s*x\s|$)/gi;

/**
 * Oddziela nazwe druzyny od dopisanych strzelcow.
 * "po godzinach 1 x opiela 1 x pac arkadiusz"
 *   -> { team: "Po Godzinach", scorers: [Opiela 1, Pac Arkadiusz 1] }
 */
export function splitTeamAndScorers(cell: string): {
  team: string;
  scorers: Scorer[];
} {
  const text = repairEncoding(cell).replace(/\s+/g, " ").trim();
  const firstScorer = text.search(/\d+\s*x\s/i);
  if (firstScorer === -1) return { team: tidyName(text), scorers: [] };

  const team = tidyName(text.slice(0, firstScorer));
  const scorers: Scorer[] = [];
  for (const match of text.slice(firstScorer).matchAll(SCORER_RE)) {
    const name = tidyName(match[2].trim());
    if (name !== "") scorers.push({ name, goals: Number(match[1]) });
  }
  return { team, scorers };
}

/**
 * Srodkowa komorka decyduje, czym jest wiersz:
 *  - "5 : 4"                      -> mecz rozegrany (w komorkach bocznych bywaja strzelcy)
 *  - "SRODA 14.10.2026 19.40"     -> mecz zaplanowany
 *  - "1 KOLEJKA" / sama data      -> naglowek, zapamietujemy jako kolejke
 */
export function parseFixtures(tables: string[][][]): Fixture[] {
  const fixtures: Fixture[] = [];
  let round: string | null = null;
  let index = 0;
  const pad = (n: number) => String(n).padStart(2, "0");

  /**
   * Strona trzyma NIEWYCZYSZCZONE wyniki poprzedniego sezonu w tabelach rundy
   * wiosennej, pod naglowkami kolejek, ktore dopiero maja byc rozegrane.
   * W kolejnosci dokumentu jest: wyniki rozegrane -> terminarz -> stare smieci.
   * Dlatego po pierwszym mecz z PRZYSZLA data nie przyjmujemy juz wynikow.
   *
   * To heurystyka oparta na ukladzie strony, a nie na danych - dlatego
   * fetchJozefow() porownuje potem sume bramek z tabela i krzyczy, gdy sie
   * rozjedzie. Lepiej dowiedziec sie z logu niz z bledow na stronie.
   */
  let seenScheduled = false;

  for (const table of tables) {
    for (const cells of table) {
      if (cells.length < 3) continue;
      const middle = cells[1].replace(/[—–-]+\s*$/, "").trim();
      const sideCells = [cells[0], cells[2]].map((c) => c.trim());

      if (/kolejka/i.test(middle)) {
        round = tidyName(middle);
        continue;
      }
      if (sideCells.every((c) => c === "")) continue;

      const score = middle.match(SCORE_RE);
      const date = middle.match(DATE_RE);
      const time = middle.match(TIME_RE);
      if (!score && !(date && time)) continue;

      if (date && time) seenScheduled = true;
      else if (seenScheduled) continue; // stare wyniki poprzedniego sezonu

      const home = splitTeamAndScorers(cells[0]);
      const away = splitTeamAndScorers(cells[2]);
      if (home.team === "" || away.team === "") continue;

      let kickoff: string | null = null;
      // Dla rozegranego meczu srodkowa komorka to wynik, nie data - wtedy
      // etykieta to kolejka albo nic, nigdy "3 : 7".
      let label = round ?? "";
      if (date && time) {
        const [, day, month, year] = date;
        kickoff = `${year}-${pad(Number(month))}-${pad(Number(day))}T${pad(Number(time[1]))}:${time[2]}:00`;
        label = `${pad(Number(day))}.${pad(Number(month))}.${year}, ${pad(Number(time[1]))}:${time[2]}`;
      }

      index += 1;
      fixtures.push({
        sourceId: `jlsp-${index}-${home.team}-${away.team}`.toLowerCase(),
        kickoff,
        dateLabel: label,
        homeTeam: home.team,
        awayTeam: away.team,
        homeGoals: score ? Number(score[1]) : null,
        awayGoals: score ? Number(score[2]) : null,
        isOurs: isOurTeam(home.team) || isOurTeam(away.team),
        homeScorers: home.scorers,
        awayScorers: away.scorers,
        round,
      });
    }
  }

  return dedupe(fixtures);
}

/**
 * jlsp.pl listuje te same mecze w kilku miejscach: raz w sekcji "ostatnie
 * wyniki" (ze strzelcami), raz w tabelach kolejek (bez strzelcow). Bez tego
 * druzyna z szescioma rozegranymi meczami pokazywalaby pietnascie.
 *
 * Przy powtorce zostawiamy wpis BOGATSZY - ten ze strzelcami.
 */
function dedupe(fixtures: Fixture[]): Fixture[] {
  const best = new Map<string, Fixture>();

  for (const fixture of fixtures) {
    const key = [
      fixture.homeTeam,
      fixture.awayTeam,
      fixture.homeGoals ?? "x",
      fixture.awayGoals ?? "x",
      fixture.kickoff ?? "",
    ]
      .join("|")
      .toLowerCase();

    const existing = best.get(key);
    const richness = fixture.homeScorers.length + fixture.awayScorers.length;
    const existingRichness = existing
      ? existing.homeScorers.length + existing.awayScorers.length
      : -1;

    if (!existing || richness > existingRichness) best.set(key, fixture);
  }

  return [...best.values()];
}

// --- strzelcy -------------------------------------------------------------

export function parseScorers(tables: string[][][]): PlayerStat[] {
  const scorers: PlayerStat[] = [];

  for (const table of tables) {
    for (const cells of table) {
      if (cells.length < 2) continue;
      const goals = cells[1];
      if (!/^\d+$/.test(goals)) continue;

      // "1. HRYCAJEWSKI" albo "5. WOJTASINSKI LUKASZ"
      const name = tidyName(cells[0].replace(/^\s*\d+\s*\.?\s*/, ""));
      if (name === "") continue;

      scorers.push({
        sourcePlayerId: null,
        name,
        goals: toInt(goals),
        assists: null,
        appearances: null,
      });
    }
  }

  return scorers.sort((a, b) => b.goals - a.goals).slice(0, 10);
}

// --- wejscie --------------------------------------------------------------

export async function fetchJozefow(): Promise<SourceSnapshot> {
  const [tableHtml, scorersHtml] = await Promise.all([
    fetchText(TABLE_URL),
    fetchText(SCORERS_URL),
  ]);

  const tableTables = extractTables(tableHtml);
  const table = parseStandings(tableTables);
  const fixtures = parseFixtures(tableTables);

  checkAgainstStandings(table, fixtures);

  return {
    league: "jozefow",
    capturedAt: new Date().toISOString(),
    table,
    fixtures,
    ourPlayers: [], // zrodlo nie wiaze strzelcow z druzynami
    topScorers: parseScorers(extractTables(scorersHtml)),
  };
}

/**
 * Tabela ligowa jest zrodlem prawdy: podaje, ile meczow druzyna rozegrala
 * i z jakim stosunkiem bramek. Jesli sparsowane wyniki daja co innego, to
 * parser zgubil mecz albo zlapal cudzy - i chcemy o tym wiedziec od razu,
 * a nie zobaczyc bzdure na stronie.
 */
export function checkAgainstStandings(
  table: TableRow[],
  fixtures: Fixture[],
): string[] {
  const problems: string[] = [];
  const ours = table.find((row) => row.isOurs);
  if (!ours) return problems;

  const played = fixtures.filter((f) => f.isOurs && f.homeGoals !== null);
  let scored = 0;
  let conceded = 0;
  for (const f of played) {
    const weAreHome = isOurTeam(f.homeTeam);
    scored += (weAreHome ? f.homeGoals : f.awayGoals) ?? 0;
    conceded += (weAreHome ? f.awayGoals : f.homeGoals) ?? 0;
  }

  if (played.length !== ours.played) {
    problems.push(
      `liczba meczow: tabela ${ours.played}, sparsowano ${played.length}`,
    );
  }
  if (scored !== ours.goalsFor || conceded !== ours.goalsAgainst) {
    problems.push(
      `bramki: tabela ${ours.goalsFor}:${ours.goalsAgainst}, ` +
        `sparsowano ${scored}:${conceded}`,
    );
  }

  for (const problem of problems) {
    console.warn(`  UWAGA jlsp.pl - ${problem}`);
  }
  return problems;
}
