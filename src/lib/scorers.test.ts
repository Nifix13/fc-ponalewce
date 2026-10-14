import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Osobna baza na czas testu - ustawiana PRZED importem modulu bazy.
const TEST_DB = path.join(os.tmpdir(), `fcpn-test-${Date.now()}.db`);
process.env.DB_PATH = TEST_DB;

const { saveSnapshot } = await import("./db.ts");
const { scorersFromDiff, recordScorersForNewMatches } = await import("./scorers.ts");
const { getMatchScorers, setMatchScorers } = await import("./content.ts");
const type = await import("./sources/types.ts");

type Player = { sourcePlayerId: string; name: string; goals: number; assists: number };

function snapshot(capturedAt: string, players: Player[]) {
  saveSnapshot({
    league: "otwock",
    capturedAt,
    table: [],
    fixtures: [],
    ourPlayers: players.map((p) => ({ ...p, appearances: 4 })),
    topScorers: [],
  });
}

function match(sourceId: string, kickoff: string) {
  return {
    sourceId,
    kickoff,
    dateLabel: "",
    homeTeam: "FC Po Nalewce",
    awayTeam: "Rywal",
    homeGoals: 3,
    awayGoals: 1,
    isOurs: true,
    homeScorers: [],
    awayScorers: [],
    round: null,
  };
}

const NOWAK = { sourcePlayerId: "1", name: "Mateusz Nowak", goals: 4, assists: 1 };
const KOT = { sourcePlayerId: "2", name: "Fabian Kot", goals: 2, assists: 2 };

test("roznica miedzy migawkami daje strzelcow meczu", () => {
  snapshot("2026-10-01T06:00:00.000Z", [NOWAK, KOT]);
  snapshot("2026-10-03T06:00:00.000Z", [
    { ...NOWAK, goals: 6, assists: 2 },
    { ...KOT, goals: 3, assists: 2 },
  ]);

  const mecz = match("m1", "2026-10-02T18:00:00.000Z");
  const result = scorersFromDiff("otwock", mecz, [mecz]);

  assert.deepEqual(result, ["Mateusz Nowak 2G / 1A", "Fabian Kot 1G"]);
});

test("dwa mecze miedzy migawkami - nie zgadujemy, zwracamy nic", () => {
  const a = match("m2", "2026-10-02T18:00:00.000Z");
  const b = match("m3", "2026-10-02T20:00:00.000Z");
  assert.equal(scorersFromDiff("otwock", a, [a, b]), null);
});

test("brak migawki po meczu - zwracamy nic", () => {
  const late = match("m4", "2026-10-20T18:00:00.000Z");
  assert.equal(scorersFromDiff("otwock", late, [late]), null);
});

test("cofniecie liczb przez lige nie tworzy ujemnych strzelcow", () => {
  snapshot("2026-10-05T06:00:00.000Z", [
    { ...NOWAK, goals: 5, assists: 2 },
    { ...KOT, goals: 4, assists: 2 },
  ]);
  const mecz = match("m5", "2026-10-04T18:00:00.000Z");
  const result = scorersFromDiff("otwock", mecz, [mecz]);
  // Nowakowi liga odjela gola (6 -> 5), wiec nie moze sie pojawic.
  assert.ok(result === null || !result.some((r) => r.includes("Nowak")));
});

test("zapis trwaly: policzeni raz, zostaja na stale", () => {
  // Migawka z meczem w srodku, zeby bylo co liczyc.
  saveSnapshot({
    league: "jozefow",
    capturedAt: "2026-11-01T06:00:00.000Z",
    table: [],
    fixtures: [],
    ourPlayers: [{ sourcePlayerId: "9", name: "Jan Test", goals: 1, assists: 0, appearances: 1 }],
    topScorers: [],
  });
  saveSnapshot({
    league: "jozefow",
    capturedAt: "2026-11-03T06:00:00.000Z",
    table: [],
    fixtures: [{ ...match("j1", "2026-11-02T18:00:00.000Z"), isOurs: true }],
    ourPlayers: [{ sourcePlayerId: "9", name: "Jan Test", goals: 4, assists: 1, appearances: 2 }],
    topScorers: [],
  });

  const zapisane = recordScorersForNewMatches("jozefow");
  assert.equal(zapisane.length, 1);
  assert.equal(getMatchScorers("jozefow", "j1"), "Jan Test 3G / 1A");

  // Ponowne uruchomienie nic nie zmienia - juz jest zapisane.
  assert.deepEqual(recordScorersForNewMatches("jozefow"), []);
});

test("reczny wpis nigdy nie zostaje nadpisany", () => {
  setMatchScorers("jozefow", "j1", "Kowalski 2G");
  recordScorersForNewMatches("jozefow");
  assert.equal(getMatchScorers("jozefow", "j1"), "Kowalski 2G");
});

test("sprzatanie", () => {
  try {
    fs.rmSync(TEST_DB, { force: true });
  } catch {
    // Windows potrafi trzymac uchwyt - plik zostanie w katalogu tymczasowym.
  }
  assert.ok(type.LEAGUE_NAMES.otwock);
});
