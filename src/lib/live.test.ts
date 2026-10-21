import { test } from "node:test";
import assert from "node:assert/strict";
import { phaseAt, pickLiveFixture } from "./live.ts";
import type { Fixture } from "./sources/types.ts";

/** Mecz o 19:40 czasu lokalnego - tak jak w terminarzu Józefowa. */
const KICKOFF = "2026-10-28T19:40:00";
const START = new Date(KICKOFF).getTime();
const MIN = 60_000;

function at(offsetMinutes: number): number {
  return START + offsetMinutes * MIN;
}

test("ponad godzine przed meczem widget sie nie pokazuje", () => {
  assert.equal(phaseAt(at(-61), KICKOFF), null);
});

test("dokladnie godzine przed - zaczyna sie odliczanie", () => {
  const state = phaseAt(at(-60), KICKOFF);
  assert.equal(state?.phase, "countdown");
  assert.equal(state?.countdownSeconds, 3600);
});

test("minute przed gwizdkiem odliczanie pokazuje 60 sekund", () => {
  assert.equal(phaseAt(at(-1), KICKOFF)?.countdownSeconds, 60);
});

test("pierwszy gwizdek to 1 minuta, nie zero", () => {
  const state = phaseAt(START, KICKOFF);
  assert.equal(state?.phase, "first");
  assert.equal(state?.minute, 1);
});

test("pierwsza polowa dochodzi do 30 i nie przekracza", () => {
  assert.equal(phaseAt(at(14), KICKOFF)?.minute, 15);
  assert.equal(phaseAt(at(29.5), KICKOFF)?.minute, 30);
});

test("miedzy polowami jest przerwa", () => {
  assert.equal(phaseAt(at(30), KICKOFF)?.phase, "break");
  assert.equal(phaseAt(at(34.9), KICKOFF)?.phase, "break");
});

test("druga polowa liczy dalej od 31, nie od nowa", () => {
  const state = phaseAt(at(35), KICKOFF);
  assert.equal(state?.phase, "second");
  assert.equal(state?.minute, 31);
});

test("druga polowa konczy sie na 60", () => {
  assert.equal(phaseAt(at(64.9), KICKOFF)?.minute, 60);
});

test("po ostatnim gwizdku wynik zostaje", () => {
  assert.equal(phaseAt(at(65), KICKOFF)?.phase, "finished");
  assert.equal(phaseAt(at(180), KICKOFF)?.phase, "finished");
});

test("po polnocy widget znika", () => {
  const polnoc = new Date(KICKOFF);
  polnoc.setHours(24, 0, 0, 0);
  assert.equal(phaseAt(polnoc.getTime(), KICKOFF), null);
  assert.equal(phaseAt(polnoc.getTime() - 1000, KICKOFF)?.phase, "finished");
});

// --- wybor meczu ----------------------------------------------------------

function fixture(over: Partial<Fixture> = {}): Fixture {
  return {
    sourceId: "f1",
    kickoff: KICKOFF,
    dateLabel: "",
    homeTeam: "FC Po Nalewce",
    awayTeam: "Miyagi Turbo",
    homeGoals: null,
    awayGoals: null,
    isOurs: true,
    homeScorers: [],
    awayScorers: [],
    round: null,
    ...over,
  };
}

test("bierze nasz mecz z dowolnej ligi", () => {
  const picked = pickLiveFixture(at(10), [
    { league: "jozefow", fixture: fixture() },
  ]);
  assert.equal(picked?.league, "jozefow");
  assert.equal(picked?.phase, "first");
});

test("cudze mecze sa pomijane", () => {
  const obcy = fixture({ isOurs: false, sourceId: "obcy" });
  assert.equal(pickLiveFixture(at(10), [{ league: "otwock", fixture: obcy }]), null);
});

test("mecz bez godziny jest pomijany", () => {
  const bezDaty = fixture({ kickoff: null, sourceId: "bez-daty" });
  assert.equal(
    pickLiveFixture(at(10), [{ league: "jozefow", fixture: bezDaty }]),
    null,
  );
});

/**
 * Terminarz podaje czas LOKALNY bez strefy, wiec data testowa musi byc
 * budowana tak samo. `toISOString()` zwraca UTC i przesuwalo mecz o dwie
 * godziny - pierwsza wersja tego testu wlasnie na tym polegla.
 */
function localIso(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

test("gdy pasuja dwa mecze, wygrywa ten blizszy gwizdka", () => {
  const terazKickoff = localIso(at(5));
  const picked = pickLiveFixture(at(5), [
    { league: "jozefow", fixture: fixture({ sourceId: "dawny" }) },
    { league: "otwock", fixture: fixture({ sourceId: "swiezy", kickoff: terazKickoff }) },
  ]);
  assert.equal(picked?.fixture.sourceId, "swiezy");
});

test("gdy nic nie pasuje, nie ma czego pokazac", () => {
  assert.equal(pickLiveFixture(at(-200), [{ league: "otwock", fixture: fixture() }]), null);
});
