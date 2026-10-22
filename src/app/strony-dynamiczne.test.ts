import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Strona, która czyta bazę, MUSI renderować się w czasie żądania.
 *
 * Skąd ten test: strona główna została zbudowana statycznie, a w obrazie
 * kontenera bazy jeszcze nie ma - plik jest wykluczony z repozytorium,
 * a wolumen montuje się dopiero przy starcie. W efekcie na serwerze wisiał
 * wypalony na stałe napis „Brak danych", mimo że baza była pełna.
 *
 * W trybie deweloperskim tego nie widać, bo każde żądanie renderuje od nowa.
 * Dlatego pilnuje tego test, a nie czujność.
 */

const APP = path.join(process.cwd(), "src", "app");

/** Moduły, których użycie oznacza czytanie bazy. */
const DB_IMPORTS = [
  "/lib/db.ts",
  "/lib/view.ts",
  "/lib/content.ts",
  "/lib/live-source.ts",
];

function pageFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Trasy API nie są prerenderowane, więc ich nie dotyczy.
      if (entry.name === "api") continue;
      found.push(...pageFiles(full));
    } else if (entry.name === "page.tsx") {
      found.push(full);
    }
  }
  return found;
}

test("kazda strona czytajaca baze jest oznaczona jako dynamiczna", () => {
  const winne: string[] = [];

  for (const file of pageFiles(APP)) {
    const source = fs.readFileSync(file, "utf8");
    const czytaBaze = DB_IMPORTS.some((mod) => source.includes(mod));
    if (!czytaBaze) continue;

    /*
      Samo `instant = false` NIE wystarcza - pozwala stronie blokowac na
      danych dynamicznych, ale jej taka nie czyni. Strona musi faktycznie
      siegnac po cos z czasu zadania: adres, parametry, ciasteczka albo
      jawne connection().
    */
    const wCzasieZadania =
      /await\s+connection\(\)/.test(source) ||
      /await\s+params/.test(source) ||
      /await\s+searchParams/.test(source) ||
      /isLoggedIn\(\)/.test(source);

    if (!wCzasieZadania) winne.push(path.relative(process.cwd(), file));
  }

  assert.deepEqual(
    winne,
    [],
    `Te strony czytaja baze, ale moga zostac zbudowane statycznie ` +
      `i pokaza puste dane na serwerze:\n  ${winne.join("\n  ")}`,
  );
});
