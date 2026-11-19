import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Headphones,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Megaphone,
  PackageCheck,
  PlayCircle,
  Search,
  ShoppingBag,
  Smartphone,
  Sprout,
  Store,
  Truck,
  Users,
} from "lucide-react";
import { COMPANY, SITE_URL } from "../lib/legal-constants";
import { PLAY_STORE_URL } from "../lib/store-links";
import { CatalogPrintButton, CatalogShareButton } from "./_components/catalog-actions";
import "./catalog.css";

export const metadata: Metadata = {
  title: "KrishiDukan Catalog — For Farmers and Agri Businesses",
  description: "A shareable guide to KrishiDukan: discover farm inputs, compare nearby sellers and delivered prices, and grow an agri shop online.",
  alternates: { canonical: "/catalog" },
  openGraph: {
    type: "website",
    siteName: "KrishiDukan",
    url: `${SITE_URL}/catalog`,
    title: "KrishiDukan Catalog",
    description: "See how KrishiDukan connects farmers, local agri shops and brands.",
    images: ["/images/og-default.png"],
  },
};

const farmerFeatures = [
  { icon: Search, title: "Find what the crop needs", body: "Explore seeds, nutrients, crop protection and farming supplies in one place." },
  { icon: MapPin, title: "Compare nearby shops", body: "See sellers, product prices and store locations before choosing where to buy." },
  { icon: Truck, title: "Know the delivered cost", body: "Review item and delivery costs in your cart. Choose another seller when available." },
  { icon: PlayCircle, title: "See products in action", body: "Watch AgriReels and read product details before placing an order." },
];

const sellerFeatures = [
  { icon: Store, title: "A storefront to share", body: "Give farmers a link to your shop and its listed products." },
  { icon: PackageCheck, title: "Products and stock", body: "Manage listings, prices and inventory from your seller dashboard." },
  { icon: ShoppingBag, title: "Orders in one place", body: "Offer online ordering where enabled and manage incoming orders." },
  { icon: BarChart3, title: "See what is working", body: "Use activity and order views to understand customer interest." },
];

// These products are listed in the Karan Arjun store seed catalog. Prices and
// availability are intentionally left to the live marketplace.
const storeProducts = [
  { name: "Alika", category: "Crop protection", image: "/product-images/Product_Images/alika.jpg" },
  { name: "Amistar Top", category: "Fungicide", image: "/product-images/Product_Images/amistar-top.webp" },
  { name: "Biozyme", category: "Plant nutrition", image: "/product-images/Product_Images/Biozyme.jpg" },
  { name: "Nano Urea", category: "Fertilizer", image: "/product-images/Product_Images/Nano%20Urea.webp" },
];

function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="catalog-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/krishidukan icon.webp" alt="" className="catalog-brand-mark" />
      <span className={light ? "catalog-brand-name text-white" : "catalog-brand-name text-[#103c24]"}>
        Krishi<span className="text-[#d9a542]">Dukan</span>
      </span>
    </div>
  );
}

function PageFooter({ number, light = false }: { number: string; light?: boolean }) {
  return (
    <div className={`catalog-page-footer ${light ? "catalog-page-footer-light" : ""}`}>
      <span>KRISHIDUKAN · FOR FARMERS & AGRI BUSINESSES</span>
      <span>{number} / 08</span>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <main className="catalog-shell">
      <div className="catalog-toolbar">
        <Link href="/?view=about" className="catalog-toolbar-home">← About KrishiDukan</Link>
        <div className="catalog-toolbar-actions">
          <CatalogShareButton className="catalog-tool-button" />
          <CatalogPrintButton className="catalog-tool-button catalog-tool-button-primary" />
        </div>
      </div>

      <div className="catalog-pages">
        <article className="catalog-page catalog-cover" aria-labelledby="catalog-cover-title">
          <div className="catalog-cover-top"><Brand light /><span>THE KRISHIDUKAN GUIDE</span></div>
          <div className="catalog-cover-main">
            <div className="catalog-cover-copy">
              <p className="catalog-eyebrow catalog-eyebrow-light">For the people who grow and the shops that serve them</p>
              <h1 id="catalog-cover-title">Better farming starts with a better connection.</h1>
              <p className="catalog-cover-lead">Discover farm inputs, compare local sellers and bring your agri business online with KrishiDukan.</p>
              <div className="catalog-cover-chips"><span>For farmers</span><span>For retailers</span><span>For brands</span><span>Creators · coming soon</span></div>
            </div>
            <div className="catalog-cover-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/sell/hero-shopkeeper.webp" alt="Agri shopkeeper in a farm supply store" />
              <div className="catalog-photo-caption">From the local counter to every farmer&apos;s phone.</div>
            </div>
          </div>
          <div className="catalog-cover-bottom">
            <span>Explore the platform at <strong>krishidukan.com</strong></span>
            <span>किसान और कृषि व्यवसाय, एक साथ</span>
          </div>
          <PageFooter number="01" light />
        </article>

        <article className="catalog-page catalog-light" aria-labelledby="catalog-farmer-title">
          <div className="catalog-page-head"><Brand /><span className="catalog-page-tag">01 / FOR FARMERS</span></div>
          <div className="catalog-section-intro">
            <p className="catalog-eyebrow">Shop with more clarity</p>
            <h2 id="catalog-farmer-title">Find the right product. Know who sells it. Choose with confidence.</h2>
            <p>KrishiDukan brings local agri shopping into one clear journey, from discovery to delivery.</p>
          </div>
          <div className="catalog-farmer-visual">
            <div className="catalog-farmer-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/sell/farmer-searching.webp" alt="Farmer checking agricultural products on a phone" />
            </div>
            <div className="catalog-mini-screen" aria-label="Illustration of the KrishiDukan shopping journey">
              <div className="catalog-mini-screen-top">Krishi<span>Dukan</span><Search size={14} /></div>
              <div className="catalog-mini-screen-label">Find farm inputs</div>
              <div className="catalog-mini-screen-search">Search seeds, fertilizers, tools…</div>
              <div className="catalog-mini-screen-item"><span className="catalog-mini-seed">✦</span><div><strong>Compare sellers</strong><small>Price · Distance · Delivery</small></div></div>
              <div className="catalog-mini-screen-item"><span className="catalog-mini-seed">✓</span><div><strong>Choose your store</strong><small>Change it in your cart</small></div></div>
              <div className="catalog-mini-screen-cta">Continue to checkout →</div>
            </div>
          </div>
          <div className="catalog-feature-grid">
            {farmerFeatures.map(({ icon: Icon, title, body }) => (
              <div className="catalog-feature" key={title}><div className="catalog-feature-icon"><Icon size={22} /></div><h3>{title}</h3><p>{body}</p></div>
            ))}
          </div>
          <div className="catalog-note"><Headphones size={20} /><span>Need help while ordering? Call KrishiDukan directly at <strong>+91 86580 32751</strong>.</span></div>
          <PageFooter number="02" />
        </article>

        <article className="catalog-page catalog-marketplace" aria-labelledby="catalog-marketplace-title">
          <div className="catalog-page-head"><Brand /><span className="catalog-page-tag">02 / EXPLORE THE MARKETPLACE</span></div>
          <div className="catalog-section-intro">
            <p className="catalog-eyebrow">A clearer way to shop</p>
            <h2 id="catalog-marketplace-title">The agri marketplace, in your pocket.</h2>
            <p>Search across categories, see product information and find sellers from one simple screen.</p>
          </div>
          <figure className="catalog-marketplace-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/catalog/marketplace-preview.webp" alt="KrishiDukan mobile marketplace promotional preview with farm product cards" />
            <figcaption>App preview · product availability and prices vary by seller.</figcaption>
          </figure>
          <div className="catalog-journey-grid">
            <div><span>01</span><strong>Discover</strong><p>Browse seeds, fertilizers, crop protection and more.</p></div>
            <div><span>02</span><strong>Compare</strong><p>Look at seller prices, location and delivery before deciding.</p></div>
            <div><span>03</span><strong>Choose</strong><p>Select the store that works best for your order.</p></div>
          </div>
          <PageFooter number="03" />
        </article>

        <article className="catalog-page catalog-products" aria-labelledby="catalog-products-title">
          <div className="catalog-page-head"><Brand /><span className="catalog-page-tag">03 / PRODUCT SPOTLIGHT</span></div>
          <div className="catalog-section-intro">
            <p className="catalog-eyebrow">From Karan Arjun stores</p>
            <h2 id="catalog-products-title">Real products. A store farmers already know.</h2>
            <p>Power Plus is a Karan Arjun product. The store also lists familiar agri brands across crop care and nutrition.</p>
          </div>
          <div className="catalog-power-heading"><span>FEATURED PRODUCT</span><strong>Karan Arjun Power Plus™</strong><p>Available in different pack sizes for different farm needs.</p></div>
          <div className="catalog-power-grid">
            {[
              { size: "1 litre", image: "/images/karan-arjun/bottle-1l.webp" },
              { size: "3 litres", image: "/images/karan-arjun/bottle-3l.webp" },
              { size: "5 litres", image: "/images/karan-arjun/bottle-5l.webp" },
            ].map((product) => (
              <div className="catalog-power-card" key={product.size}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={product.image} alt={`Karan Arjun Power Plus ${product.size} pack`} />
                <strong>{product.size}</strong>
              </div>
            ))}
          </div>
          <div className="catalog-store-products-title"><span>MORE FROM KARAN ARJUN STORE LISTINGS</span><p>Examples from the store catalog</p></div>
          <div className="catalog-store-products">
            {storeProducts.map((product) => (
              <div className="catalog-store-product" key={product.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={product.image} alt={`${product.name} product pack`} />
                <strong>{product.name}</strong>
                <span>{product.category}</span>
              </div>
            ))}
          </div>
          <p className="catalog-product-note">Product photos are illustrative. See the marketplace for current listings, pack details, prices and availability.</p>
          <PageFooter number="04" />
        </article>

        <article className="catalog-page catalog-seller" aria-labelledby="catalog-seller-title">
          <div className="catalog-page-head"><Brand /><span className="catalog-page-tag">04 / FOR AGRI BUSINESSES</span></div>
          <div className="catalog-section-intro">
            <p className="catalog-eyebrow">Your shop, easier to discover</p>
            <h2 id="catalog-seller-title">Your local reputation deserves a digital storefront.</h2>
            <p>Give farmers an easy way to find your products and give your team the tools to manage the work behind every sale.</p>
          </div>
          <div className="catalog-seller-visual">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/sell/shop-on-devices.webp" alt="Illustration of a KrishiDukan seller storefront on phone and desktop" />
            <span>Illustrative seller storefront preview</span>
          </div>
          <div className="catalog-feature-grid catalog-seller-grid">
            {sellerFeatures.map(({ icon: Icon, title, body }) => (
              <div className="catalog-feature" key={title}><div className="catalog-feature-icon"><Icon size={22} /></div><h3>{title}</h3><p>{body}</p></div>
            ))}
          </div>
          <div className="catalog-seller-ribbon"><Store size={24} /><span>Retailers, manufacturers and agri input dealers can build a presence on KrishiDukan.</span></div>
          <PageFooter number="05" />
        </article>

        <article className="catalog-page catalog-experience" aria-labelledby="catalog-experience-title">
          <div className="catalog-page-head"><Brand /><span className="catalog-page-tag">05 / THE EXPERIENCE</span></div>
          <div className="catalog-section-intro">
            <p className="catalog-eyebrow">Made for every screen</p>
            <h2 id="catalog-experience-title">Show it on a phone. Explore it on the web.</h2>
            <p>Give customers a quick look at KrishiDukan in person, then send them a link they can revisit later.</p>
          </div>
          <div className="catalog-experience-grid">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/catalog/app-preview.webp" alt="KrishiDukan mobile app promotional preview on two phones" />
              <figcaption><strong>Mobile app</strong><span>Explore wherever you are</span></figcaption>
            </figure>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/catalog/web-preview.webp" alt="KrishiDukan website promotional preview on a laptop" />
              <figcaption><strong>Website</strong><span>Browse on a larger screen</span></figcaption>
            </figure>
          </div>
          <div className="catalog-welcome-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/catalog/welcome-preview.webp" alt="KrishiDukan welcome screen promotional preview" />
            <div><span>THE FIRST STEP IS SIMPLE</span><h3>Open the app. Find what your farm needs.</h3><p>Search for products, check nearby sellers and continue on the screen that feels comfortable.</p><a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">Explore the Android app <ArrowRight size={16} /></a></div>
          </div>
          <p className="catalog-preview-note">Promotional previews supplied by KrishiDukan.</p>
          <PageFooter number="06" />
        </article>

        <article className="catalog-page catalog-influencer" aria-labelledby="catalog-influencer-title">
          <div className="catalog-page-head"><Brand /><span className="catalog-page-tag">06 / INFLUENCER PROMOTIONS</span></div>
          <div className="catalog-section-intro catalog-influencer-intro">
            <p className="catalog-eyebrow"><Megaphone size={15} /> COMING SOON</p>
            <h2 id="catalog-influencer-title">Creators and agri brands, closer together.</h2>
            <p>A planned space for agri creators to be discovered by retailers and manufacturers, then discuss promotions in a private chat.</p>
          </div>
          <div className="catalog-influencer-preview">
            <div className="catalog-influencer-preview-top"><span>Promotions <ArrowRight size={13} /> Influencer Discovery</span><span>CONCEPT PREVIEW</span></div>
            <div className="catalog-influencer-search"><Search size={17} /><span>Find creators by region, language, niche or audience</span></div>
            <div className="catalog-influencer-filters"><span>Crop farming</span><span>Marathi</span><span>Maharashtra</span><span>YouTube</span></div>
            <div className="catalog-creator-cards">
              <div className="catalog-creator-card">
                <div className="catalog-creator-avatar"><Sprout size={31} /></div>
                <div className="catalog-creator-info"><strong>Crop farming creator</strong><span>Marathi · Maharashtra</span><p>Field insights, crop care and practical tips</p></div>
                <div className="catalog-creator-action"><small>Collaboration options</small><span><MessageCircle size={14} /> Private chat</span></div>
              </div>
              <div className="catalog-creator-card">
                <div className="catalog-creator-avatar catalog-creator-avatar-gold"><Users size={30} /></div>
                <div className="catalog-creator-info"><strong>Agri community creator</strong><span>Hindi · Multi-region</span><p>Product stories and farmer conversations</p></div>
                <div className="catalog-creator-action"><small>Platform-set rates</small><span><MessageCircle size={14} /> Private chat</span></div>
              </div>
            </div>
            <div className="catalog-influencer-privacy"><LockKeyhole size={15} /><span>Direct messages are planned to keep creator phone numbers private.</span></div>
          </div>
          <div className="catalog-influencer-roles">
            <div><span>FOR CREATORS</span><strong>Build your presence</strong><p>Create a profile with your niche, languages, location and social reach.</p></div>
            <div><span>FOR RETAILERS</span><strong>Find local voices</strong><p>Discover creators who understand your customers and products.</p></div>
            <div><span>FOR MANUFACTURERS</span><strong>Reach the right audience</strong><p>Explore creators by region, content category and audience size.</p></div>
          </div>
          <div className="catalog-influencer-bottom"><Megaphone size={20} /><p><strong>How it is planned to work:</strong> creators join through a dedicated role and subscription, build a public profile, and receive collaboration enquiries in their Messages inbox.</p></div>
          <PageFooter number="07" />
        </article>

        <article className="catalog-page catalog-close" aria-labelledby="catalog-next-title">
          <div className="catalog-page-head"><Brand light /><span className="catalog-page-tag catalog-page-tag-light">07 / GET STARTED</span></div>
          <div className="catalog-close-inner">
            <p className="catalog-eyebrow catalog-eyebrow-light">One conversation can start here</p>
            <h2 id="catalog-next-title">Let&apos;s grow the agri network, together.</h2>
            <p className="catalog-close-lead">Show this guide to a farmer, share it with an agri shop, or open KrishiDukan together and see the platform for yourself.</p>
            <div className="catalog-step-list">
              <div><span>01</span><div><strong>Explore</strong><p>See products, nearby stores and AgriReels at krishidukan.com.</p></div></div>
              <div><span>02</span><div><strong>Join</strong><p>Retailers and brands can learn about selling at krishidukan.com/sell.</p></div></div>
              <div><span>03</span><div><strong>Connect</strong><p>Speak directly with the team if you need help getting started.</p></div></div>
            </div>
            <div className="catalog-contact-panel">
              <div className="catalog-contact-details">
                <div><small>CALL US</small><a href="tel:+918658032751">+91 86580 32751</a></div>
                <div><small>EMAIL</small><a href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a></div>
                <div><small>OPEN THIS CATALOG</small><a href={`${SITE_URL}/catalog`}>krishidukan.com/catalog</a></div>
              </div>
              <div className="catalog-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/catalog-qr.svg" alt="QR code for krishidukan.com/catalog" />
                <span>SCAN TO OPEN</span>
              </div>
            </div>
            <div className="catalog-close-links">
              <Link href="/sell">For agri businesses <ArrowRight size={17} /></Link>
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">Get the app <Smartphone size={17} /></a>
            </div>
          </div>
          <div className="catalog-close-bottom"><CheckCircle2 size={18} /><span>KrishiDukan · Built for India&apos;s farming community</span></div>
          <PageFooter number="08" light />
        </article>
      </div>
    </main>
  );
}
