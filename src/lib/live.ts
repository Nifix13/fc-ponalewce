/**
 * Stan widgetu „na żywo”.
 *
 * Zegar liczy WYŁĄCZNIE z terminarza — nie ma startu, stopu ani korekty na
 * spóźniony gwizdek. To świadoma decyzja: widget jest dodatkiem, ma działać
 * „na oko”, a nie być oficjalnym pomiarem.
 *
 * Mecz: 30 minut, 5 minut przerwy, 30 minut. Minuty w drugiej połowie lecą
 * dalej (31′–60′), tak jak w piłce.
 */

import type { Fixture, LeagueKey } from "./sources/types.ts";
import { atHome, opponentOf } from "./view.ts";

const MINUTE = 60_000;

export const HALF_MINUTES = 30;
export const BREAK_MINUTES = 5;

const FIRST_END = HALF_MINUTES * MINUTE;
const SECOND_START = (HALF_MINUTES + BREAK_MINUTES) * MINUTE;
const SECOND_END = (HALF_MINUTES * 2 + BREAK_MINUTES) * MINUTE;

export type LivePhase = "countdown" | "first" | "break" | "second" | "finished";

export type LiveView = {
  league: LeagueKey;
  sourceId: string;
  opponent: string;
  /** Gramy u siebie? Decyduje o kolejności drużyn w widgecie. */
  home: boolean;
  ourGoals: number;
  theirGoals: number;
  phase: LivePhase;
  /** Sekundy do pierwszego gwizdka; tylko przy odliczaniu. */
  countdownSeconds: number;
  /** Minuta meczu 1–60; tylko w trakcie gry. */
  minute: number;
};

/** Północ po dniu, w którym rozegrano mecz - do tego czasu wisi wynik. */
function endOfMatchDay(kickoff: Date): number {
  const end = new Date(kickoff);
  end.setHours(24, 0, 0, 0);
  return end.getTime();
}

/** Początek dnia meczu - od tej chwili leci odliczanie. */
function startOfMatchDay(kickoff: Date): number {
  const start = new Date(kickoff);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

/**
 * Faza meczu dla podanej chwili. `null` znaczy, że widget ma się nie pokazywać.
 */
export function phaseAt(
  now: number,
  kickoffIso: string,
): { phase: LivePhase; countdownSeconds: number; minute: number } | null {
  const kickoff = new Date(kickoffIso);
  const start = kickoff.getTime();
  if (Number.isNaN(start)) return null;

  const since = now - start;

  // Odliczanie widac przez caly dzien meczu, od polnocy.
  if (now < startOfMatchDay(kickoff)) return null;

  if (since < 0) {
    return {
      phase: "countdown",
      countdownSeconds: Math.ceil(-since / 1000),
      minute: 0,
    };
  }

  if (since < FIRST_END) {
    return {
      phase: "first",
      countdownSeconds: 0,
      minute: Math.min(HALF_MINUTES, Math.floor(since / MINUTE) + 1),
    };
  }

  if (since < SECOND_START) {
    return { phase: "break", countdownSeconds: 0, minute: HALF_MINUTES };
  }

  if (since < SECOND_END) {
    return {
      phase: "second",
      countdownSeconds: 0,
      minute: Math.min(
        HALF_MINUTES * 2,
        HALF_MINUTES + Math.floor((since - SECOND_START) / MINUTE) + 1,
      ),
    };
  }

  // Po meczu wynik wisi do końca dnia, potem widget znika.
  if (now < endOfMatchDay(kickoff)) {
    return { phase: "finished", countdownSeconds: 0, minute: HALF_MINUTES * 2 };
  }

  return null;
}

/**
 * Wybiera mecz, który widget ma pokazać: ten, którego faza jest aktywna.
 * Gdy pasuje więcej niż jeden (teoretycznie dwie ligi tego samego dnia),
 * wygrywa ten bliżej pierwszego gwizdka.
 */
export function pickLiveFixture(
  now: number,
  fixtures: { league: LeagueKey; fixture: Fixture }[],
): { league: LeagueKey; fixture: Fixture; phase: LivePhase; countdownSeconds: number; minute: number } | null {
  const candidates = fixtures
    .filter((entry) => entry.fixture.isOurs && entry.fixture.kickoff)
    .map((entry) => {
      const state = phaseAt(now, entry.fixture.kickoff!);
      return state ? { ...entry, ...state } : null;
    })
    .filter((entry) => entry !== null);

  if (candidates.length === 0) return null;

  return candidates.sort(
    (a, b) =>
      Math.abs(now - new Date(a.fixture.kickoff!).getTime()) -
      Math.abs(now - new Date(b.fixture.kickoff!).getTime()),
  )[0];
}

/** Składa to, co widget dostaje przez sieć. */
export function toLiveView(
  picked: NonNullable<ReturnType<typeof pickLiveFixture>>,
  score: { ourGoals: number; theirGoals: number },
): LiveView {
  return {
    league: picked.league,
    sourceId: picked.fixture.sourceId,
    opponent: opponentOf(picked.fixture),
    home: atHome(picked.fixture),
    ourGoals: score.ourGoals,
    theirGoals: score.theirGoals,
    phase: picked.phase,
    countdownSeconds: picked.countdownSeconds,
    minute: picked.minute,
  };
}
