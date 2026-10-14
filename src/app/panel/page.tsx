import Link from "next/link";
import { isLoggedIn } from "../../lib/auth.ts";
import { listInsta, listPosts } from "../../lib/content.ts";
import { recentRuns } from "../../lib/db.ts";
import { deleteInstaAction, deletePostAction, logoutAction } from "./actions.ts";
import { InstaForm, LoginForm, PostForm, SyncButton } from "./PanelForms.tsx";

/*
  Panel czyta ciasteczko sesji, wiec nie da sie go przygotowac z
  wyprzedzeniem. Mowimy to Nextowi wprost, zamiast dostawac
  ostrzezenie o zablokowanym prerenderowaniu przy kazdym wejsciu.
*/
export const instant = false;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t-2 border-coal-line pt-8">
      <h2 className="display mb-5 text-3xl">{title}</h2>
      {children}
    </section>
  );
}

export default async function Panel() {
  if (!(await isLoggedIn())) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <h1 className="display mb-8 text-center text-5xl">Panel</h1>
        <LoginForm />
      </main>
    );
  }

  const posts = listPosts();
  const insta = listInsta(24);
  const runs = recentRuns(6);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <h1 className="display text-5xl">Panel</h1>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/" className="text-gold underline-offset-4 hover:underline">
            Zobacz stronę
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="text-smoke hover:text-white">
              Wyloguj
            </button>
          </form>
        </div>
      </header>

      <div className="grid gap-12">
        <Section title="Nowy post">
          <PostForm />
        </Section>

        <Section title={`Posty (${posts.length})`}>
          {posts.length === 0 ? (
            <p className="text-smoke">Jeszcze nic nie opublikowałeś.</p>
          ) : (
            <ul className="grid gap-2">
              {posts.map((post) => (
                <li
                  key={post.id}
                  className="flex items-center gap-4 border-b border-coal-line py-3"
                >
                  <span className="flex-1">
                    <Link
                      href={`/aktualnosci/${post.slug}`}
                      className="hover:text-gold"
                    >
                      {post.title}
                    </Link>
                    <span className="ml-3 text-xs text-smoke">
                      {new Date(post.publishedAt).toLocaleDateString("pl-PL")}
                    </span>
                  </span>
                  <form action={deletePostAction}>
                    <input type="hidden" name="id" value={post.id} />
                    <button
                      type="submit"
                      className="text-xs text-smoke hover:text-red-400"
                    >
                      Usuń
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Grafiki na Instagram">
          <p className="mb-5 max-w-prose text-sm text-smoke">
            Gotowe obrazy 1080×1080 składane z aktualnych danych. Klikasz, pobierasz,
            wrzucasz na Instagram.
          </p>
          <Link
            href="/panel/grafiki"
            className="display inline-block bg-gold px-6 py-3 text-xl text-coal transition-colors hover:bg-white"
          >
            Otwórz generator
          </Link>
        </Section>

        <Section title="Instagram na stronie">
          <p className="mb-5 max-w-prose text-sm text-smoke">
            Instagram nie udostępnia listy najnowszych postów bez konta firmowego i
            zgody Meta, więc wklejasz adresy tych, które mają się pokazać na dole
            strony. Wyświetlamy je oficjalnym podglądem Instagrama.
          </p>
          <InstaForm />
          {insta.length > 0 && (
            <ul className="mt-6 grid gap-2">
              {insta.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-4 border-b border-coal-line py-2"
                >
                  <span className="flex-1 truncate text-sm text-smoke">
                    {item.url}
                  </span>
                  <form action={deleteInstaAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      className="text-xs text-smoke hover:text-red-400"
                    >
                      Usuń
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Dane z lig">
          <SyncButton />
          {runs.length > 0 && (
            <ul className="mt-6 grid gap-1 text-sm">
              {runs.map((run, index) => (
                <li key={index} className="flex gap-4 text-smoke">
                  <span className="w-20">{run.league}</span>
                  <span
                    className={run.status === "ok" ? "text-neon" : "text-red-400"}
                  >
                    {run.status}
                  </span>
                  <span>
                    {new Date(run.started_at).toLocaleString("pl-PL", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  {run.error && <span className="text-red-400">{run.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}
