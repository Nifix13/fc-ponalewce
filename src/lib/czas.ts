/**
 * Czas lig jest POLSKI, a serwer niekoniecznie.
 *
 * Obie ligi podają godziny bez strefy ("2026-10-22T19:20:00") i mają na myśli
 * czas warszawski. Kontener na Northflanku chodzi w UTC, więc `new Date(...)`
 * czytał to jako 19:20 UTC, czyli 21:20 u nas - widget odliczał do meczu,
 * który już trwał od 20 minut.
 *
 * Dlatego nie polegamy na strefie serwera ani na zmiennej TZ. Przeliczamy
 * jawnie i ta sama liczba wychodzi wszędzie.
 */

export const LEAGUE_TZ = "Europe/Warsaw";

/**
 * Przesunięcie strefy warszawskiej względem UTC dla danej chwili, w ms.
 * Liczone z prawdziwego kalendarza, więc samo radzi sobie ze zmianą czasu.
 */
function offsetAt(instant: number): number {
  const asUtc = new Date(instant).toLocaleString("en-US", { timeZone: "UTC" });
  const asWarsaw = new Date(instant).toLocaleString("en-US", {
    timeZone: LEAGUE_TZ,
  });
  return new Date(asWarsaw).getTime() - new Date(asUtc).getTime();
}

/**
 * Zamienia godzinę z terminarza (czas warszawski bez strefy) na konkretną
 * chwilę na osi czasu.
 */
export function leagueTimeToInstant(naiveIso: string): number {
  // Najpierw czytamy jako UTC - to daje punkt wyjscia bez wplywu serwera.
  const asIfUtc = Date.parse(`${naiveIso.replace(" ", "T").slice(0, 19)}Z`);
  if (Number.isNaN(asIfUtc)) return Number.NaN;

  // Odejmujemy przesuniecie strefy. Liczymy je dwa razy, bo samo przesuniecie
  // zalezy od chwili - przy zmianie czasu pierwsze przyblizenie moze trafic
  // po zlej stronie granicy.
  const first = asIfUtc - offsetAt(asIfUtc);
  return asIfUtc - offsetAt(first);
}

/** Części daty warszawskiej dla podanej chwili. */
function warsawParts(instant: number): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
  const [y, m, d] = parts.split("-").map(Number);
  return { y, m, d };
}

/** Północ warszawska rozpoczynająca dzień, w którym wypada ta chwila. */
export function startOfLeagueDay(instant: number): number {
  const { y, m, d } = warsawParts(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return leagueTimeToInstant(`${y}-${pad(m)}-${pad(d)}T00:00:00`);
}

/** Północ warszawska kończąca ten dzień. */
export function endOfLeagueDay(instant: number): number {
  const { y, m, d } = warsawParts(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  return leagueTimeToInstant(
    `${nextDay.getUTCFullYear()}-${pad(nextDay.getUTCMonth() + 1)}-` +
      `${pad(nextDay.getUTCDate())}T00:00:00`,
  );
}

/** Godzina i data po polsku, niezależnie od strefy serwera. */
export function formatLeagueDateTime(instant: number, withTime = true): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: LEAGUE_TZ,
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(instant));
}
