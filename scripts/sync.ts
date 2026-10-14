/**
 * Pobiera dane obu lig i zapisuje migawki.
 *
 * Uruchomienie: npm run sync
 * Docelowo na cronie raz dziennie; ten sam kod wola przycisk w panelu.
 *
 * Awaria jednego zrodla NIE przerywa drugiego i NIE kasuje poprzedniej
 * migawki - strona dalej pokaze ostatnie znane dane.
 */

import { recordRun, saveSnapshot } from "../src/lib/db.ts";
import { recordScorersForNewMatches } from "../src/lib/scorers.ts";
import { fetchOtwock } from "../src/lib/sources/olsp.ts";
import { fetchJozefow } from "../src/lib/sources/jlsp.ts";
import type { LeagueKey, SourceSnapshot } from "../src/lib/sources/types.ts";

async function run(
  league: LeagueKey,
  fetcher: () => Promise<SourceSnapshot>,
): Promise<boolean> {
  const startedAt = new Date().toISOString();
  process.stdout.write(`${league}: pobieram... `);

  try {
    const snapshot = await fetcher();
    saveSnapshot(snapshot);

    // Zaraz po zapisaniu migawki: policz i zapamietaj strzelcow nowych meczow.
    const newScorers = recordScorersForNewMatches(league);
    recordRun({
      league,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "ok",
      error: null,
    });
    const ours = snapshot.table.find((row) => row.isOurs);
    console.log(
      `OK - tabela ${snapshot.table.length} druzyn, ` +
        `${snapshot.fixtures.length} meczow, ` +
        `${snapshot.topScorers.length} strzelcow` +
        (ours ? `, nasze miejsce: ${ours.position}` : ""),
    );
    for (const line of newScorers) {
      console.log(`  strzelcy zapisani: ${line}`);
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordRun({
      league,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "blad",
      error: message,
    });
    console.log(`BLAD - ${message}`);
    console.log("  poprzednia migawka zostaje, strona dziala dalej");
    return false;
  }
}

const results = await Promise.all([
  run("otwock", fetchOtwock),
  run("jozefow", fetchJozefow),
]);

if (!results.some(Boolean)) {
  console.error("\nOba zrodla padly - nic nie zapisano.");
  process.exit(1);
}
