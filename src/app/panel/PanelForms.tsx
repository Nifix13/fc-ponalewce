"use client";

import { useActionState, useState } from "react";
import {
  addInstaAction,
  createPostAction,
  loginAction,
  syncAction,
  uploadCoverAction,
  type ActionResult,
} from "./actions.ts";

const field =
  "w-full border-2 border-coal-line bg-coal px-3 py-2 text-white " +
  "focus:border-gold focus:outline-none";
const label = "block text-xs font-semibold tracking-[0.15em] text-smoke uppercase";
const button =
  "display bg-gold px-6 py-3 text-xl text-coal transition-colors hover:bg-white " +
  "disabled:opacity-50";

function Note({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p className={`mt-3 text-sm ${result.ok ? "text-neon" : "text-red-400"}`}>
      {result.message}
    </p>
  );
}

export function LoginForm() {
  const [result, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="mx-auto max-w-sm">
      <label className={label} htmlFor="password">
        Hasło
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        className={`${field} mt-2`}
        required
      />
      <button type="submit" className={`${button} mt-4 w-full`} disabled={pending}>
        {pending ? "Sprawdzam…" : "Wejdź"}
      </button>
      <Note result={result} />
    </form>
  );
}

export function PostForm() {
  const [result, action, pending] = useActionState(createPostAction, null);
  return (
    <form action={action} className="grid gap-4">
      <div>
        <label className={label} htmlFor="title">
          Tytuł
        </label>
        <input id="title" name="title" className={`${field} mt-2`} required />
      </div>
      <div>
        <label className={label} htmlFor="lead">
          Zajawka
        </label>
        <input
          id="lead"
          name="lead"
          className={`${field} mt-2`}
          placeholder="Jedno zdanie, które zobaczy ktoś na stronie głównej"
        />
      </div>
      <div>
        <label className={label} htmlFor="body">
          Treść
        </label>
        <textarea id="body" name="body" rows={7} className={`${field} mt-2`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="cover">
            Zdjęcie
          </label>
          <input
            id="cover"
            name="cover"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={`${field} mt-2 file:mr-3 file:border-0 file:bg-coal-line file:px-3 file:py-1 file:text-white`}
          />
        </div>
        <div>
          <label className={label} htmlFor="coverAuthor">
            Autor zdjęcia
          </label>
          <input
            id="coverAuthor"
            name="coverAuthor"
            className={`${field} mt-2`}
            placeholder="np. Jan Kowalski / OLSP"
          />
        </div>
      </div>
      <button type="submit" className={`${button} justify-self-start`} disabled={pending}>
        {pending ? "Zapisuję…" : "Opublikuj"}
      </button>
      <Note result={result} />
    </form>
  );
}

export function InstaForm() {
  const [result, action, pending] = useActionState(addInstaAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-72">
        <label className={label} htmlFor="url">
          Adres posta z Instagrama
        </label>
        <input
          id="url"
          name="url"
          className={`${field} mt-2`}
          placeholder="https://www.instagram.com/p/XXXXXXXXXXX/"
          required
        />
      </div>
      <button type="submit" className={button} disabled={pending}>
        {pending ? "Dodaję…" : "Dodaj"}
      </button>
      <div className="w-full">
        <Note result={result} />
      </div>
    </form>
  );
}

export type MatchOption = { value: string; label: string };

export function CoverForm({
  matches,
  selected,
  scorers,
}: {
  matches: MatchOption[];
  selected: string;
  scorers: string;
}) {
  const [result, action, pending] = useActionState(uploadCoverAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1 basis-80">
        <label className={label} htmlFor="mecz">
          Mecz
        </label>
        <select
          id="mecz"
          name="mecz"
          defaultValue={selected}
          className={`${field} mt-2`}
        >
          {matches.map((match) => (
            <option key={match.value} value={match.value}>
              {match.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0 flex-1 basis-64">
        <label className={label} htmlFor="photo">
          Zdjęcie w tle
        </label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className={`${field} mt-2 file:mr-3 file:border-0 file:bg-coal-line file:px-3 file:py-1 file:text-white`}
        />
      </div>
      <div className="w-full">
        <label className={label} htmlFor="strzelcy">
          Strzelcy meczu (opcjonalnie)
        </label>
        <input
          id="strzelcy"
          name="strzelcy"
          defaultValue={scorers}
          className={`${field} mt-2`}
          placeholder="Nowak 2G / 1A, Kot 1G — zostawi puste, jeśli system wyliczy sam"
        />
      </div>
      <button type="submit" className={button} disabled={pending}>
        {pending ? "Składam…" : "Zrób okładkę"}
      </button>
      <div className="w-full">
        <Note result={result} />
      </div>
    </form>
  );
}

export function SyncButton() {
  const [state, setState] = useState<{ pending: boolean; message: string | null }>({
    pending: false,
    message: null,
  });

  return (
    <div>
      <button
        type="button"
        className={button}
        disabled={state.pending}
        onClick={async () => {
          setState({ pending: true, message: null });
          const result = await syncAction();
          setState({ pending: false, message: result.message });
        }}
      >
        {state.pending ? "Pobieram…" : "Pobierz dane lig"}
      </button>
      {state.message && <p className="mt-3 text-sm text-smoke">{state.message}</p>}
    </div>
  );
}
