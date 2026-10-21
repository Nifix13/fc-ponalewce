/**
 * Stan widgetu „na żywo” dla przeglądarki.
 *
 * Trasy API w tej wersji Nexta nie są buforowane, więc każde zapytanie
 * zwraca świeży stan - widget odpytuje co kilkanaście sekund.
 */

import { currentLiveView } from "../../../lib/live-source.ts";

export async function GET(): Promise<Response> {
  const view = currentLiveView();
  return Response.json(view ?? { phase: "none" }, {
    headers: { "cache-control": "no-store" },
  });
}
