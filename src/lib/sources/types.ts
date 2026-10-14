/**
 * Wspolny ksztalt danych z obu lig.
 *
 * Adaptery (olsp.ts, jlsp.ts) roznia sie wszystkim - jeden czyta API, drugi
 * parsuje HTML - ale zwracaja dokladnie te typy. Reszta aplikacji nie wie,
 * skad przyszedl wiersz tabeli, i nie ma prawa wiedziec.
 */

export type LeagueKey = "otwock" | "jozefow";

export const LEAGUE_NAMES: Record<LeagueKey, string> = {
  otwock: "Otwocka Liga Szóstek",
  jozefow: "Józefowska Liga Szóstek",
};

export const LEAGUE_SHORT: Record<LeagueKey, string> = {
  otwock: "Otwocka",
  jozefow: "Józefowska",
};

export type TableRow = {
  position: number;
  teamName: string;
  isOurs: boolean;
  played: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  /** Jozefow dzieli lige na grupy; Otwock nie. */
  groupName: string | null;
};

export type Scorer = {
  name: string;
  goals: number;
};

export type Fixture = {
  /** Identyfikator ze zrodla - stabilny miedzy synchronizacjami. */
  sourceId: string;
  /** ISO 8601, gdy dalo sie ustalic. Jozefow podaje date tekstem. */
  kickoff: string | null;
  /** To, co zrodlo napisalo - pokazujemy, gdy nie udalo sie sparsowac daty. */
  dateLabel: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  isOurs: boolean;
  /** Jozefow podaje strzelcow przy wyniku; Otwock nie - wtedy puste. */
  homeScorers: Scorer[];
  awayScorers: Scorer[];
  /** "1 kolejka" itp., gdy zrodlo grupuje mecze. */
  round: string | null;
};

export type PlayerStat = {
  /** Identyfikator w zrodle; Jozefow go nie ma. */
  sourcePlayerId: string | null;
  name: string;
  goals: number;
  assists: number | null;
  appearances: number | null;
};

export type SourceSnapshot = {
  league: LeagueKey;
  capturedAt: string;
  table: TableRow[];
  fixtures: Fixture[];
  /** Statystyki NASZYCH zawodnikow - tylko tam, gdzie zrodlo je daje. */
  ourPlayers: PlayerStat[];
  /** Najlepsi strzelcy calej ligi. */
  topScorers: PlayerStat[];
};

/** Nazwa naszej druzyny tak, jak zapisuja ja obie ligi (roznie!). */
export const OUR_TEAM_PATTERNS = [/fc\s*po\s*nalewce/i, /po\s*nalewce/i];

export function isOurTeam(name: string): boolean {
  return OUR_TEAM_PATTERNS.some((re) => re.test(name));
}

const POLISH_LETTERS: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n",
  ó: "o", ś: "s", ź: "z", ż: "z",
};

/**
 * Adres druzyny budujemy z jej nazwy. Obie ligi zapisuja nazwy roznie
 * (wersaliki, apostrofy typograficzne, myslniki), wiec najpierw je
 * sprowadzamy do wspolnej postaci - inaczej "Gentleman's Club" z tabeli
 * i z terminarza daloby dwa rozne adresy.
 */
export function teamSlug(name: string): string {
  return (
    name
      .toLocaleLowerCase("pl-PL")
      .replace(/[ąćęłńóśźż]/g, (ch) => POLISH_LETTERS[ch] ?? ch)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "druzyna"
  );
}
