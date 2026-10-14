import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatDateTime, teamSummary } from "../../../../lib/view.ts";
import {
  LEAGUE_NAMES,
  type Fixture,
  type LeagueKey,
} from "../../../../lib/sources/types.ts";

/*
  Strona zalezy od adresu, wiec nie da sie jej przygotowac z wyprzedzeniem.
  Mowimy to wprost, zamiast dostawac ostrzezenie przy kazdym wejsciu.
*/
export const instant = false;

/**
 * Strona druzyny z tabeli. Celowo skromna: kilka liczb i lista spotkan,
 * bez ocen i komentarzy. To ma byc informacja, nie publicystyka.
 */
export default async function TeamPage({
  params,
}: {
  params: Promise<{ liga: string; slug: string }>;
}) {
  const { liga, slug } = await params;
  if (liga !== "otwock" && liga !== "jozefow") notFound();

  const team = teamSummary(liga as LeagueKey, slug);
  if (!team) notFound();

  const { row } = team;

  /** Wynik zapisany z perspektywy ogladanej druzyny, nie naszej. */
  function scoreFor(fixture: Fixture): { theirs: number; rivals: number; rival: string; home: boolean } {
    const home = fixture.homeTeam === team!.name;
    return {
      theirs: (home ? fixture.homeGoals : fixture.awayGoals) ?? 0,
      rivals: (home ? fixture.awayGoals : fixture.homeGoals) ?? 0,
      rival: home ? fixture.awayTeam : fixture.homeTeam,
      home,
    };
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-sm text-gold underline-offset-4 hover:underline">
        ← Strona główna
      </Link>

      <h1 className="display mt-6 text-5xl sm:text-6xl">{team.name}</h1>
      <p className="mt-2 text-sm text-smoke">
        {LEAGUE_NAMES[team.league]}
        {row?.groupName ? ` · ${row.groupName}` : ""}
      </p>

      {row && (
        <dl className="tabular mt-8 grid grid-cols-2 gap-y-6 border-y border-coal-line py-7 sm:grid-cols-4">
          {[
            { label: "Miejsce", value: String(row.position) },
            { label: "Punkty", value: String(row.points) },
            { label: "Bilans", value: `${row.wins}–${row.draws}–${row.losses}` },
            { label: "Bramki", value: `${row.goalsFor}:${row.goalsAgainst}` },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs tracking-wider text-smoke uppercase">
                {stat.label}
              </dt>
              <dd className="display mt-1 text-4xl">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {team.upcoming.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-[0.18em] text-smoke uppercase">
            Najbliższe mecze
          </h2>
          <ul className="mt-4 grid gap-1">
            {team.upcoming.slice(0, 3).map((fixture) => {
              const s = scoreFor(fixture);
              return (
                <li
                  key={fixture.sourceId}
                  className="flex flex-wrap items-baseline gap-x-3 border-b border-coal-line py-2.5"
                >
                  <span className="flex-1">{s.rival}</span>
                  <span className="text-xs text-smoke">
                    {s.home ? "u siebie" : "wyjazd"}
                  </span>
                  <span className="tabular text-xs text-smoke">
                    {formatDateTime(fixture.kickoff, fixture.dateLabel)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {team.played.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-[0.18em] text-smoke uppercase">
            Rozegrane mecze
          </h2>
          <ul className="mt-4 grid gap-1">
            {team.played.slice(0, 10).map((fixture) => {
              const s = scoreFor(fixture);
              return (
                <li
                  key={fixture.sourceId}
                  className="flex flex-wrap items-baseline gap-x-3 border-b border-coal-line py-2.5"
                >
                  <span className="tabular w-14 shrink-0 font-semibold">
                    {s.theirs}:{s.rivals}
                  </span>
                  <span className="flex-1">{s.rival}</span>
                  <span className="text-xs text-smoke">
                    {s.home ? "u siebie" : "wyjazd"}
                  </span>
                  {fixture.kickoff && (
                    <span className="tabular text-xs text-smoke">
                      {formatDate(fixture.kickoff, "")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="mt-10 text-xs text-smoke">
        Dane z {team.league === "otwock" ? "olsp.pl" : "jlsp.pl"}.
      </p>
    </main>
  );
}
