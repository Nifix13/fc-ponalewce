import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost } from "../../../lib/content.ts";

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <Link href="/" className="text-sm text-gold underline-offset-4 hover:underline">
        ← Strona główna
      </Link>

      <h1 className="display mt-6 text-5xl sm:text-6xl">{post.title}</h1>
      <p className="mt-3 text-sm text-smoke">
        {new Date(post.publishedAt).toLocaleDateString("pl-PL", {
          dateStyle: "long",
        })}
      </p>

      {post.lead && <p className="mt-6 text-xl text-gold">{post.lead}</p>}

      {post.coverPath && (
        <figure className="mt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.coverPath} alt="" className="w-full" />
          {post.coverAuthor && (
            <figcaption className="mt-2 text-xs text-smoke">
              fot. {post.coverAuthor}
            </figcaption>
          )}
        </figure>
      )}

      {post.body && (
        <div className="mt-8 grid gap-4 text-lg leading-relaxed">
          {post.body.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}
    </main>
  );
}
