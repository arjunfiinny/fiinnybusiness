import HomeClient from "./home-client";
import ProductLinkNav from "./components/seo/product-link-nav";

// The home page and every /?view=… screen are the client-rendered app in
// home-client.tsx (moved there from this file unchanged). This server wrapper
// exists only to put crawlable category and product links into the server
// HTML next to it (see ProductLinkNav).
export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      <HomeClient />
      <ProductLinkNav />
    </>
  );
}
