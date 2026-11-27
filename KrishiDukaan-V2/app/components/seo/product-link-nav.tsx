import Link from "next/link";
import { buildProductSlug, getPopularProducts } from "../../lib/seo/products-server";
import { SEO_CATEGORIES } from "../../lib/seo/category-meta";

/**
 * Plain <a href> links to the category pages and the busiest product pages,
 * rendered on the server.
 *
 * The home page and /?view=market are a client-rendered app, and /catalog is a
 * printed brochure, so a crawler reading their HTML found no /products/ links
 * at all (0 links, 133 words on the home page, 26 Nov 2026). This nav sits
 * next to them in the server HTML. It is visually hidden (sr-only) because
 * those pages already show the same products and categories to people; it is
 * the same split the store and brand pages use for their product grids.
 *
 * Renders nothing extra when the product index is unavailable.
 */
export default async function ProductLinkNav({ max = 60 }: { max?: number }) {
  const products = await getPopularProducts(max);
  return (
    <nav aria-label="Browse KrishiDukan products" className="sr-only">
      <h2>Shop by category</h2>
      <ul>
        {SEO_CATEGORIES.map((c) => (
          <li key={c.slug}>
            <Link href={`/category/${c.slug}`}>{c.heading}</Link>
          </li>
        ))}
      </ul>
      {products.length > 0 ? (
        <>
          <h2>Popular products</h2>
          <ul>
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/products/${buildProductSlug(p.name, p.id)}`}>{p.name}</Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </nav>
  );
}
