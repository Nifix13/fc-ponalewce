/**
 * Codzienna synchronizacja uruchamiana przez samą aplikację.
 *
 * Dlaczego nie zwykły cron: darmowe plany hostingów dają jeden trwały dysk na
 * usługę. Osobne zadanie cykliczne byłoby osobną usługą i NIE widziałoby tej
 * samej bazy co strona. Harmonogram w środku procesu omija ten problem i
 * działa tak samo na Northflanku, Fly.io i zwykłym VPS.
 *
 * Nie liczy godzin od startu, tylko sprawdza, KIEDY ostatnio udało się pobrać
 * dane. Dzięki temu restart aplikacji nie gubi ani nie dubluje pobrania.
 */

import { recentRuns, recordRun, saveSnapshot } from "./db.ts";
import { recordScorersForNewMatches } from "./scorers.ts";
import { fetchOtwock } from "./sources/olsp.ts";
import { fetchJozefow } from "./sources/jlsp.ts";
import type { LeagueKey, SourceSnapshot } from "./sources/types.ts";

/** Co ile sprawdzać, czy pora pobrać. */
const CHECK_EVERY_MS = 60 * 60 * 1000;
/** Po ilu godzinach od ostatniego udanego pobrania uznajemy dane za stare. */
const STALE_AFTER_HOURS = 20;

const SOURCES: [LeagueKey, () => Promise<SourceSnapshot>][] = [
  ["otwock", fetchOtwock],
  ["jozefow", fetchJozefow],
];

function hoursSinceLastSuccess(league: LeagueKey): number {
  const last = recentRuns(50).find(
    (run) => run.league === league && run.status === "ok",
  );
  if (!last) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(last.started_at).getTime()) / 3_600_000;
}

async function syncIfStale(league: LeagueKey, fetcher: () => Promise<SourceSnapshot>) {
  if (hoursSinceLastSuccess(league) < STALE_AFTER_HOURS) return;

  const startedAt = new Date().toISOString();
  try {
    const snapshot = await fetcher();
    saveSnapshot(snapshot);
    const recorded = recordScorersForNewMatches(league);
    recordRun({
      league,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "ok",
      error: null,
    });
    console.log(
      `[harmonogram] ${league}: pobrano` +
        (recorded.length > 0
          ? `, strzelcy zapisani dla ${recorded.length} meczów`
          : ""),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordRun({
      league,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "blad",
      error: message,
    });
    console.error(`[harmonogram] ${league}: BŁĄD — ${message}`);
  }
}

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  const tick = () => {
    for (const [league, fetcher] of SOURCES) {
      // Awaria jednego źródła nie może zatrzymać drugiego.
      void syncIfStale(league, fetcher);
    }
  };

  // Pierwsze sprawdzenie po minucie - niech aplikacja najpierw wstanie.
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, CHECK_EVERY_MS).unref?.();
  console.log("[harmonogram] uruchomiony, sprawdzanie co godzinę");
}
