import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedPosts } from "../lib/seo/blog-server";

// Incremental Static Regeneration — cached at the edge, refreshed hourly.
export const revalidate = 3600;

// This page defined no metadata, so it inherited the root layout's canonical and
// declared the homepage as its original — while the sitemap submitted /blog.
// Google honours the tag over the sitemap, which is how a submitted URL ends up
// reported as "Alternative page with proper canonical tag" and never indexed.
export const metadata: Metadata = {
  alternates: { canonical: "/blog" },
};

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

function formatDate(ts: unknown): string {
  try {
    const d = (ts as any)?.toDate?.() ?? new Date(ts as string);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  } catch { return ""; }
}

// Tags are mostly Marathi/Hindi keyword phrases. The old chip style
// (10px, uppercase, tracking-widest) was meant for short English labels: letter
// spacing breaks Devanagari conjuncts apart and the text became unreadable.
function TagChip({ tag }: { tag: string }) {
  return (
    <span className="inline-block max-w-full truncate rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold border border-primary/20">
      {tag}
    </span>
  );
}

// Most covers are Unsplash URLs saved at w=600; the featured card stretched
// them to ~1150px wide and they rendered blurry. Ask Unsplash for the width we
// actually draw. Any other host is returned untouched.
function coverAt(url: string, width: number): string {
  try {
    const u = new URL(url);
    if (u.hostname !== "images.unsplash.com") return url;
    u.searchParams.set("w", String(width));
    return u.toString();
  } catch {
    return url;
  }
}

export default async function BlogListPage() {
  const posts = await getPublishedPosts();
  const [featured, ...rest] = posts;

  // ── JSON-LD: Blog with a list of posts ──
  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "KrishiDukan Blog",
    url: `${SITE_URL}/blog`,
    description:
      "Expert farming advice, agri-retail insights, and crop guides — written for Indian farmers and agricultural businesses.",
    blogPost: posts.slice(0, 20).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      ...(p.excerpt ? { description: p.excerpt } : {}),
      ...(p.coverImage ? { image: p.coverImage } : {}),
    })),
  };

  return (
    <div className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogLd) }}
      />

      {/* Header — the site header above already links home, so no back link. */}
      <div className="bg-[#0d2b09] py-10 md:py-14 px-4 text-center">
        <h1 className="text-3xl md:text-5xl font-black text-white mb-3">
          Krishi<span className="text-[#f4a500]">Dukan</span> Blog
        </h1>
        <p className="text-white/70 max-w-xl mx-auto text-sm md:text-base">
          Expert farming advice, agri-retail insights, and crop guides — written for Indian farmers and agricultural businesses.
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10 md:py-12">
        {posts.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">
            <p className="text-xl font-bold">No posts yet</p>
            <p className="text-sm mt-2">Check back soon for farming tips and agri insights.</p>
          </div>
        ) : (
          <>
            {/* Featured (latest) post — image beside the text on desktop, so the
                cover is never stretched into a blurry full-width banner. */}
            {featured && (
              <Link href={`/blog/${featured.slug}`} className="block mb-10 group">
                <div className="grid md:grid-cols-2 rounded-3xl overflow-hidden border border-surface-container bg-white shadow-ambient hover:shadow-xl transition-shadow">
                  {featured.coverImage ? (
                    <div className="aspect-video md:aspect-auto md:min-h-[320px] overflow-hidden bg-surface-container-low">
                      <img
                        src={coverAt(featured.coverImage, 1200)}
                        alt={featured.title}
                        fetchPriority="high"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video md:aspect-auto bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                      <span className="text-5xl">🌿</span>
                    </div>
                  )}
                  <div className="p-6 md:p-8 flex flex-col justify-center min-w-0">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white bg-primary rounded-full px-2.5 py-0.5">
                        Latest
                      </span>
                      {(featured.tags || []).slice(0, 2).map(t => <TagChip key={t} tag={t} />)}
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black text-on-surface mb-3 group-hover:text-primary transition-colors leading-snug">
                      {featured.title}
                    </h2>
                    <p className="text-on-surface-variant text-base mb-4 line-clamp-3">{featured.excerpt}</p>
                    <div className="flex items-center gap-2 text-xs text-on-surface-variant font-semibold flex-wrap">
                      {featured.author && <><span>{featured.author}</span><span>·</span></>}
                      <span>{formatDate(featured.publishedAt)}</span>
                      {featured.readTime && <><span>·</span><span>{featured.readTime} min read</span></>}
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Rest of posts */}
            {rest.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {rest.map((post) => (
                  <Link key={post.id} href={`/blog/${post.slug}`} className="group flex flex-col rounded-2xl border border-surface-container bg-white shadow-ambient hover:shadow-lg transition-shadow overflow-hidden">
                    {post.coverImage ? (
                      <div className="aspect-video overflow-hidden bg-surface-container-low">
                        <img
                          loading="lazy"
                          decoding="async"
                          src={coverAt(post.coverImage, 800)}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                        <span className="text-4xl">🌿</span>
                      </div>
                    )}
                    <div className="p-5 flex flex-col flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {(post.tags || []).slice(0, 2).map(t => <TagChip key={t} tag={t} />)}
                      </div>
                      <h3 className="font-black text-on-surface text-lg leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
                        {post.title}
                      </h3>
                      <p className="text-sm text-on-surface-variant line-clamp-2 mb-4">{post.excerpt}</p>
                      <div className="mt-auto flex items-center gap-2 text-xs text-on-surface-variant font-semibold">
                        <span>{formatDate(post.publishedAt)}</span>
                        {post.readTime && <><span>·</span><span>{post.readTime} min read</span></>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {/* No footer here — app/blog/layout.tsx renders <SiteFooter />, which
          already carries the copyright line; this page used to print it twice. */}
    </div>
  );
}
