"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveView } from "../lib/live.ts";

/** Jak często pytamy serwer o wynik. */
const POLL_MS = 15_000;

type Payload = LiveView | { phase: "none" };

function isLive(data: Payload): data is LiveView {
  return data.phase !== "none";
}

/**
 * Odliczanie leci od polnocy w dniu meczu, wiec potrafi miec kilkanascie
 * godzin. Powyzej godziny pokazujemy g:mm:ss, ponizej mm:ss - inaczej
 * wyszloby cos w rodzaju "487:20".
 */
function odliczanie(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const HEADER: Record<LiveView["phase"], string> = {
  countdown: "Dziś gramy",
  first: "Na żywo",
  break: "Przerwa",
  second: "Na żywo",
  finished: "Koniec",
};

export default function LiveWidget() {
  const [view, setView] = useState<LiveView | null>(null);
  /** Kiedy przyszła ostatnia odpowiedź - do lokalnego tykania zegara. */
  const fetchedAt = useRef<number>(0);
  const [, forceTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/live", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as Payload;
        if (cancelled) return;
        fetchedAt.current = Date.now();
        setView(isLive(data) ? data : null);
      } catch {
        // Brak sieci nie ma prawa wysypac strony - widget po prostu zniknie
        // przy nastepnej udanej probie.
      }
    }

    void load();
    const poll = setInterval(load, POLL_MS);
    // Osobny takt co sekunde, zeby odliczanie szlo plynnie miedzy pytaniami.
    const tick = setInterval(() => forceTick((n) => n + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  if (!view) return null;

  const elapsed = Math.floor((Date.now() - fetchedAt.current) / 1000);
  const countdown = Math.max(0, view.countdownSeconds - elapsed);
  const playing = view.phase === "first" || view.phase === "second";

  const right =
    view.phase === "countdown"
      ? odliczanie(countdown)
      : playing
        ? `${view.minute}′`
        : "";

  // Na ostatniej godzinie przed gwizdkiem napis robi sie bardziej naglacy.
  const naglowek =
    view.phase === "countdown" && countdown <= 3600
      ? "Za chwilę"
      : HEADER[view.phase];

  return (
    <aside
      aria-live="polite"
      aria-label="Wynik na żywo"
      className="fixed top-3 right-3 z-50 w-[180px] border-2 border-gold bg-coal shadow-[0_10px_30px_rgba(0,0,0,.6)] sm:top-4 sm:right-4 sm:w-[212px]"
    >
      <div className="flex items-center justify-between bg-gold px-2.5 py-1 text-coal sm:px-3">
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase">
          {naglowek}
        </span>
        {right && (
          <span className="display tabular text-base sm:text-lg">{right}</span>
        )}
      </div>

      <div className="px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="display text-sm sm:text-base">FC Po Nalewce</span>
          {view.phase !== "countdown" && (
            <span className="display tabular text-2xl text-gold sm:text-[26px]">
              {view.ourGoals}
            </span>
          )}
        </div>

        <div className="my-1.5 h-px bg-coal-line" />

        <div className="flex items-baseline justify-between gap-3">
          <span className="display truncate text-sm text-smoke sm:text-base">
            {view.opponent}
          </span>
          {view.phase !== "countdown" && (
            <span className="display tabular text-2xl sm:text-[26px]">
              {view.theirGoals}
            </span>
          )}
        </div>

        <p className="mt-2 text-[10px] tracking-wider text-smoke uppercase">
          {view.home ? "u siebie" : "wyjazd"}
        </p>
      </div>
    </aside>
  );
}
