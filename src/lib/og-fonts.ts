/**
 * Fonty dla generatora grafik.
 *
 * Satori (silnik pod `next/og`) nie korzysta z fontow systemowych - trzeba mu
 * podac plik. Pobieramy go z Google Fonts z parametrem `text`, czyli tylko te
 * znaki, ktore faktycznie wystapia na grafice. Dwie korzysci: plik wazy
 * kilka kilobajtow zamiast setek, i mamy PEWNOSC, ze polskie znaki sa w
 * srodku - bez tego "Bocianówka" wyszloby z pustymi kwadratami.
 *
 * Naglowek User-Agent decyduje o formacie pliku, ktory odda Google:
 *   MSIE 6      -> font/eot   (Satori NIE czyta)
 *   Safari 5    -> font/woff
 *   Firefox 6   -> font/woff
 *   Android 2.3 -> font/ttf   <- tego chcemy
 * Sprawdzone zapytaniem do fonts.googleapis.com, nie zgadniete.
 */

const TTF_UA = "Mozilla/5.0 (Linux; U; Android 2.3)";

/** Magiczne bajty formatow, ktore Satori potrafi odczytac. */
function fontFormat(data: ArrayBuffer): string | null {
  const head = new Uint8Array(data.slice(0, 4));
  const tag = String.fromCharCode(...head);
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO") return "otf";
  if (head[0] === 0x00 && head[1] === 0x01 && head[2] === 0x00 && head[3] === 0x00)
    return "ttf";
  if (tag === "true" || tag === "ttcf") return "ttf";
  return null;
}

const cache = new Map<string, ArrayBuffer>();

export async function fontData(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer> {
  // Unikalne znaki wystarcza - powtorzenia tylko wydluzaja adres.
  const chars = [...new Set(text)].join("");
  const key = `${family}|${weight}|${chars}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}` +
    `:wght@${weight}&text=${encodeURIComponent(chars)}`;

  const css = await fetch(url, {
    headers: { "user-agent": TTF_UA },
  }).then((r) => r.text());

  const source = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
  if (!source) {
    throw new Error(
      `Google Fonts nie zwrócił pliku dla "${family}" ${weight}. ` +
        `Odpowiedź: ${css.slice(0, 200)}`,
    );
  }

  const data = await fetch(source, {
    headers: { "user-agent": TTF_UA },
  }).then((r) => r.arrayBuffer());

  const format = fontFormat(data);
  if (!format) {
    const head = [...new Uint8Array(data.slice(0, 4))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    throw new Error(
      `Font "${family}" przyszedł w formacie, którego Satori nie czyta ` +
        `(pierwsze bajty: ${head}). Potrzebny TTF, OTF albo WOFF.`,
    );
  }

  cache.set(key, data);
  return data;
}

/** Wszystkie znaki, ktore moga trafic na grafike - z polskimi literami. */
export function charsetFor(...texts: string[]): string {
  return (
    texts.join("") +
    "AĄBCĆDEĘFGHIJKLŁMNŃOÓPQRSŚTUVWXYZŹŻ" +
    "aąbcćdeęfghijklłmnńoópqrsśtuvwxyzźż" +
    "0123456789:.,–—·×%()/ "
  );
}
