"use server";

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPassword, isLoggedIn, logIn, logOut } from "../../lib/auth.ts";
import {
  addInsta,
  createPost,
  deleteInsta,
  deletePost,
  setMatchScorers,
} from "../../lib/content.ts";
import { recordRun, saveSnapshot } from "../../lib/db.ts";
import { fetchOtwock } from "../../lib/sources/olsp.ts";
import { fetchJozefow } from "../../lib/sources/jlsp.ts";
import { recordScorersForNewMatches } from "../../lib/scorers.ts";

export type ActionResult = { ok: boolean; message: string };

/** Kazda akcja zmieniajaca dane przechodzi przez te bramke. */
async function requireAdmin(): Promise<void> {
  if (!(await isLoggedIn())) throw new Error("Brak dostępu");
}

export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    return { ok: false, message: "Nieprawidłowe hasło." };
  }
  await logIn();
  revalidatePath("/panel");
  return { ok: true, message: "Zalogowano." };
}

export async function logoutAction(): Promise<void> {
  await logOut();
  revalidatePath("/panel");
}

const UPLOADS = path.join(process.cwd(), "public", "uploads");
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

async function saveUpload(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (!ALLOWED.has(file.type)) {
    throw new Error("Dozwolone formaty zdjęć: JPG, PNG, WEBP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Zdjęcie jest większe niż 8 MB.");
  }
  await fs.mkdir(UPLOADS, { recursive: true });
  // Nazwa z losowego identyfikatora - nigdy z nazwy przeslanego pliku,
  // zeby nie wpuscic sciezki w stylu "../../".
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const name = `${randomUUID()}.${ext}`;
  await fs.writeFile(
    path.join(UPLOADS, name),
    Buffer.from(await file.arrayBuffer()),
  );
  return `/uploads/${name}`;
}

/**
 * Zdjecie tla pod okladke posta. Zapisujemy je tak samo jak zdjecia do
 * postow, a potem przekazujemy generatorowi SAMA NAZWE pliku - nigdy
 * sciezki z formularza.
 */
export async function uploadCoverAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  let saved: string | null;
  try {
    saved = await saveUpload(formData.get("photo") as File | null);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Nie udało się wgrać.",
    };
  }
  if (!saved) return { ok: false, message: "Wybierz zdjęcie." };

  /*
    Lista meczow jest wspolna dla obu lig, wiec wybrana pozycja niesie jedno
    i drugie: "otwock|olsp-1282". Dzieki temu nie trzeba dwoch zaleznych list.
  */
  const [league = "otwock", sourceId = ""] = String(formData.get("mecz") ?? "")
    .split("|");

  // Recznie wpisani strzelcy maja pierwszenstwo nad wyliczeniem z migawek.
  if (sourceId) {
    setMatchScorers(
      league === "jozefow" ? "jozefow" : "otwock",
      sourceId,
      String(formData.get("strzelcy") ?? ""),
    );
  }

  // Poza blokiem try - redirect dziala przez wyjatek, ktory musi przejsc dalej.
  const query = new URLSearchParams({
    foto: path.basename(saved),
    liga: league === "jozefow" ? "jozefow" : "otwock",
  });
  if (sourceId) query.set("mecz", sourceId);
  redirect(`/panel/grafiki?${query}`);
}

export async function createPostAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  if (title === "") return { ok: false, message: "Tytuł jest wymagany." };

  try {
    const coverPath = await saveUpload(formData.get("cover") as File | null);
    createPost({
      title,
      lead: String(formData.get("lead") ?? "").trim(),
      body: String(formData.get("body") ?? "").trim(),
      coverPath,
      coverAuthor: String(formData.get("coverAuthor") ?? "").trim() || null,
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Nie udało się zapisać.",
    };
  }

  revalidatePath("/");
  revalidatePath("/panel");
  return { ok: true, message: "Post opublikowany." };
}

export async function deletePostAction(formData: FormData): Promise<void> {
  await requireAdmin();
  deletePost(Number(formData.get("id")));
  revalidatePath("/");
  revalidatePath("/panel");
}

export async function addInstaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const url = String(formData.get("url") ?? "");
  if (!addInsta(url)) {
    return {
      ok: false,
      message: "To nie wygląda na adres posta z Instagrama (/p/, /reel/ lub /tv/).",
    };
  }
  revalidatePath("/");
  revalidatePath("/panel");
  return { ok: true, message: "Dodano." };
}

export async function deleteInstaAction(formData: FormData): Promise<void> {
  await requireAdmin();
  deleteInsta(Number(formData.get("id")));
  revalidatePath("/");
  revalidatePath("/panel");
}

export async function syncAction(): Promise<ActionResult> {
  await requireAdmin();
  const results: string[] = [];

  for (const [league, fetcher] of [
    ["otwock", fetchOtwock],
    ["jozefow", fetchJozefow],
  ] as const) {
    const startedAt = new Date().toISOString();
    try {
      const snapshot = await fetcher();
      saveSnapshot(snapshot);
      const newScorers = recordScorersForNewMatches(league);
      recordRun({
        league,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: "ok",
        error: null,
      });
      results.push(
        `${league}: ${snapshot.table.length} drużyn` +
          (newScorers.length > 0
            ? `, strzelcy zapisani dla ${newScorers.length} meczów`
            : ""),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordRun({
        league,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        status: "blad",
        error: message,
      });
      results.push(`${league}: BŁĄD — ${message}`);
    }
  }

  revalidatePath("/");
  revalidatePath("/panel");
  return { ok: true, message: results.join(" · ") };
}
