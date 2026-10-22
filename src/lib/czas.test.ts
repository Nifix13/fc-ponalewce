import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Serwer może chodzić w dowolnej strefie - na Northflanku chodzi w UTC.
 * Godziny z terminarza są warszawskie i bez strefy, więc muszą dawać ten sam
 * wynik niezależnie od ustawień maszyny.
 *
 * Testy uruchamiamy w OSOBNYCH procesach z wymuszonym TZ, bo zmiana
 * `process.env.TZ` w trakcie działania nie wpływa już na utworzone daty.
 */

const ROOT = process.cwd();

function wStrefie(tz: string, kod: string): string {
  return execFileSync(process.execPath, ["--input-type=module", "-e", kod], {
    cwd: ROOT,
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  }).trim();
}

/** Mecz z Medellinem: 22.10.2026, 19:20 czasu polskiego (CEST, UTC+2). */
const MECZ = "2026-10-22T19:20:00";

test("godzina z terminarza znaczy to samo w kazdej strefie serwera", () => {
  const kod =
    `import { leagueTimeToInstant } from "./src/lib/czas.ts";` +
    `console.log(leagueTimeToInstant("${MECZ}"));`;

  const utc = wStrefie("UTC", kod);
  const warszawa = wStrefie("Europe/Warsaw", kod);
  const tokio = wStrefie("Asia/Tokyo", kod);

  assert.equal(utc, warszawa, "UTC i Warszawa musza dac te sama chwile");
  assert.equal(utc, tokio, "Tokio tez");

  // 19:20 czasu polskiego w pazdzierniku to 17:20 UTC.
  assert.equal(new Date(Number(utc)).toISOString(), "2026-10-22T17:20:00.000Z");
});

test("mecz trwajacy od 20 minut NIE jest odliczaniem, takze w UTC", () => {
  // Chwila: 19:42 czasu polskiego = 17:42 UTC. Dokladnie sytuacja z bledu.
  const kod =
    `import { phaseAt } from "./src/lib/live.ts";` +
    `const teraz = Date.parse("2026-10-22T17:42:00Z");` +
    `const s = phaseAt(teraz, "${MECZ}");` +
    `console.log(JSON.stringify({ faza: s?.phase, minuta: s?.minute }));`;

  for (const tz of ["UTC", "Europe/Warsaw", "America/New_York"]) {
    const wynik = JSON.parse(wStrefie(tz, kod));
    assert.equal(wynik.faza, "first", `strefa ${tz}: powinna byc 1. polowa`);
    assert.equal(wynik.minuta, 23, `strefa ${tz}: 23. minuta`);
  }
});

test("dzien meczu liczy sie po warszawsku, nie po serwerowemu", () => {
  // 23:30 czasu polskiego 21.10 to jeszcze NIE dzien meczu (22.10),
  // choc w UTC jest wtedy dopiero 21:30 tego samego dnia.
  const kod =
    `import { phaseAt } from "./src/lib/live.ts";` +
    `const przed = Date.parse("2026-10-21T21:30:00Z");` +
    `const poPolnocy = Date.parse("2026-10-21T22:30:00Z");` +
    `console.log(JSON.stringify({` +
    `  przed: phaseAt(przed, "${MECZ}")?.phase ?? null,` +
    `  poPolnocy: poPolnocy ? (phaseAt(poPolnocy, "${MECZ}")?.phase ?? null) : null` +
    `}));`;

  for (const tz of ["UTC", "Europe/Warsaw"]) {
    const wynik = JSON.parse(wStrefie(tz, kod));
    assert.equal(wynik.przed, null, `strefa ${tz}: przed polnoca nic`);
    assert.equal(
      wynik.poPolnocy,
      "countdown",
      `strefa ${tz}: po polnocy odliczanie`,
    );
  }
});

test("data na stronie pokazuje godzine polska, nie serwerowa", () => {
  const kod =
    `import { formatDateTime } from "./src/lib/view.ts";` +
    `console.log(formatDateTime("${MECZ}", "-"));`;

  assert.equal(wStrefie("UTC", kod), wStrefie("Europe/Warsaw", kod));
  assert.match(wStrefie("UTC", kod), /19:20/);
});

test("sciezka do modulu istnieje", () => {
  assert.ok(path.join(ROOT, "src", "lib", "czas.ts"));
});
