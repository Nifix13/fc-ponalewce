/**
 * Strzelcy pojedynczego meczu wyliczeni z RÓŻNICY migawek.
 *
 * Zadna z lig nie podaje, kto strzelil w konkretnym meczu. Otwock podaje za to
 * dorobek zawodnika w sezonie, a my zapisujemy migawke tych liczb przy kazdej
 * synchronizacji. Jesli wiec mamy migawke sprzed meczu i po meczu, to roznica
 * miedzy nimi jest dokladnie tym, co padlo w tym spotkaniu.
 *
 * Dwa warunki, bez ktorych wynik bylby zmysleniem:
 *  - musza istniec obie migawki, przed i po,
 *  - miedzy nimi moze lezec DOKLADNIE JEDEN nasz mecz; przy dwoch nie da sie
 *    rozdzielic, komu co przypisac, i wtedy nie zwracamy nic.
 *
 * Z natury rzeczy dziala to dla meczow rozegranych od momentu, gdy zaczelismy
 * zbierac migawki - wstecz nie ma z czego liczyc.
 */

import { allSnapshots, latestSnapshot } from "./db.ts";
import { getMatchScorers, setMatchScorers } from "./content.ts";
import type { Fixture, LeagueKey, PlayerStat } from "./sources/types.ts";

type Totals = Map<string, { name: string; goals: number; assists: number }>;

function totalsOf(players: PlayerStat[]): Totals {
  const totals: Totals = new Map();
  for (const player of players) {
    const key = player.sourcePlayerId ?? player.name;
    totals.set(key, {
      name: player.name,
      goals: player.goals,
      assists: player.assists ?? 0,
    });
  }
  return totals;
}

export function scorersFromDiff(
  league: LeagueKey,
  fixture: Fixture,
  allOurFixtures: Fixture[],
): string[] | null {
  if (!fixture.kickoff) return null;

  const snapshots = allSnapshots(league).filter((s) => s.ourPlayers.length > 0);
  if (snapshots.length < 2) return null;

  const before = [...snapshots]
    .reverse()
    .find((s) => s.capturedAt <= fixture.kickoff!);
  const after = snapshots.find((s) => s.capturedAt > fixture.kickoff!);
  if (!before || !after) return null;

  // Czy miedzy tymi migawkami rozegralismy tylko ten jeden mecz?
  const between = allOurFixtures.filter(
    (f) =>
      f.homeGoals !== null &&
      f.kickoff &&
      f.kickoff > before.capturedAt &&
      f.kickoff <= after.capturedAt,
  );
  if (between.length !== 1 || between[0].sourceId !== fixture.sourceId) {
    return null;
  }

  const was = totalsOf(before.ourPlayers);
  const is = totalsOf(after.ourPlayers);

  const result: { name: string; goals: number; assists: number }[] = [];
  for (const [key, now] of is) {
    const prev = was.get(key);
    const goals = now.goals - (prev?.goals ?? 0);
    const assists = now.assists - (prev?.assists ?? 0);
    // Ujemne roznice znacza, ze liga poprawila swoje dane wstecz - pomijamy.
    if (goals > 0 || assists > 0) {
      result.push({
        name: now.name,
        goals: Math.max(0, goals),
        assists: Math.max(0, assists),
      });
    }
  }

  if (result.length === 0) return null;

  return result
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .map((p) =>
      p.assists > 0
        ? `${p.name} ${p.goals}G / ${p.assists}A`
        : `${p.name} ${p.goals}G`,
    );
}

/**
 * Po KAZDEJ synchronizacji: dla meczow, ktore wlasnie doszly, liczy roznice
 * i ZAPISUJE ja na stale przy tym meczu.
 *
 * Liczenie w locie przy kazdym wyswietleniu bylo kruche - gdy miedzy dwoma
 * pobraniami padna dwa mecze, roznicy juz nie da sie rozdzielic i wczesniejszy
 * wynik by przepadl. Zapisany zostaje na zawsze.
 *
 * Nigdy nie nadpisuje tego, co wpisales recznie.
 */
export function recordScorersForNewMatches(league: LeagueKey): string[] {
  const snapshot = latestSnapshot(league);
  if (!snapshot) return [];

  const ours = snapshot.fixtures.filter(
    (f) => f.isOurs && f.homeGoals !== null,
  );
  const recorded: string[] = [];

  for (const fixture of ours) {
    if (getMatchScorers(league, fixture.sourceId) !== "") continue;

    const computed = scorersFromDiff(league, fixture, ours);
    if (!computed || computed.length === 0) continue;

    setMatchScorers(league, fixture.sourceId, computed.join(", "));
    recorded.push(
      `${fixture.homeTeam} ${fixture.homeGoals}:${fixture.awayGoals} ` +
        `${fixture.awayTeam} — ${computed.join(", ")}`,
    );
  }

  return recorded;
}
