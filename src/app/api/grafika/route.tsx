/**
 * Generator grafik 1080x1080 na Instagram.
 *
 * ?typ=wynik     - wynik meczu ze strzelcami
 * ?typ=tabela    - tabela ligowa z podswietlonym naszym wierszem
 * ?typ=zawodnik  - statystyki jednego zawodnika
 *
 * Wspolny parametr: liga=otwock|jozefow
 *
 * Uwaga przy edycji: Satori zna wylacznie flexbox (bez grida), a kazdy
 * element z wiecej niz jednym dzieckiem musi miec jawne display:flex.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { charsetFor, fontData } from "../../../lib/og-fonts.ts";
import { leagueSummary, atHome, opponentOf, outcome } from "../../../lib/view.ts";
import { getMatchScorers, splitScorers } from "../../../lib/content.ts";
import { scorersFromDiff } from "../../../lib/scorers.ts";
import { LEAGUE_NAMES, type LeagueKey } from "../../../lib/sources/types.ts";

const SIZE = 1080;
const GOLD = "#ffd000";
const COAL = "#0d0d0d";

/**
 * Zdjecie tla wczytujemy z dysku, ale TYLKO z public/uploads i tylko po
 * nazwie pliku. Parametr z adresu nigdy nie trafia do sciezki wprost -
 * inaczej "?foto=../../.env.local" czytaloby cudze pliki.
 */
async function photoDataUri(param: string | null): Promise<string | null> {
  if (!param) return null;
  const name = path.basename(param);
  if (!/^[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/i.test(name)) return null;
  try {
    const bytes = await fs.readFile(
      path.join(process.cwd(), "public", "uploads", name),
    );
    const mime = /\.png$/i.test(name)
      ? "image/png"
      : /\.webp$/i.test(name)
        ? "image/webp"
        : "image/jpeg";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Herb wklejamy jako dane, nie jako adres. Next blokuje pobieranie obrazow
 * z localhost (ochrona przed SSRF), a poza tym generator nie powinien
 * zalezec od tego, czy wlasny serwer akurat odpowiada.
 */
let crestCache: string | null = null;

async function crestDataUri(): Promise<string | null> {
  if (crestCache) return crestCache;
  try {
    const dir = path.join(process.cwd(), "public", "herb");
    const files = await fs.readdir(dir);
    // Wersja z przezroczystym tlem ma pierwszenstwo - bez niej herb
    // wychodzi bialym kwadratem na ciemnym tle grafiki.
    const file =
      files.find((n) => n.includes("alpha")) ??
      files.find((n) => /\.(png|jpe?g)$/i.test(n));
    if (!file) return null;
    const bytes = await fs.readFile(path.join(dir, file));
    const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
    crestCache = `data:${mime};base64,${bytes.toString("base64")}`;
    return crestCache;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const kind = params.get("typ") ?? "wynik";
  const league = (params.get("liga") ?? "otwock") as LeagueKey;
  const summary = leagueSummary(league);
  const crest = await crestDataUri();

  /*
    Okladka na post rzadzi sie innymi prawami niz pozostale grafiki: zamiast
    wspolnego naglowka i stopki ma zdjecie na calym kadrze, rozstrzygniecie
    u gory i pasek z wynikiem u dolu. Dlatego konczy tu wlasna odpowiedzia.
  */
  if (kind === "okladka") {
    // Bez parametru bierzemy ostatni rozegrany - z parametrem konkretny mecz.
    const wanted = params.get("mecz");
    const fixture = wanted
      ? (summary.recent.find((f) => f.sourceId === wanted) ?? summary.lastMatch)
      : summary.lastMatch;
    if (!fixture) {
      return new Response("Brak rozegranego meczu w tej lidze", { status: 404 });
    }

    const photo = await photoDataUri(params.get("foto"));
    const home = atHome(fixture);
    const ourGoals = home ? fixture.homeGoals : fixture.awayGoals;
    const theirGoals = home ? fixture.awayGoals : fixture.homeGoals;
    const verdict =
      outcome(fixture) === "W"
        ? "WYGRANA"
        : outcome(fixture) === "P"
          ? "PORAŻKA"
          : "REMIS";
    const opponent = opponentOf(fixture);
    /*
      Strzelcy DOKLADNIE tego meczu, nigdy dorobek sezonowy.
      Kolejnosc zrodel:
        1. to, co wpisales w panelu dla tego meczu,
        2. roznica miedzy migawkami sprzed i po meczu - patrz scorers.ts,
        3. strzelcy ze zrodla - ma ich tylko Jozefow i tylko przez
           tydzien po kolejce,
        4. nic - wtedy sekcja sie nie pokazuje.
    */
    const manual = splitScorers(getMatchScorers(league, fixture.sourceId));
    const fromDiff = scorersFromDiff(league, fixture, summary.recent) ?? [];
    const fromSource = (home ? fixture.homeScorers : fixture.awayScorers).map(
      (s) => (s.goals > 1 ? `${s.name} ${s.goals}G` : `${s.name} 1G`),
    );
    const scorers =
      manual.length > 0 ? manual : fromDiff.length > 0 ? fromDiff : fromSource;
    const scorersCaption = "STRZELCY";

    const charsetCover = charsetFor(
      verdict,
      opponent,
      scorersCaption,
      ...scorers,
    );
    const [sh, ar] = await Promise.all([
      fontData("Big Shoulders", 800, charsetCover),
      fontData("Archivo", 500, charsetCover),
    ]);

    return new ImageResponse(
      (
        <div
          style={{
            width: SIZE,
            height: SIZE,
            display: "flex",
            position: "relative",
            background: COAL,
            fontFamily: "Archivo",
          }}
        >
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              width={SIZE}
              height={SIZE}
              alt=""
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: SIZE,
                height: SIZE,
                objectFit: "cover",
              }}
            />
          )}

          {/*
            Dwa bloki rozepchniete do gory i dolu kadru, oba wysrodkowane
            w poziomie. Miedzy nimi zostaje czyste zdjecie. Zadnych paskow
            ani przyciemnien - czytelnosc daje cien tekstu.
          */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              width: SIZE,
              height: SIZE,
              padding: 72,
              textAlign: "center",
            }}
          >
            {/* Gora: rozstrzygniecie */}
            <div
              style={{
                display: "flex",
                fontFamily: "Shoulders",
                fontSize: 132,
                color: verdict === "WYGRANA" ? GOLD : "#ffffff",
                lineHeight: 1,
                textShadow: "0 6px 30px rgba(0,0,0,0.95)",
              }}
            >
              {verdict}
            </div>

            {/* Dol: wynik, przeciwnik, strzelcy */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontFamily: "Shoulders",
                  fontSize: 216,
                  color: "#ffffff",
                  lineHeight: 1,
                  textShadow: "0 6px 30px rgba(0,0,0,0.95)",
                }}
              >
                {`${ourGoals}:${theirGoals}`}
              </div>

              <div
                style={{
                  display: "flex",
                  fontFamily: "Shoulders",
                  fontSize: 68,
                  color: "#ffffff",
                  lineHeight: 1.05,
                  marginTop: 8,
                  textShadow: "0 4px 22px rgba(0,0,0,0.95)",
                }}
              >
                {opponent.toUpperCase()}
              </div>

              {scorers.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    marginTop: 22,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontSize: 20,
                      letterSpacing: 3,
                      color: "#ffffff",
                      opacity: 0.75,
                      textShadow: "0 2px 12px rgba(0,0,0,0.95)",
                    }}
                  >
                    {scorersCaption}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "center",
                      marginTop: 8,
                      maxWidth: 900,
                    }}
                  >
                    {scorers.map((scorer, index) => (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          fontSize: 28,
                          color: GOLD,
                          padding: "1px 12px",
                          textShadow: "0 3px 16px rgba(0,0,0,0.95)",
                        }}
                      >
                        {scorer}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ),
      {
        width: SIZE,
        height: SIZE,
        fonts: [
          { name: "Shoulders", data: sh, weight: 800, style: "normal" },
          { name: "Archivo", data: ar, weight: 500, style: "normal" },
        ],
      },
    );
  }

  let content: React.ReactElement;
  let texts: string[] = [];

  if (kind === "tabela") {
    const rows = summary.ourGroup.slice(0, 10);
    texts = [LEAGUE_NAMES[league], ...rows.map((r) => r.teamName)];
    content = (
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        {rows.map((row) => (
          <div
            key={row.teamName}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 24px",
              background: row.isOurs ? GOLD : "transparent",
              color: row.isOurs ? COAL : "#fff",
              borderBottom: "2px solid #262626",
            }}
          >
            <div style={{ display: "flex", width: 60, fontSize: 40, fontFamily: "Shoulders" }}>
              {row.position}
            </div>
            <div style={{ display: "flex", flex: 1, fontSize: 36, fontFamily: "Shoulders" }}>
              {row.teamName}
            </div>
            {/* Jeden napis, nie trzy dzieci - Satori wymagaloby wtedy
                jawnego display:flex na tym elemencie. */}
            <div style={{ display: "flex", width: 90, fontSize: 30, textAlign: "right" }}>
              {`${row.goalsFor}:${row.goalsAgainst}`}
            </div>
            <div
              style={{ display: "flex",
                width: 90,
                fontSize: 44,
                textAlign: "right",
                fontFamily: "Shoulders",
              }}
            >
              {row.points}
            </div>
          </div>
        ))}
      </div>
    );
  } else if (kind === "zawodnik") {
    const name = params.get("zawodnik") ?? "";
    const player =
      summary.ourPlayers.find((p) => p.name === name) ?? summary.ourPlayers[0];
    texts = [player?.name ?? "", "gole", "asysty", "mecze"];
    content = player ? (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div
          style={{ display: "flex",
            fontFamily: "Shoulders",
            fontSize: 96,
            color: "#fff",
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          {player.name.toUpperCase()}
        </div>
        <div style={{ display: "flex", marginTop: 70, gap: 60 }}>
          {[
            { value: player.goals, label: "gole" },
            { value: player.assists ?? 0, label: "asysty" },
            { value: player.appearances ?? 0, label: "mecze" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{ display: "flex", fontFamily: "Shoulders", fontSize: 150, color: GOLD }}
              >
                {stat.value}
              </div>
              <div style={{ display: "flex", fontSize: 30, color: "#8d8d8d" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div style={{ display: "flex", fontSize: 40, color: "#fff" }}>Brak danych zawodnika</div>
    );
  } else {
    const fixture = summary.lastMatch;
    if (!fixture) {
      return new Response("Brak rozegranego meczu w tej lidze", { status: 404 });
    }
    const home = atHome(fixture);
    const ourGoals = home ? fixture.homeGoals : fixture.awayGoals;
    const theirGoals = home ? fixture.awayGoals : fixture.homeGoals;
    const scorers = home ? fixture.homeScorers : fixture.awayScorers;
    texts = [
      opponentOf(fixture),
      ...scorers.map((s) => s.name),
      "FC PO NALEWCE",
    ];

    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <div
            style={{ display: "flex",
              fontFamily: "Shoulders",
              fontSize: 220,
              color: GOLD,
              lineHeight: 1,
            }}
          >
            {ourGoals}
          </div>
          <div style={{ display: "flex", fontSize: 120, color: "#8d8d8d" }}>:</div>
          <div
            style={{ display: "flex",
              fontFamily: "Shoulders",
              fontSize: 220,
              color: "#fff",
              lineHeight: 1,
            }}
          >
            {theirGoals}
          </div>
        </div>

        <div
          style={{ display: "flex",
            fontFamily: "Shoulders",
            fontSize: 64,
            color: "#fff",
            marginTop: 20,
            textAlign: "center",
          }}
        >
          {opponentOf(fixture).toUpperCase()}
        </div>

        <div style={{ display: "flex", fontSize: 30, color: "#8d8d8d", marginTop: 16 }}>
          {home ? "u siebie" : "wyjazd"}
        </div>

        {scorers.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              marginTop: 50,
              maxWidth: 820,
            }}
          >
            {scorers.map((scorer, index) => (
              <div
                key={index}
                style={{ display: "flex",
                  fontSize: 34,
                  color: GOLD,
                  padding: "6px 18px",
                }}
              >
                {scorer.goals > 1
                  ? `${scorer.name} ×${scorer.goals}`
                  : scorer.name}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const charset = charsetFor(...texts, LEAGUE_NAMES[league], "FC PO NALEWCE");
  const [shoulders, archivo] = await Promise.all([
    fontData("Big Shoulders", 800, charset),
    fontData("Archivo", 500, charset),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: SIZE,
          height: SIZE,
          display: "flex",
          flexDirection: "column",
          background: COAL,
          fontFamily: "Archivo",
          padding: 60,
        }}
      >
        {/* naglowek: herb + nazwa ligi */}
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {crest && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={crest} width={110} height={110} alt="" />
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: "Shoulders", fontSize: 54, color: "#fff" }}>
              FC PO NALEWCE
            </div>
            <div style={{ display: "flex", fontSize: 26, color: GOLD }}>
              {LEAGUE_NAMES[league]}
            </div>
          </div>
        </div>

        {/* tresc */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
          }}
        >
          {content}
        </div>

        {/* zlota stopka */}
        <div
          style={{
            display: "flex",
            height: 14,
            background: GOLD,
            width: "100%",
          }}
        />
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      fonts: [
        { name: "Shoulders", data: shoulders, weight: 800, style: "normal" },
        { name: "Archivo", data: archivo, weight: 500, style: "normal" },
      ],
    },
  );
}
