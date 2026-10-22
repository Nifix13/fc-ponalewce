import { test } from "node:test";
import assert from "node:assert/strict";
import { phaseAt, pickLiveFixture } from "./live.ts";
import { leagueTimeToInstant } from "./czas.ts";
import type { Fixture } from "./sources/types.ts";

/**
 * Mecz o 19:40 czasu POLSKIEGO - tak jak w terminarzu Józefowa.
 *
 * Chwile liczymy przez leagueTimeToInstant, a nie przez `new Date(...)`.
 * Inaczej same testy zalezalyby od strefy maszyny i przechodzilyby tylko
 * w Polsce - dokladnie ten blad siedzial wczesniej w aplikacji.
 */
const KICKOFF = "2026-10-28T19:40:00";
const START = leagueTimeToInstant(KICKOFF);
const MIN = 60_000;

function at(offsetMinutes: number): number {
  return START + offsetMinutes * MIN;
}

test("dzien przed meczem widget sie nie pokazuje", () => {
  const dzienWczesniej = leagueTimeToInstant("2026-10-27T23:59:00");
  assert.equal(phaseAt(dzienWczesniej, KICKOFF), null);
});

test("od polnocy w dniu meczu leci odliczanie, nawet wiele godzin", () => {
  const polnoc = leagueTimeToInstant("2026-10-28T00:00:00");
  const state = phaseAt(polnoc, KICKOFF);
  assert.equal(state?.phase, "countdown");
  // Mecz o 19:40, wiec od polnocy zostaje 19 godzin i 40 minut.
  assert.equal(state?.countdownSeconds, (19 * 60 + 40) * 60);
});

test("godzine przed meczem odliczanie dalej dziala", () => {
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
  const polnoc = leagueTimeToInstant("2026-10-29T00:00:00");
  assert.equal(phaseAt(polnoc, KICKOFF), null);
  assert.equal(phaseAt(polnoc - 1000, KICKOFF)?.phase, "finished");
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

test("gdy pasuja dwa mecze, wygrywa ten blizszy gwizdka", () => {
  // Godzina wprost z terminarza, nie budowana z zegara maszyny - inaczej
  // test przechodzilby tylko w polskiej strefie.
  const terazKickoff = "2026-10-28T19:45:00";
  const picked = pickLiveFixture(at(5), [
    { league: "jozefow", fixture: fixture({ sourceId: "dawny" }) },
    { league: "otwock", fixture: fixture({ sourceId: "swiezy", kickoff: terazKickoff }) },
  ]);
  assert.equal(picked?.fixture.sourceId, "swiezy");
});

test("gdy nic nie pasuje, nie ma czego pokazac", () => {
  const dwaDniWczesniej = leagueTimeToInstant("2026-10-26T12:00:00");
  assert.equal(
    pickLiveFixture(dwaDniWczesniej, [{ league: "otwock", fixture: fixture() }]),
    null,
  );
});
