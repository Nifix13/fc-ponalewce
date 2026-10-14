import Link from "next/link";
import { redirect } from "next/navigation";
import { isLoggedIn } from "../../../lib/auth.ts";
import { leagueSummary } from "../../../lib/view.ts";
import { LEAGUE_SHORT, type LeagueKey } from "../../../lib/sources/types.ts";
import { CoverForm } from "../PanelForms.tsx";
import { getMatchScorers } from "../../../lib/content.ts";

/*
  Panel czyta ciasteczko sesji, wiec nie da sie go przygotowac z
  wyprzedzeniem. Mowimy to Nextowi wprost, zamiast dostawac
  ostrzezenie o zablokowanym prerenderowaniu przy kazdym wejsciu.
*/
export const instant = false;

type Variant = { label: string; query: string; note: string };

function Card({ variant }: { variant: Variant }) {
  const src = `/api/grafika?${variant.query}`;
  return (
    <figure className="border-2 border-coal-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={variant.label} className="aspect-square w-full" />
      <figcaption className="flex items-center justify-between gap-3 p-3">
        <span>
          <span className="display block text-xl">{variant.label}</span>
          <span className="text-xs text-smoke">{variant.note}</span>
        </span>
        <a
          href={src}
          download={`${variant.query.replace(/[^a-z0-9]+/gi, "-")}.png`}
          className="display shrink-0 bg-gold px-4 py-2 text-lg text-coal hover:bg-white"
        >
          Pobierz
        </a>
      </figcaption>
    </figure>
  );
}

export default async function Grafiki({
  searchParams,
}: {
  searchParams: Promise<{ foto?: string; liga?: string; mecz?: string }>;
}) {
  if (!(await isLoggedIn())) redirect("/panel");

  const { foto, liga, mecz } = await searchParams;
  const coverLeague = (liga === "jozefow" ? "jozefow" : "otwock") as LeagueKey;
  const leagues: LeagueKey[] = ["otwock", "jozefow"];

  const matchOptions = leagues.flatMap((key) => {
    const short = LEAGUE_SHORT[key];
    return leagueSummary(key)
      .recent.slice(0, 8)
      .map((fixture) => {
        const date = fixture.kickoff
          ? new Date(fixture.kickoff).toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "numeric",
            })
          : fixture.dateLabel || "—";
        const us = /nalewce/i.test(fixture.homeTeam);
        const our = us ? fixture.homeGoals : fixture.awayGoals;
        const their = us ? fixture.awayGoals : fixture.homeGoals;
        const rival = us ? fixture.awayTeam : fixture.homeTeam;
        return {
          value: `${key}|${fixture.sourceId}`,
          label: `${short} · ${date} · ${rival} ${our}:${their}`,
        };
      });
  });
  const variants: Variant[] = [];

  for (const league of leagues) {
    const summary = leagueSummary(league);
    const short = LEAGUE_SHORT[league];

    if (summary.lastMatch) {
      variants.push({
        label: "Wynik meczu",
        query: `typ=wynik&liga=${league}`,
        note: `${short} — ostatni rozegrany`,
      });
    }
    variants.push({
      label: "Tabela",
      query: `typ=tabela&liga=${league}`,
      note: short,
    });
    for (const player of summary.ourPlayers.filter((p) => p.goals > 0).slice(0, 6)) {
      variants.push({
        label: player.name,
        query: `typ=zawodnik&liga=${league}&zawodnik=${encodeURIComponent(player.name)}`,
        note: `${short} — ${player.goals} gole`,
      });
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-5xl">Grafiki</h1>
        <Link href="/panel" className="text-sm text-gold hover:underline">
          ← Panel
        </Link>
      </header>

      <p className="mb-8 max-w-prose text-sm text-smoke">
        Obrazy 1080×1080, składane z aktualnych danych lig przy każdym otwarciu tej
        strony. Jeśli wynik się zmienił, pobierz ponownie — grafika będzie nowa.
      </p>

      <section className="mb-12 border-2 border-gold p-5">
        <h2 className="display text-3xl text-gold">Okładka na post</h2>
        <p className="mt-2 mb-5 max-w-prose text-sm text-smoke">
          Twoje zdjęcie w tle, u góry rozstrzygnięcie meczu, u dołu złoty pasek
          z wynikiem i przeciwnikiem. Bierze ostatni rozegrany mecz z wybranej ligi.
        </p>
        <CoverForm
          matches={matchOptions}
          selected={mecz ? `${coverLeague}|${mecz}` : (matchOptions[0]?.value ?? "")}
          scorers={mecz ? getMatchScorers(coverLeague, mecz) : ""}
        />

        {foto && (
          <div className="mt-8 max-w-md">
            <Card
              variant={{
                label: "Okładka",
                query:
                  `typ=okladka&liga=${coverLeague}` +
                  `&foto=${encodeURIComponent(foto)}` +
                  (mecz ? `&mecz=${encodeURIComponent(mecz)}` : ""),
                note: "z Twoim zdjęciem",
              }}
            />
          </div>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        {variants.map((variant) => (
          <Card key={variant.query} variant={variant} />
        ))}
      </div>
    </main>
  );
}
