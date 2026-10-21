/**
 * Spina widget z danymi: bierze terminarz obu lig, wybiera mecz, który
 * właśnie trwa (albo zaraz się zacznie), i dokłada wynik wbity w panelu.
 *
 * Osobny plik od `live.ts`, bo tamten jest czysty i testowalny bez bazy.
 */

import { getLiveScore } from "./content.ts";
import { latestSnapshot } from "./db.ts";
import { pickLiveFixture, toLiveView, type LiveView } from "./live.ts";
import type { Fixture, LeagueKey } from "./sources/types.ts";

const LEAGUES: LeagueKey[] = ["otwock", "jozefow"];

function ourFixtures(): { league: LeagueKey; fixture: Fixture }[] {
  const all: { league: LeagueKey; fixture: Fixture }[] = [];
  for (const league of LEAGUES) {
    const snapshot = latestSnapshot(league);
    if (!snapshot) continue;
    for (const fixture of snapshot.fixtures) {
      if (fixture.isOurs) all.push({ league, fixture });
    }
  }
  return all;
}

export function currentLiveView(now = Date.now()): LiveView | null {
  const picked = pickLiveFixture(now, ourFixtures());
  if (!picked) return null;
  return toLiveView(picked, getLiveScore(picked.league, picked.fixture.sourceId));
}
