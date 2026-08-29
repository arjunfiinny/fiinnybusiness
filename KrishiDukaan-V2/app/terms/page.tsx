import type { Metadata } from "next";
import Link from "next/link";
import { Clause, LegalDoc, Points } from "../../components/shared/legal-doc";
import { COMPANY, LEGAL_ROUTES, SITE_URL, loadPublicFeeRates, pct } from "../lib/legal";

/**
 * General Terms & Conditions — the platform-wide agreement.
 *
 * WHY THIS PAGE EXISTS
 * --------------------
 * It did not. The footer linked "Terms" to a <button> with no handler, and the
 * mobile sign-up screen told every new user "By continuing, you agree to our
 * Terms of Service" — pointing at a document that had never been written. This
 * is that document.
 *
 * SCOPE. Everything common to every user of KrishiDukan: what the platform is,
 * accounts, orders, payments, content, liability, governing law. Anything that
 * applies only to a party SELLING on the platform lives in the Seller &
 * Manufacturer Subscription Terms (/seller-terms) and is incorporated by
 * reference from clause 3 here, so the two documents never restate — and never
 * contradict — each other.
 *
 * The transaction charges quoted below are read from settings/route via
 * app/lib/legal.ts, the same document app/lib/route-split.ts splits a payment
 * with. A published rate cannot drift from a charged one.
 */
export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Terms & Conditions — KrishiDukan" },
  description:
    "The terms governing use of the KrishiDukan agricultural marketplace and discovery platform by farmers, buyers, retailers, sellers and manufacturers in India.",
  alternates: { canonical: LEGAL_ROUTES.terms },
  openGraph: {
    type: "website",
    siteName: "KrishiDukan",
    url: `${SITE_URL}${LEGAL_ROUTES.terms}`,
    title: "Terms & Conditions — KrishiDukan",
    description:
      "The terms governing use of the KrishiDukan agricultural marketplace and discovery platform.",
  },
};

export default async function TermsPage() {
  const fees = await loadPublicFeeRates();

  return (
    <LegalDoc
      title="Terms & Conditions"
      route={LEGAL_ROUTES.terms}
      intro={
        <>
          <p>
            These Terms &amp; Conditions (&ldquo;<strong>Terms</strong>&rdquo;) govern your access
            to and use of the {COMPANY.brand} website, mobile applications and related services
            (together, the &ldquo;<strong>Platform</strong>&rdquo;), operated by {COMPANY.name}{" "}
            (&ldquo;<strong>{COMPANY.brand}</strong>&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo; or
            &ldquo;our&rdquo;).
          </p>
          <p className="mt-3">
            By creating an account, browsing, placing an order, listing a product, purchasing a
            subscription or otherwise using the Platform, you agree to these Terms. If you do not
            agree, please do not use the Platform.
          </p>
        </>
      }
    >
      <Clause n={1} title="What KrishiDukan is">
        <p>
          {COMPANY.brand} is a technology platform for agricultural inputs. It provides a
          marketplace and a discovery service that connects farmers and other buyers with
          retailers, sellers and manufacturers of agricultural products, and it provides
          agricultural and product-related content.
        </p>
        <p>
          {COMPANY.brand} is <strong>not</strong> the manufacturer, importer, distributor or seller
          of the products listed on the Platform, except where a listing expressly identifies{" "}
          {COMPANY.brand} as the seller. For every other listing, the contract of sale is between
          the buyer and the seller identified on that listing, and that seller is the seller of
          record.
        </p>
        <p>
          {COMPANY.brand}{" "}
          <strong>does not currently provide logistics or delivery services</strong>. Packing,
          dispatch, shipping and delivery of ordered products are the responsibility of the seller.
          See clause 6.
        </p>
      </Clause>

      <Clause n={2} title="Eligibility and your account">
        <Points
          items={[
            "You must be at least 18 years old and legally capable of entering into a binding contract under Indian law.",
            "Accounts are created and authenticated using your mobile number and a one-time password. You are responsible for keeping access to that number and your account secure, and for all activity carried out through your account.",
            "You agree to provide accurate, current and complete information, and to keep it updated. We may suspend or restrict an account where the information provided is materially inaccurate, misleading or cannot be verified.",
            "One person or business should maintain a single account for each role. We may merge or close duplicate accounts.",
          ]}
        />
      </Clause>

      <Clause n={3} title="Sellers, retailers and manufacturers">
        <p>
          If you use the Platform to list products, distribute products to retailers, receive
          orders, upload seller content or purchase a subscription, additional terms apply to you.
          Those terms are set out in the{" "}
          <Link
            href={LEGAL_ROUTES.sellerTerms}
            className="font-semibold text-primary hover:underline"
          >
            Seller &amp; Manufacturer Subscription Terms
          </Link>
          , which form part of these Terms and are incorporated into them by reference.
        </p>
        <p>
          The same standard Seller &amp; Manufacturer Subscription Terms apply to every seller,
          retailer and manufacturer using those features. {COMPANY.brand} does not maintain
          separate company-specific commercial agreements for individual sellers or manufacturers.
        </p>
        <p>
          Where these Terms and the Seller &amp; Manufacturer Subscription Terms address the same
          subject in relation to selling activity, the Seller &amp; Manufacturer Subscription Terms
          prevail.
        </p>
      </Clause>

      <Clause n={4} title="Product listings and information">
        <p>
          Product names, compositions, descriptions, MRPs, selling prices, pack sizes, images,
          usage and application information, labels and claims shown on the Platform are supplied
          by the relevant seller or manufacturer, who is responsible for their accuracy.
        </p>
        <p>
          Agricultural inputs are regulated products. Dosage, application and safety information
          shown on the Platform is provided for general guidance and does not replace the product
          label, the manufacturer&rsquo;s instructions or advice from a qualified agronomist or the
          relevant agricultural authority. Always read the label before use.
        </p>
        <p>
          Listing a product on the Platform is not a certification, endorsement, or a warranty by{" "}
          {COMPANY.brand} as to the product&rsquo;s quality, efficacy, authenticity or regulatory
          status. Responsibility for those matters rests with the seller or manufacturer.
        </p>
      </Clause>

      <Clause n={5} title="Orders and prices">
        <Points
          items={[
            "Prices, discounts, taxes, pack sizes and availability are set and maintained by the seller and may change at any time before an order is confirmed.",
            "Placing an order is an offer to buy from that seller. The contract is formed when the seller accepts the order on the Platform. A seller may decline an order — for example where stock is unavailable or a required licence check fails.",
            "Where an order includes products from more than one seller, each seller's portion is a separate contract with that seller.",
            "You must be legally entitled to purchase the product you are ordering. Certain agricultural inputs may only be sold to buyers who meet requirements under applicable law, and a seller may ask you for information before accepting your order.",
          ]}
        />
      </Clause>

      <Clause n={6} title="Delivery and fulfilment">
        <p>
          {COMPANY.brand} does not currently provide delivery or logistics services. The seller is
          responsible for packing, dispatch, choice of courier or transport, delivery and
          fulfilment of every order, and for any delivery charge shown on their listings.
        </p>
        <p>
          Delivery timelines shown on the Platform are estimates provided by the seller and are not
          a guarantee by {COMPANY.brand}. Where you collect from a physical store, collection is
          arranged directly with that store.
        </p>
      </Clause>

      <Clause n={7} title="Payments">
        <Points
          items={[
            <>
              Online payments are processed by a third-party payment service provider.{" "}
              {COMPANY.brand} does not store your full card, bank or UPI credentials.
            </>,
            <>
              Where a seller offers cash on delivery or in-store payment, that payment is collected
              by the seller directly and {COMPANY.brand} is not a party to it.
            </>,
            <>
              On successful online transactions, {COMPANY.brand} charges sellers a platform fee of{" "}
              {pct(fees.platformFeePercent)} of the transaction value, and the payment service
              provider levies its own charges. These are charges to the seller, not additional
              amounts payable by the buyer. They are described in the{" "}
              <Link
                href={LEGAL_ROUTES.sellerTerms}
                className="font-semibold text-primary hover:underline"
              >
                Seller &amp; Manufacturer Subscription Terms
              </Link>
              .
            </>,
            "GST and other applicable taxes are charged at the rates prescribed under applicable law.",
          ]}
        />
      </Clause>

      <Clause n={8} title="Cancellations, returns and refunds">
        <p>
          Because the seller is the seller of record, cancellations, returns, replacements and
          refunds are handled by the seller in accordance with applicable law and any policy the
          seller states on their listings.
        </p>
        <Points
          items={[
            "An order can be cancelled before the seller has dispatched it, by contacting the seller through the Platform. Once dispatched, cancellation depends on the seller and the courier.",
            "Where a seller rejects or cannot fulfil an order that has already been paid for online, we will arrange for the amount to be refunded to the original payment method. The time taken for the refund to reach you is determined by the payment service provider and your bank.",
            "Agricultural inputs that have been opened, used, or stored outside the conditions stated on the label may not be returnable. Damaged, incorrect, expired or misdescribed goods should be reported to the seller immediately on delivery, and kept unused.",
            <>
              If you cannot resolve a matter with the seller, contact us at{" "}
              <a
                href={`mailto:${COMPANY.supportEmail}`}
                className="font-semibold text-primary hover:underline"
              >
                {COMPANY.supportEmail}
              </a>
              . We will assist in taking it up with the seller. We are not, however, liable for the
              seller&rsquo;s obligations under the contract of sale.
            </>,
          ]}
        />
      </Clause>

      <Clause n={9} title="Content on the Platform">
        <p>
          The Platform carries content contributed by sellers, manufacturers and other users —
          including product information, images, reels, videos and educational material. That
          content belongs to the party who provided it, and they are responsible for it.
        </p>
        <p>
          You retain ownership of content you upload. By uploading it you grant {COMPANY.brand} a
          non-exclusive, royalty-free, worldwide licence to host, store, reproduce, adapt for
          formatting purposes, publish, display and distribute that content through the Platform
          and in connection with operating and promoting the Platform and the listings on it, for
          as long as the content remains on the Platform.
        </p>
        <p>
          You must not upload anything you do not have the rights to, anything unlawful,
          misleading, obscene, defamatory or infringing, or anything that promotes the misuse of
          agricultural chemicals. We may remove content that breaches these Terms.
        </p>
      </Clause>

      <Clause n={10} title="Acceptable use">
        <p>You agree not to:</p>
        <Points
          items={[
            "use the Platform for any unlawful purpose, or to list, buy or sell any product whose sale is prohibited or restricted under applicable law;",
            "impersonate another person or business, or misrepresent your licences, registrations or affiliations;",
            "post false, misleading or manipulated reviews, ratings, enquiries or orders;",
            "scrape, copy, index or reproduce the Platform's content or data except as permitted by our robots directives, or attempt to reverse engineer, interfere with or gain unauthorised access to the Platform; or",
            "use the Platform to send spam or to harvest other users' personal information.",
          ]}
        />
      </Clause>

      <Clause n={11} title="Intellectual property">
        <p>
          The {COMPANY.brand} name, logo, software, design, database and original content are owned
          by {COMPANY.name} or its licensors and are protected under applicable law. Nothing in
          these Terms transfers any right in them to you.
        </p>
        <p>
          Brand names, trademarks and product content belonging to manufacturers and sellers remain
          theirs. They appear on the Platform under the licence described in clause 9 and in the
          Seller &amp; Manufacturer Subscription Terms.
        </p>
      </Clause>

      <Clause n={12} title="Availability, and no guarantee of outcomes">
        <p>
          We work to keep the Platform available and accurate, but it is provided on an &ldquo;as
          is&rdquo; and &ldquo;as available&rdquo; basis. We do not warrant that it will be
          uninterrupted, error-free, or that any defect will be corrected within a particular time.
        </p>
        <p>
          {COMPANY.brand} does not guarantee any sales, orders, enquiries, leads, views, farmer
          reach, store footfall, revenue or business outcome to any seller, retailer or
          manufacturer, and does not guarantee that any particular product will be available to any
          buyer.
        </p>
      </Clause>

      <Clause n={13} title="Limitation of liability">
        <p>
          To the maximum extent permitted by applicable law, {COMPANY.brand} shall not be liable
          for any indirect, incidental, special, consequential or punitive loss, or for any loss of
          profit, revenue, crop, yield, goodwill, data or business opportunity, arising out of or
          in connection with your use of the Platform.
        </p>
        <p>
          {COMPANY.brand} is not liable for the quality, safety, authenticity, efficacy, regulatory
          compliance, labelling, packing, dispatch or delivery of products supplied by sellers, or
          for any loss arising from the use or misuse of an agricultural input contrary to its
          label or applicable law.
        </p>
        <p>
          Where liability cannot lawfully be excluded, {COMPANY.brand}&rsquo;s aggregate liability
          to you in respect of any claim is limited to the total amount of fees you paid to{" "}
          {COMPANY.brand} in the three months immediately preceding the event giving rise to the
          claim, or ₹5,000, whichever is higher.
        </p>
        <p>
          Nothing in these Terms excludes or limits any liability that cannot be excluded or
          limited under applicable law, including rights available to a consumer under the Consumer
          Protection Act, 2019.
        </p>
      </Clause>

      <Clause n={14} title="Suspension and termination">
        <p>
          You may stop using the Platform at any time and may request deletion of your account
          through the app or by contacting us.
        </p>
        <p>
          We may suspend, restrict or terminate access to an account, or remove a listing or
          content, where we reasonably believe there has been fraud, an unlawful or prohibited
          product, a regulatory problem, misleading information, abuse of the Platform or of other
          users, non-payment, a security risk, or a material or repeated breach of these Terms.
          Except where the issue is serious, urgent, or where notice is not practicable or would be
          unlawful, we will give notice and, where appropriate, an opportunity to correct the
          problem.
        </p>
        <p>
          Termination does not affect orders already accepted, amounts already payable, or any
          clause intended to survive.
        </p>
      </Clause>

      <Clause n={15} title="Changes to these Terms">
        <p>
          We may update these Terms from time to time — for example to reflect changes to the
          Platform, our charges, or applicable law. The current version is always published on this
          page with its effective date, and we will give notice where required by law or where the
          change is material.
        </p>
        <p>
          Changes apply prospectively. They do not retrospectively alter a transaction that has
          already been completed, or a subscription period that has already been paid for.
          Continuing to use the Platform after a change takes effect means you accept the updated
          Terms.
        </p>
      </Clause>

      <Clause n={16} title="Privacy">
        <p>
          Our handling of personal data is described in the{" "}
          <Link href={LEGAL_ROUTES.privacy} className="font-semibold text-primary hover:underline">
            Privacy Policy
          </Link>
          , which forms part of these Terms.
        </p>
      </Clause>

      <Clause n={17} title="Governing law and disputes">
        <p>
          These Terms are governed by and construed in accordance with the laws of India. Subject
          to the paragraph below, the courts of competent jurisdiction in India shall have
          jurisdiction over any dispute arising out of or in connection with these Terms or the
          Platform.
        </p>
        <p>
          Before commencing proceedings, please contact us at{" "}
          <a
            href={`mailto:${COMPANY.supportEmail}`}
            className="font-semibold text-primary hover:underline"
          >
            {COMPANY.supportEmail}
          </a>{" "}
          so we can try to resolve the matter directly. Nothing here affects a consumer&rsquo;s
          right to approach the consumer dispute redressal forums available under the Consumer
          Protection Act, 2019.
        </p>
      </Clause>

      <Clause n={18} title="General">
        <Points
          items={[
            "If any provision of these Terms is held to be invalid or unenforceable, the rest continues in effect.",
            "A failure to enforce a provision is not a waiver of it.",
            "You may not assign your rights under these Terms without our consent. We may assign ours in connection with a reorganisation or transfer of the business, provided your rights are not adversely affected.",
            "These Terms, together with the Privacy Policy and — where applicable — the Seller & Manufacturer Subscription Terms, are the entire agreement between you and us in relation to the Platform.",
          ]}
        />
      </Clause>

      <Clause n={19} title="Contact">
        <p>
          {COMPANY.name} (operating {COMPANY.brand})
          <br />
          Email:{" "}
          <a
            href={`mailto:${COMPANY.supportEmail}`}
            className="font-semibold text-primary hover:underline"
          >
            {COMPANY.supportEmail}
          </a>
        </p>
      </Clause>
    </LegalDoc>
  );
}
