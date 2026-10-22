import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { connection } from "next/server";
import { listInsta, listPosts } from "../lib/content.ts";
import {
  atHome,
  formatDate,
  formatDateTime,
  leagueSummary,
  opponentOf,
  outcome,
  type LeagueSummary,
} from "../lib/view.ts";
import {
  LEAGUE_SHORT,
  teamSlug,
  type Fixture,
  type LeagueKey,
  type TableRow,
} from "../lib/sources/types.ts";

/*
  Dwie rzeczy sa tu potrzebne RAZEM:
   - `connection()` nizej wymusza render w czasie zadania,
   - `instant = false` pozwala stronie na tym zaczekac.
  Samo `connection()` wywala budowanie, samo `instant = false` nic nie daje,
  bo czytanie bazy to zwykly kod, ktorego Next nie uznaje za dane zmienne.
*/
export const instant = false;

/** Herb wrzucony do public/herb/ - dowolna nazwa, bierzemy pierwszy obrazek. */
function crestSrc(): string | null {
  try {
    const dir = path.join(process.cwd(), "public", "herb");
    const files = fs.readdirSync(dir);
    // Wersja z kanalem alfa (npm run herb) ma pierwszenstwo.
    const file =
      files.find((name) => name.includes("alpha")) ??
      files.find((name) => /\.(png|jpe?g|svg|webp)$/i.test(name));
    return file ? `/herb/${file}` : null;
  } catch {
    return null;
  }
}

function Crest({ src }: { src: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt="Herb FC Po Nalewce"
        className="w-28 shrink-0 sm:w-36 lg:w-44"
      />
    );
  }
  return (
    <div className="flex h-32 w-28 shrink-0 items-center justify-center border-[3px] border-coal/40 text-center sm:h-40 sm:w-36 lg:h-48 lg:w-44">
      <span className="display text-xs leading-tight text-coal/50">
        herb → public/herb/
      </span>
    </div>
  );
}

/** Pozycja w jednej lidze - wielka liczba i bilans pod nia. */
function PositionBlock({ summary }: { summary: LeagueSummary }) {
  const row = summary.ourRow;
  return (
    <div className="flex-1 px-4 py-6 sm:px-7 sm:py-8">
      {/* Stala wysokosc etykiety, zeby obie liczby staly na tej samej linii
          nawet gdy jedna nazwa sie lamie. */}
      <p className="display flex min-h-[2.2em] items-start text-lg leading-tight text-coal/70 sm:text-2xl">
        {LEAGUE_SHORT[summary.league]}
        {row?.groupName ? ` · ${row.groupName.replace(/^Grupa /i, "gr. ")}` : ""}
      </p>
      {row ? (
        <>
          <p className="display tabular mt-1 text-[4.5rem] text-coal sm:text-[7rem]">
            {row.position}
            <span className="text-[2rem] sm:text-[3rem]">.</span>
          </p>
          <p className="tabular mt-2 text-xs font-semibold tracking-wide text-coal/80 sm:text-sm">
            {row.points} pkt · {row.wins}–{row.draws}–{row.losses}
            <br className="sm:hidden" />
            <span className="hidden sm:inline"> · </span>
            {row.goalsFor}:{row.goalsAgainst}
          </p>
        </>
      ) : (
        <p className="mt-4 text-coal/60">Brak danych.</p>
      )}
    </div>
  );
}

function NextMatch({ summary }: { summary: LeagueSummary }) {
  const next = summary.nextMatch;
  if (!next) return null;
  const home = atHome(next);

  return (
    <div className="flex-1 border-l-4 border-gold pl-5">
      <p className="text-xs font-semibold tracking-[0.18em] text-smoke uppercase">
        {LEAGUE_SHORT[summary.league]}
      </p>
      <p className="display mt-2 text-4xl sm:text-5xl">{opponentOf(next)}</p>
      <p className="tabular mt-2 text-sm text-smoke">
        {formatDateTime(next.kickoff, next.dateLabel)}
        {" · "}
        <span className={home ? "text-white" : "text-neon"}>
          {home ? "u siebie" : "wyjazd"}
        </span>
      </p>
    </div>
  );
}

/** Wiersz wyniku w stylu tablicy wynikow. */
function ResultRow({ fixture }: { fixture: Fixture }) {
  const result = outcome(fixture);
  const home = atHome(fixture);
  const ourGoals = home ? fixture.homeGoals : fixture.awayGoals;
  const theirGoals = home ? fixture.awayGoals : fixture.homeGoals;
  const scorers = home ? fixture.homeScorers : fixture.awayScorers;

  const mark =
    result === "W"
      ? "bg-gold text-coal"
      : result === "P"
        ? "bg-coal-line text-smoke"
        : "bg-transparent text-gold ring-2 ring-inset ring-gold";

  return (
    <li className="border-b border-coal-line py-4">
      <div className="flex items-center gap-4 sm:gap-6">
        <span
          className={`display grid h-9 w-9 shrink-0 place-items-center text-xl ${mark}`}
        >
          {result}
        </span>
        <span className="display tabular w-20 shrink-0 text-3xl sm:w-24 sm:text-4xl">
          {ourGoals}<span className="text-smoke">:</span>{theirGoals}
        </span>
        <span className="display min-w-0 flex-1 truncate text-2xl sm:text-3xl">
          {opponentOf(fixture)}
        </span>
        <span className="shrink-0 text-right text-xs text-smoke">
          <span className={home ? "" : "text-neon"}>
            {home ? "dom" : "wyjazd"}
          </span>
          {fixture.kickoff && (
            <>
              <br />
              {formatDate(fixture.kickoff, "")}
            </>
          )}
        </span>
      </div>
      {scorers.length > 0 && (
        <p className="mt-2 pl-[3.25rem] text-sm text-gold">
          {scorers
            .map((s) => (s.goals > 1 ? `${s.name} ×${s.goals}` : s.name))
            .join(" · ")}
        </p>
      )}
    </li>
  );
}

function StandingsTable({
  rows,
  league,
}: {
  rows: TableRow[];
  league: LeagueKey;
}) {
  return (
    <table className="tabular w-full text-sm">
      <thead>
        <tr className="border-b-2 border-coal-line text-left text-xs tracking-wider text-smoke uppercase">
          <th className="py-2 font-semibold">#</th>
          <th className="py-2 font-semibold">Drużyna</th>
          <th className="py-2 text-right font-semibold">M</th>
          <th className="py-2 text-right font-semibold">Pkt</th>
          <th className="hidden py-2 text-right font-semibold sm:table-cell">
            Bramki
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row.groupName ?? ""}-${row.position}-${row.teamName}`}
            className={
              row.isOurs
                ? "bg-gold font-semibold text-coal"
                : "border-b border-coal-line"
            }
          >
            <td className="py-2.5 pl-2">{row.position}</td>
            <td className="py-2.5">
              <Link
                href={`/druzyna/${league}/${teamSlug(row.teamName)}`}
                className="underline-offset-4 hover:underline"
              >
                {row.teamName}
              </Link>
            </td>
            <td className="py-2.5 text-right">{row.played}</td>
            <td className="display py-2.5 text-right text-xl">{row.points}</td>
            <td className="hidden py-2.5 pr-2 text-right sm:table-cell">
              {row.goalsFor}:{row.goalsAgainst}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function Home() {
  /*
    Wstrzymuje przygotowywanie strony do czasu prawdziwego zadania.
    Bez tego Next zbudowal strone statycznie - czytanie bazy to zwykly
    synchroniczny kod, ktorego nie rozpoznaje jako danych zmiennych - i w
    obrazie kontenera, gdzie bazy jeszcze nie ma, wypalal na stale napis
    "Brak danych". Pilnuje tego test strony-dynamiczne.test.ts.
  */
  await connection();

  const otwock = leagueSummary("otwock");
  const jozefow = leagueSummary("jozefow");

  const scorers = otwock.ourPlayers.filter((p) => p.goals > 0);
  const posts = listPosts(3);
  const insta = listInsta(6);

  const captured = [otwock.capturedAt, jozefow.capturedAt]
    .filter((x): x is string => Boolean(x))
    .sort()
    .at(-1);

  return (
    <main>
      {/* --- zloty blok: herb, nazwa, dwie pozycje --- */}
      <section className="bg-gold text-coal">
        <div className="mx-auto max-w-5xl px-4 pt-10 pb-0 sm:px-6 sm:pt-14">
          <div className="flex items-center gap-5 sm:gap-8">
            <Crest src={crestSrc()} />
            <div className="min-w-0">
              <h1 className="display text-[3.2rem] sm:text-[5rem] lg:text-[6.5rem]">
                FC Po
                <br />
                Nalewce
              </h1>
              <p className="mt-3 text-xs font-semibold tracking-[0.2em] text-coal/70 uppercase sm:text-sm">
                Szóstki · Otwock i Józefów · od 2018
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-5xl px-4 sm:px-6">
          <div className="flex divide-x-4 divide-coal/20 border-t-4 border-coal/20">
            <PositionBlock summary={otwock} />
            <PositionBlock summary={jozefow} />
          </div>
        </div>
      </section>

      {/* --- czarny pas: nastepne mecze --- */}
      <section className="bg-coal-deep">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-14">
          <h2 className="text-xs font-semibold tracking-[0.2em] text-smoke uppercase">
            Następne mecze
          </h2>
          <div className="mt-6 flex flex-col gap-8 sm:flex-row">
            <NextMatch summary={otwock} />
            <NextMatch summary={jozefow} />
          </div>
        </div>
      </section>

      {/* --- wyniki, rozdzielone wedlug lig --- */}
      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <h2 className="display text-4xl sm:text-5xl">Ostatnie mecze</h2>
        <div className="mt-8 grid gap-10 sm:grid-cols-2 sm:gap-12">
          {([otwock, jozefow] as const).map((summary) => (
            <div key={summary.league}>
              <h3 className="display border-b-4 border-gold pb-2 text-2xl text-gold">
                {LEAGUE_SHORT[summary.league]}
              </h3>
              {summary.recent.length === 0 ? (
                <p className="mt-4 text-sm text-smoke">Brak rozegranych meczów.</p>
              ) : (
                <ul className="mt-2">
                  {summary.recent.slice(0, 6).map((fixture) => (
                    <ResultRow key={fixture.sourceId} fixture={fixture} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* --- aktualnosci --- */}
      {posts.length > 0 && (
        <section className="border-t border-coal-line">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="display text-4xl sm:text-5xl">Aktualności</h2>
            <div className="mt-8 grid gap-8 sm:grid-cols-3">
              {posts.map((post) => (
                <article key={post.id}>
                  <Link href={`/aktualnosci/${post.slug}`} className="group block">
                    {post.coverPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.coverPath}
                        alt=""
                        className="mb-4 aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      <div className="mb-4 aspect-[4/3] w-full bg-coal-line" />
                    )}
                    <p className="text-xs text-smoke">
                      {new Date(post.publishedAt).toLocaleDateString("pl-PL")}
                    </p>
                    <h3 className="display mt-1 text-2xl group-hover:text-gold">
                      {post.title}
                    </h3>
                    {post.lead && (
                      <p className="mt-2 text-sm text-smoke">{post.lead}</p>
                    )}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* --- zloty blok: strzelcy --- */}
      {scorers.length > 0 && (
        <section className="bg-gold text-coal">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="display text-4xl sm:text-5xl">Nasi strzelcy</h2>
            <p className="mt-2 max-w-prose text-sm text-coal/70">
              Z otwockiej ligi. Józefowska publikuje tylko dziesiątkę najlepszych
              strzelców, bez przypisania do drużyn.
            </p>
            <ul className="mt-7 grid gap-x-12 sm:grid-cols-2">
              {scorers.map((player) => (
                <li
                  key={player.sourcePlayerId}
                  className="flex items-baseline gap-4 border-b-2 border-coal/15 py-3"
                >
                  <span className="display tabular w-10 text-4xl">
                    {player.goals}
                  </span>
                  <span className="flex-1 font-semibold">{player.name}</span>
                  {(player.assists ?? 0) > 0 && (
                    <span className="text-sm text-coal/60">
                      {player.assists} as.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* --- tabele --- */}
      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-12 sm:grid-cols-2">
          <div>
            <h2 className="display text-3xl">Tabela otwocka</h2>
            <div className="mt-4">
              <StandingsTable rows={otwock.ourGroup} league="otwock" />
            </div>
          </div>
          <div>
            <h2 className="display text-3xl">
              Tabela józefowska
              {jozefow.ourRow?.groupName
                ? ` · ${jozefow.ourRow.groupName.replace(/^Grupa /i, "gr. ")}`
                : ""}
            </h2>
            <div className="mt-4">
              <StandingsTable rows={jozefow.ourGroup} league="jozefow" />
            </div>
          </div>
        </div>
      </section>

      {/* --- Instagram: oficjalny podglad, bez posrednikow --- */}
      {insta.length > 0 && (
        <section className="border-t border-coal-line bg-coal-deep">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="display text-4xl sm:text-5xl">Instagram</h2>
              <a
                href="https://www.instagram.com/fc_ponalewce_6/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gold underline-offset-4 hover:underline"
              >
                @fc_ponalewce_6
              </a>
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {insta.map((item) => (
                <iframe
                  key={item.id}
                  src={`${item.url}embed`}
                  title="Post na Instagramie"
                  loading="lazy"
                  scrolling="no"
                  className="h-[520px] w-full border-0 bg-white"
                  allowFullScreen
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-coal-line">
        <div className="mx-auto max-w-5xl px-4 py-8 text-xs text-smoke sm:px-6">
          <p>
            Chcesz taką stronę dla swojej drużyny?{" "}
            <a
              href="https://www.instagram.com/janekkozluk_/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline-offset-2 hover:underline"
            >
              Napisz na Instagramie
            </a>
          </p>
          <p className="mt-1">
            Dane z olsp.pl i jlsp.pl
            {captured
              ? `, stan na ${new Date(captured).toLocaleString("pl-PL", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}`
              : ""}
            .
          </p>
        </div>
      </footer>
    </main>
  );
}
