"use client";

import { useEffect, useState } from "react";
import { bumpScoreAction } from "./actions.ts";
import type { LiveView } from "../../lib/live.ts";

/**
 * Plus i minus przy wyniku, widoczne tylko w trakcie meczu.
 *
 * Wynik trzymamy też lokalnie, żeby po kliknięciu liczba zmieniała się od
 * razu - przy linii bocznej nikt nie będzie czekał na odpowiedź serwera.
 * Odpytywanie co kilkanaście sekund i tak sprostuje stan, gdyby dwie osoby
 * klikały naraz.
 */
const POLL_MS = 15_000;

const PHASE_LABEL: Record<LiveView["phase"], string> = {
  countdown: "Zaraz start",
  first: "1. połowa",
  break: "Przerwa",
  second: "2. połowa",
  finished: "Po meczu",
};

export default function LiveControls() {
  const [view, setView] = useState<LiveView | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    Stan bierzemy z przegladarki, nie z serwera renderujacego strone.
    Dwa powody: strona panelu nie moze siegac po biezacy czas podczas
    przygotowywania (Next na to nie pozwala przy wlaczonym cacheComponents),
    a przy okazji sekcja pojawia sie sama, gdy mecz sie zacznie - bez
    odswiezania panelu.
  */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as LiveView | { phase: "none" };
        if (cancelled) return;
        setView(data.phase === "none" ? null : data);
      } catch {
        // offline przy boisku - zostawiamy ostatni znany stan
      }
    }

    void load();
    const poll = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  if (!view) return null;

  async function bump(side: "our" | "their", delta: number) {
    setBusy(true);
    // Natychmiastowa reakcja, zanim serwer odpowie.
    setView((v) =>
      v === null
        ? v
        : {
            ...v,
            ourGoals: Math.max(0, v.ourGoals + (side === "our" ? delta : 0)),
            theirGoals: Math.max(0, v.theirGoals + (side === "their" ? delta : 0)),
          },
    );
    const result = await bumpScoreAction(side, delta);
    if (result) setView((v) => (v === null ? v : { ...v, ...result }));
    setBusy(false);
  }

  const button =
    "display grid h-11 w-11 shrink-0 place-items-center border-2 " +
    "border-coal-line text-2xl transition-colors hover:border-gold " +
    "hover:text-gold disabled:opacity-40 sm:h-14 sm:w-14";

  function Row({
    name,
    goals,
    side,
    ours,
  }: {
    name: string;
    goals: number;
    side: "our" | "their";
    ours: boolean;
  }) {
    return (
      <div className="flex items-center gap-2 border-b border-coal-line py-3 sm:gap-4">
        {/*
          min-w-0 jest konieczne: bez niego element z flex-1 nie kurczy sie
          ponizej szerokosci tekstu i na telefonie wypycha przycisk "+"
          poza ekran.
        */}
        <span
          className={`display min-w-0 flex-1 truncate text-lg sm:text-2xl ${ours ? "" : "text-smoke"}`}
        >
          {name}
        </span>
        <button
          type="button"
          className={button}
          disabled={busy || goals === 0}
          onClick={() => bump(side, -1)}
          aria-label={`Odejmij gola: ${name}`}
        >
          −
        </button>
        <span
          className={`display tabular w-10 shrink-0 text-center text-3xl sm:w-12 sm:text-4xl ${ours ? "text-gold" : ""}`}
        >
          {goals}
        </span>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => bump(side, 1)}
          aria-label={`Dodaj gola: ${name}`}
        >
          +
        </button>
      </div>
    );
  }

  return (
    <section className="border-t-2 border-coal-line pt-8">
      <h2 className="display mb-5 text-3xl">Wynik na żywo</h2>

      <p className="mb-4 text-sm text-smoke">
        {PHASE_LABEL[view.phase]}
        {(view.phase === "first" || view.phase === "second") && ` · ${view.minute}′`}
        {" · "}
        {view.home ? "u siebie" : "wyjazd"}
      </p>

      <Row name="FC Po Nalewce" goals={view.ourGoals} side="our" ours />
      <Row name={view.opponent} goals={view.theirGoals} side="their" ours={false} />

      <p className="mt-4 text-xs text-smoke">
        Ten wynik widzą odwiedzający w widgecie. Nie wpływa na tabele ani
        grafiki — tam obowiązuje oficjalny wynik z ligi.
      </p>
    </section>
  );
}
