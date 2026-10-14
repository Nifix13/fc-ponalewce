/**
 * Logowanie do panelu: jeden administrator, haslo w .env.local.
 *
 * Swiadomie bez biblioteki uwierzytelniania - jeden uzytkownik, jedno haslo,
 * zero kont do zakladania. Ciasteczko sesji jest PODPISANE sekretem, wiec nie
 * da sie go podrobic po stronie przegladarki.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "fcpn_admin";

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "Brak SESSION_SECRET w .env.local (minimum 16 znakow). " +
        "Panel nie wystartuje bez niego.",
    );
  }
  return value;
}

/** Porownanie odporne na mierzenie czasu odpowiedzi. */
function sameString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return sameString(input, expected);
}

function token(): string {
  return createHmac("sha256", secret()).update("admin").digest("hex");
}

export async function logIn(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, token(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function logOut(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function isLoggedIn(): Promise<boolean> {
  try {
    const store = await cookies();
    const value = store.get(COOKIE)?.value;
    return Boolean(value) && sameString(value!, token());
  } catch {
    return false;
  }
}
