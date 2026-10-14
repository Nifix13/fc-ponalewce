/**
 * Robi z herbu wersje z przezroczystym tlem.
 *
 * Plik od klubu ma biale tlo, nie kanal alfa. Na stronie radzi sobie z tym
 * CSS (mix-blend-mode), ale generator grafik tego nie potrafi - Satori nie
 * zna trybow mieszania - i herb wychodzil bialym kwadratem na czarnym tle.
 *
 * Uruchomienie: npm run herb
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "public", "herb");
const OUT = path.join(DIR, "herb-alpha.png");

/** Powyzej tej jasnosci piksel uznajemy za tlo. */
const WHITE = 244;
/** Ponizej - zostawiamy nietkniety. Pomiedzy wygaszamy plynnie, zeby
 *  krawedzie nie byly postrzepione. */
const SOLID = 215;

const files = await fs.readdir(DIR);
const source = files.find((n) => /\.(png|jpe?g)$/i.test(n) && !n.includes("alpha"));
if (!source) {
  console.error("Nie znalazlem herbu w public/herb/");
  process.exit(1);
}

const input = sharp(path.join(DIR, source)).ensureAlpha();
const { width, height } = await input.metadata();
const { data } = await input.raw().toBuffer({ resolveWithObject: true });

let cleared = 0;
for (let i = 0; i < data.length; i += 4) {
  const min = Math.min(data[i], data[i + 1], data[i + 2]);
  if (min >= WHITE) {
    data[i + 3] = 0;
    cleared += 1;
  } else if (min > SOLID) {
    // Pas przejsciowy: im jasniejszy piksel, tym bardziej przezroczysty.
    data[i + 3] = Math.round((255 * (WHITE - min)) / (WHITE - SOLID));
  }
}

await sharp(data, { raw: { width: width!, height: height!, channels: 4 } })
  .trim()
  .png({ compressionLevel: 9 })
  .toFile(OUT);

const after = await fs.stat(OUT);
console.log(
  `${source} -> herb-alpha.png | przezroczystych pikseli: ` +
    `${Math.round((100 * cleared) / (width! * height!))}% | ` +
    `${Math.round(after.size / 1024)} kB`,
);
