import type { Metadata } from "next";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore/lite";
import { Clause, LegalDoc, Points } from "../../components/shared/legal-doc";
import { COMPANY, LEGAL_ROUTES, SITE_URL, loadPublicFeeRates, pct } from "../lib/legal";
import { getClientDb } from "../lib/firebase-client-server";
import { DEFAULT_DURATIONS, PRICING_DOC_PATH, parseDurations } from "../lib/pricing";

/**
 * Seller & Manufacturer Subscription Terms — the standard commercial agreement.
 *
 * WHY A SEPARATE DOCUMENT
 * -----------------------
 * There was no Terms architecture to fold this into: /privacy was the only legal
 * page on the site, and the general Terms (/terms) had to be written from
 * scratch alongside this. Given a blank slate, splitting was the better shape —
 * a farmer buying a bottle of fertilizer should not have to read twelve clauses
 * about seat billing and Route settlement to find the returns clause, and a
 * manufacturer should be able to be pointed at ONE URL that is the whole
 * commercial deal.
 *
 * THE POINT OF THIS PAGE is that it is the same for everybody. It exists so the
 * sentence "KrishiDukan does not maintain separate company-specific agreements;
 * all manufacturers subscribe under the same standard terms published at
 * krishidukan.com/seller-terms" is literally true and independently checkable.
 * Do not add a manufacturer-specific carve-out here. If a term cannot apply to
 * every seller, it does not belong in this document.
 *
 * EVERY NUMBER ON THIS PAGE IS DERIVED, NOT TYPED:
 *   - subscription prices  ← settings/pricing (app/lib/pricing.ts), the same doc
 *                            api/payment/create-order charges from
 *   - platform fee         ← settings/route  (app/lib/route-split.ts), the same
 *   - gateway fee          ← doc api/payment/create-cart-order splits with
 * That is the whole reason the "0% commission" claim was able to rot: it was
 * hand-typed in ten places with nothing tying it to the code.
 */
export const revalidate = 86400;

const TITLE = "Seller & Manufacturer Subscription Terms — KrishiDukan";
const DESCRIPTION =
  "The standard terms on which retailers, sellers and manufacturers subscribe to KrishiDukan: per-product seat subscription, platform fee on online transactions, payment gateway charges, taxes, fulfilment and compliance responsibilities.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: LEGAL_ROUTES.sellerTerms },
  openGraph: {
    type: "website",
    siteName: "KrishiDukan",
    url: `${SITE_URL}${LEGAL_ROUTES.sellerTerms}`,
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * The cheapest per-listing entry on the live ladder, for the illustrative rate
 * in clause 3. Flat bundle plans are excluded — "Rs 4,999 for 50 listings" is
 * not a per-product rate and quoting it as one would misdescribe the model.
 */
async function loadEntryRate(): Promise<{ price: number; months: number } | null> {
  let durations = DEFAULT_DURATIONS;
  try {
    const snap = await getDoc(
      doc(getClientDb(), PRICING_DOC_PATH.collection, PRICING_DOC_PATH.doc),
    );
    if (snap.exists()) durations = parseDurations(snap.data()) ?? DEFAULT_DURATIONS;
  } catch (err) {
    console.warn("[/seller-terms] pricing read failed, using defaults:", err);
  }
  const perListing = durations.filter((d) => typeof d.flatPrice !== "number");
  if (perListing.length === 0) return null;
  const entry = perListing.reduce((a, b) => (b.months < a.months ? b : a));
  return { price: entry.pricePerSeat, months: entry.months };
}

export default async function SellerTermsPage() {
  const [fees, entry] = await Promise.all([loadPublicFeeRates(), loadEntryRate()]);

  const period = entry && entry.months === 1 ? "month" : `${entry?.months} months`;

  return (
    <LegalDoc
      title="Seller & Manufacturer Subscription Terms"
      route={LEGAL_ROUTES.sellerTerms}
      intro={
        <>
          <p>
            These Seller &amp; Manufacturer Subscription Terms (&ldquo;
            <strong>Seller Terms</strong>&rdquo;) apply to every retailer, seller and manufacturer
            (&ldquo;<strong>you</strong>&rdquo;, &ldquo;<strong>Seller</strong>&rdquo;) that uses
            seller or manufacturer functionality on {COMPANY.brand}, operated by {COMPANY.name}.
          </p>
          <p className="mt-3">
            <strong>
              By creating a seller or manufacturer account, purchasing a subscription or seats,
              listing or assigning products, uploading seller content, receiving orders or
              otherwise using seller or manufacturer functionality on the Platform, you agree to
              these Seller Terms and to the{" "}
              <Link href={LEGAL_ROUTES.terms} className="text-primary hover:underline">
                Terms &amp; Conditions
              </Link>
              .
            </strong>
          </p>
          <p className="mt-3">
            These Seller Terms are the standard terms that apply to all Sellers. {COMPANY.brand}{" "}
            does not maintain separate company-specific commercial agreements with individual
            sellers or manufacturers. Where a defined term is used here but not defined, it has the
            meaning given in the Terms &amp; Conditions.
          </p>
        </>
      }
    >
      <Clause n={1} title="Eligibility and onboarding">
        <Points
          items={[
            "You must be a business or individual legally entitled to sell the products you list, and legally capable of entering into a binding contract under Indian law.",
            "You must provide accurate and complete company, contact, address, bank and tax information, and any documentation, licence or registration we reasonably request in order to verify your account or to meet our own legal obligations.",
            "You must keep that information current. Where information cannot be verified, or turns out to be materially inaccurate, we may restrict, suspend or close the account (see clause 18).",
            "Verification by KrishiDukan is an account-level check. It is not a certification of your products, your licences or your regulatory compliance, and it does not transfer any of the responsibilities set out in clauses 8 to 12 to KrishiDukan.",
          ]}
        />
      </Clause>

      <Clause n={2} title="The Platform and what it does">
        <p>
          {COMPANY.brand} provides a technology platform through which you may, subject to the
          features enabled on your account:
        </p>
        <Points
          items={[
            "list products for online sale, and receive and manage orders placed by buyers;",
            "have your products discovered by farmers and other users, including — where you have physical retail distribution — discovery of nearby stores carrying those products;",
            "distribute or assign your products to retailers in your network; and",
            "provide agricultural and product-related content, such as reels, product education, usage and application information and crop education, which may be connected to the relevant product listings.",
          ]}
        />
        <p>
          Physical retail distribution is not a requirement. A manufacturer selling only online may
          list and sell on the Platform.
        </p>
        <p>
          {COMPANY.brand} is the technology, marketplace and discovery platform. You are the party
          supplying the product, and you are the seller of record on every order placed with you.
        </p>
      </Clause>

      <Clause n={3} title="Subscription and seats">
        <p>
          Access to seller and manufacturer functionality is sold as a subscription, measured in{" "}
          <strong>seats</strong>. One seat entitles you to one active product listing on the
          Platform.
        </p>
        <Points
          items={[
            "You purchase the number of seats you require, and then add products. Thirty products require thirty seats.",
            "A seat is consumed while a listing is active. Seats are released when a listing is removed or when the subscription period for that seat ends.",
            "Where you assign a product to a retailer in your network, that assigned listing occupies a seat in the same way as your own listing, because it is a distinct active listing on the Platform. The number of seats required therefore depends on the number of active listings, including assignments, rather than on the number of products in your catalogue alone. The current seat position is always shown on your dashboard.",
            "Seats cannot be used to list products you are not entitled to sell, and a single seat may not be rotated between unrelated products to circumvent seat pricing.",
          ]}
        />
        {entry ? (
          <p>
            The current standard rate is{" "}
            <strong>
              ₹{entry.price} per product/SKU per {period}
            </strong>
            , with longer subscription periods and any bundled plans priced as shown at the point of
            purchase.
          </p>
        ) : null}
        <p>
          <strong>The price displayed and accepted by you at the time of purchase governs that
          subscription and billing period.</strong>{" "}
          Prices, plans and bundles may change from time to time. A change takes effect only for
          purchases and renewals made after it comes into effect, and never alters a subscription
          period you have already paid for.
        </p>
      </Clause>

      <Clause n={4} title="Platform fee on online transactions">
        <p>
          On each successful online transaction concluded through the Platform, {COMPANY.brand}{" "}
          currently charges a platform fee of{" "}
          <strong>{pct(fees.platformFeePercent)} of the transaction value</strong>. The platform fee
          is a charge to you, not an additional amount payable by the buyer.
        </p>
        <p>
          The platform fee is a charge determined by {COMPANY.brand} and may be changed by us in
          accordance with clause 20. It does not apply to orders that are not concluded and paid for
          online through the Platform, such as an order paid in cash on delivery or settled directly
          at your store.
        </p>
      </Clause>

      <Clause n={5} title="Payment gateway charges">
        <p>
          Online payments are processed by a third-party payment service provider. Payment gateway
          charges are{" "}
          <strong>
            currently approximately {pct(fees.gatewayFeePercent)} of the transaction value
          </strong>
          , and are levied by the applicable payment service provider.
        </p>
        <p>
          <strong>
            Such charges are not determined or controlled by {COMPANY.brand} and may change from
            time to time.
          </strong>{" "}
          They may vary depending on the payment method used by the buyer, the payment service
          provider, the pricing plan applicable to the account, the provider&rsquo;s policies,
          applicable taxes and any future changes made by the provider. The figure above is
          indicative of the rate currently applying and is not a commitment by {COMPANY.brand} that
          it will remain at that level.
        </p>
        <p>
          Payment gateway charges, and any tax charged on them by the provider, are borne by you and
          are deducted from the amount settled to you, unless the Platform expressly states
          otherwise for a particular transaction or account.
        </p>
      </Clause>

      <Clause n={6} title="Summary of current transaction charges">
        <div className="overflow-x-auto rounded-2xl border border-surface-container">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <tbody>
              <tr className="border-b border-surface-container">
                <td className="px-4 py-3">{COMPANY.brand} platform fee (clause 4)</td>
                <td className="px-4 py-3 text-right font-bold text-on-surface">
                  {pct(fees.platformFeePercent)}
                </td>
              </tr>
              <tr className="border-b border-surface-container">
                <td className="px-4 py-3">
                  Payment gateway charges (clause 5) — currently approximately, set by the provider
                </td>
                <td className="px-4 py-3 text-right font-bold text-on-surface">
                  {pct(fees.gatewayFeePercent)}
                </td>
              </tr>
              <tr className="bg-surface-container-low">
                <td className="px-4 py-3 font-bold text-on-surface">
                  Current base transaction charges
                </td>
                <td className="px-4 py-3 text-right font-black text-primary">
                  {pct(fees.baseTransactionPercent)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>
            GST and other applicable taxes are additional, and are charged at the rates prescribed
            under applicable law.
          </strong>{" "}
          The base transaction charges above are stated exclusive of tax. The subscription fee under
          clause 3 is separate from, and additional to, these transaction charges.
        </p>
      </Clause>

      <Clause n={7} title="Taxes, invoices and settlement">
        <Points
          items={[
            "All fees and charges under these Seller Terms are exclusive of GST and any other applicable taxes, cess or levies, which shall be charged at the rates prescribed under applicable law and shown separately where required.",
            "You are responsible for your own tax registrations, for charging and remitting tax on your sales, and for issuing to buyers any invoice or document required of you under applicable law.",
            "Amounts collected from buyers on online orders are settled to the account you register with us, net of the platform fee, payment gateway charges and applicable taxes on those charges, and net of any amount you owe us or any refund, chargeback or reversal properly attributable to your orders.",
            "Settlement timing depends on the payment service provider, the settlement cycle applicable to the account, and the completion of any verification the provider requires. Where the Platform holds an amount until an order is confirmed as delivered, that amount is released for settlement after the order is marked delivered. KrishiDukan does not guarantee a specific settlement date.",
            "You are responsible for the accuracy of the bank and account details you register. We are not liable for a settlement made to details you supplied incorrectly.",
          ]}
        />
      </Clause>

      <Clause n={8} title="Product pricing">
        <p>
          You are responsible for setting and maintaining the prices of your products, including
          MRP, selling price, any discount, and any delivery charge you apply, unless a Platform
          feature you have chosen to use expressly provides otherwise.
        </p>
        <p>
          You must ensure your prices comply with applicable law, including any statutory price
          control applying to the product, and that the price shown to a buyer is the price you will
          honour.
        </p>
      </Clause>

      <Clause n={9} title="Product information">
        <p>You are solely responsible for the accuracy and completeness of:</p>
        <Points
          items={[
            "product name and brand;",
            "composition and active ingredients;",
            "description and specifications;",
            "MRP and selling price;",
            "pack size and units;",
            "images and other media;",
            "usage, dosage and application information;",
            "labels, warnings and safety information; and",
            "any claim made about the product, and any other product information you supply.",
          ]}
        />
        <p>
          You must not make any claim about a product that is false, misleading, unsubstantiated, or
          not permitted for that product under applicable law. Information you supply may be
          displayed on the Platform, in search results and in connection with your content.
        </p>
      </Clause>

      <Clause n={10} title="Regulatory compliance">
        <p>
          Agricultural inputs are regulated. <strong>You remain solely responsible</strong> for
          ensuring that every product you list, sell, distribute or assign on the Platform complies
          with all applicable Indian laws, rules, licences, registrations, approvals, labelling
          requirements and other regulatory requirements — including, as applicable, the
          Insecticides Act, 1968 and rules made under it, the Fertiliser (Control) Order, 1985 and
          the Essential Commodities Act, 1955, seed legislation, the Legal Metrology Act, 2009 and
          rules on packaged commodities, and requirements relating to registration, batch marking,
          shelf life, storage, transport and disposal.
        </p>
        <p>
          You must hold, maintain in force, and comply with the conditions of every licence,
          registration and approval required for the products you deal in and the manner in which
          you deal in them, and you must provide evidence of these on request.
        </p>
        <p>
          <strong>
            The fact that a product is listed, displayed, verified, indexed or sold through the
            Platform does not mean that {COMPANY.brand} has verified, approved or certified its
            regulatory status, and {COMPANY.brand} does not warrant or guarantee the regulatory
            compliance of any product listed by a Seller.
          </strong>{" "}
          Any check {COMPANY.brand} carries out is for its own account-administration purposes and
          does not reduce or transfer your responsibility under this clause.
        </p>
        <p>
          You must notify us promptly if a product you list becomes subject to a recall, ban,
          suspension, cancellation of registration, or an enforcement action or direction by a
          regulator, and you must remove the affected listing.
        </p>
      </Clause>

      <Clause n={11} title="Inventory and availability">
        <p>
          You are responsible for maintaining your inventory and for keeping stock levels,
          availability and pack options on your listings accurate and up to date. A listing shown as
          available should be capable of being fulfilled. Products that are out of stock,
          discontinued, expired or beyond their shelf life must not be shown as available.
        </p>
      </Clause>

      <Clause n={12} title="Fulfilment, dispatch and delivery">
        <p>
          <strong>{COMPANY.brand} does not currently provide delivery or logistics services.</strong>{" "}
          You are responsible for:
        </p>
        <Points
          items={[
            "packing, including packing that is appropriate and lawful for the product being shipped;",
            "dispatch within the time you have indicated on the listing;",
            "arranging courier, transport or other logistics, and bearing their cost unless you have shown a delivery charge that the buyer has paid;",
            "delivery to the buyer, and any proof of delivery required; and",
            "overall fulfilment of the order, including handling any delivery failure, damage in transit or loss.",
          ]}
        />
        <p>
          Any delivery timeline you display is your estimate and your commitment to the buyer, not a
          representation by {COMPANY.brand}.
        </p>
      </Clause>

      <Clause n={13} title="Orders">
        <p>On receiving an order through the Platform you must:</p>
        <Points
          items={[
            "review and either accept or decline it promptly, and decline rather than leave it pending where you cannot fulfil it;",
            "honour the price, quantity, pack size and product shown to the buyer at the time the order was placed;",
            "fulfil an accepted order in accordance with clause 12 and keep the order status on the Platform up to date, including marking it delivered when it has been delivered;",
            "provide the buyer with any bill or invoice required under applicable law; and",
            "respond to reasonable buyer queries about the order through the channels provided on the Platform.",
          ]}
        />
        <p>
          Repeatedly declining, ignoring or failing to fulfil accepted orders may lead to action
          under clause 18.
        </p>
      </Clause>

      <Clause n={14} title="Cancellations, returns and refunds">
        <p>
          As seller of record, you are responsible for cancellations, returns, replacements and
          refunds on your orders, in accordance with applicable law, clause 8 of the{" "}
          <Link href={LEGAL_ROUTES.terms} className="font-semibold text-primary hover:underline">
            Terms &amp; Conditions
          </Link>{" "}
          and any policy you state on your listings. Your policy may not be less favourable to the
          buyer than applicable law requires.
        </p>
        <Points
          items={[
            "A buyer may seek to cancel before dispatch. Where you have not dispatched, you should accept the cancellation.",
            "Where you decline or cannot fulfil an order that the buyer has already paid for online, the amount is refunded to the buyer through the payment service provider. The corresponding amount, and any charge, reversal or chargeback associated with it, is recovered from you or set off against amounts otherwise settling to you.",
            "Where goods are delivered damaged, incorrect, expired, misdescribed or not in conformity with the listing, resolving the matter with the buyer is your responsibility.",
            "KrishiDukan's role is to operate the Platform, pass on order and cancellation information, and instruct refunds through the payment service provider. KrishiDukan does not assume the seller's obligations under the contract of sale.",
          ]}
        />
      </Clause>

      <Clause n={15} title="Content, reels and videos">
        <Points
          items={[
            "You may upload or provide content — including reels, videos, images, product education, application and usage information, crop education and farmer awareness material — subject to the features enabled on your account and to any format, size, duration and volume limits applied on the Platform from time to time. KrishiDukan does not offer unlimited hosting or storage.",
            "You must own, or have all necessary rights, licences and consents to, everything you upload, including any music, footage, images, trademarks and any person appearing in the content, and you must have obtained any consent required from those persons.",
            <>
              You grant {COMPANY.brand} a non-exclusive, royalty-free, worldwide, sub-licensable
              licence to host, store, reproduce, reformat, publish, display, distribute and
              communicate that content through the Platform and through {COMPANY.brand}&rsquo;s own
              channels, for the purpose of operating and promoting the Platform, your listings and
              the products connected to that content. The licence lasts while the content is on the
              Platform and for a reasonable period afterwards to the extent needed for copies
              already distributed, caches, backups and records.
            </>,
            <>
              {COMPANY.brand} does not claim ownership of your content. Nothing in these Seller
              Terms transfers your intellectual property to us.
            </>,
            "We may decline to publish, may remove, and may stop displaying content that breaches these Seller Terms, is unlawful or misleading, promotes unsafe or unlawful use of an agricultural input, or is the subject of a credible third-party complaint.",
            "KrishiDukan does not guarantee that any content will be published, promoted, recommended, retained for any period, or seen by any number of users.",
          ]}
        />
      </Clause>

      <Clause n={16} title="Intellectual property">
        <p>
          You retain ownership of your trademarks, brand, product content and other intellectual
          property. You grant {COMPANY.brand} a non-exclusive, royalty-free licence to use your
          name, brand names, logos, product images and product information for the purpose of
          listing, displaying, indexing, marketing and promoting your products and your presence on
          the Platform, for as long as you use the Platform and for a reasonable period afterwards
          to the extent needed for copies already distributed, caches, backups and records.
        </p>
        <p>
          You warrant that this use will not infringe any third party&rsquo;s rights. You will
          indemnify {COMPANY.brand} against claims arising from content, product information,
          branding or products you supply, or from your breach of clause 10.
        </p>
      </Clause>

      <Clause n={17} title="No guaranteed sales or reach">
        <p>
          A subscription buys access to the Platform&rsquo;s functionality. It does not buy an
          outcome. {COMPANY.brand} <strong>does not guarantee</strong> any:
        </p>
        <Points
          items={[
            "sales, orders or transaction volume;",
            "enquiries or leads;",
            "views, impressions, ranking or placement;",
            "farmer or user reach;",
            "store footfall;",
            "revenue, margin or business performance; or",
            "number of retailers reached or onboarded.",
          ]}
        />
        <p>
          Any figure, estimate or example shown in marketing material, on the Platform or in a
          discussion is illustrative only and is not a representation, warranty or commitment.
        </p>
      </Clause>

      <Clause n={18} title="Suspension and removal">
        <p>
          We may suspend or remove a listing, a piece of content, a feature or an account where we
          reasonably believe there is:
        </p>
        <Points
          items={[
            "fraud, or an attempt to manipulate orders, reviews, ratings or discovery;",
            "an illegal, banned, restricted, counterfeit, spurious, misbranded or recalled product;",
            "a regulatory problem, including a missing, expired or cancelled licence or registration;",
            "misleading, false or unsubstantiated product information or claims;",
            "abuse of the Platform, of buyers, or of other users;",
            "non-payment of amounts due to us; or",
            "a material or repeated breach of these Seller Terms or of the Terms & Conditions.",
          ]}
        />
        <p>
          We will act proportionately: where the problem can be corrected and the risk allows, we
          will notify you, tell you what the problem is, and give you a reasonable opportunity to
          correct it before removing a listing or suspending an account. Where the risk is serious
          or urgent — such as an unsafe, banned or recalled product, suspected fraud, or a
          regulatory direction — we may act immediately and notify you afterwards.
        </p>
        <p>
          Suspension of an account does not suspend your obligations on orders you have already
          accepted.
        </p>
      </Clause>

      <Clause n={19} title="Term and termination">
        <Points
          items={[
            "These Seller Terms apply from the time you first use seller or manufacturer functionality and continue until your account is closed.",
            "You may stop using the service at any time and may ask us to close your account. Before doing so you must fulfil or properly resolve every order you have already accepted.",
            "On closure or expiry, your listings stop being displayed and your seats are released. Content and product information may be removed from the Platform, subject to copies retained in backups, caches and records, and to anything we are required to retain by law.",
            "Subscription fees are charged for a period in advance. Closing your account, or removing a listing, part-way through a paid period does not entitle you to a refund or a pro-rata credit for the unused part of that period, except where a refund is required under applicable law or where we have expressly agreed otherwise in writing.",
            "Amounts already due, accrued rights, and clauses which by their nature should survive — including clauses 7, 9, 10, 14, 16, 20 and 21 — survive termination.",
          ]}
        />
      </Clause>

      <Clause n={20} title="Changes to these Seller Terms, and to pricing">
        <p>
          We may update these Seller Terms, the subscription pricing and the platform fee from time
          to time. The current version is always published on this page with its effective date.
        </p>
        <Points
          items={[
            "Where a change is material or notice is required by applicable law, we will give you notice through the Platform or to your registered contact details before it takes effect.",
            "Changes apply prospectively only. They do not retrospectively alter a completed transaction, or a subscription period you have already purchased — the price you accepted at purchase governs that period.",
            "A change to the platform fee applies to transactions concluded after it takes effect.",
            "Payment gateway charges are governed by clause 5 and may change without notice from us, because they are set by the payment service provider.",
            "Continuing to use seller or manufacturer functionality after a change takes effect means you accept the updated Seller Terms.",
          ]}
        />
      </Clause>

      <Clause n={21} title="Liability">
        <p>
          Clause 13 (Limitation of liability) of the{" "}
          <Link href={LEGAL_ROUTES.terms} className="font-semibold text-primary hover:underline">
            Terms &amp; Conditions
          </Link>{" "}
          applies to these Seller Terms and is not repeated or varied here. Nothing in these Seller
          Terms creates a liability for {COMPANY.brand} that is excluded or limited there, and
          nothing excludes a liability that cannot lawfully be excluded.
        </p>
        <p>
          For the avoidance of doubt, {COMPANY.brand} is not liable to you for lost sales, lost
          profit, lost reach or lost business opportunity, and is not liable for the acts or
          omissions of a buyer, a courier or the payment service provider.
        </p>
      </Clause>

      <Clause n={22} title="Governing law and disputes">
        <p>
          Clause 17 (Governing law and disputes) of the{" "}
          <Link href={LEGAL_ROUTES.terms} className="font-semibold text-primary hover:underline">
            Terms &amp; Conditions
          </Link>{" "}
          applies to these Seller Terms. These Seller Terms are governed by the laws of India, and
          the courts of competent jurisdiction in India shall have jurisdiction over any dispute.
        </p>
      </Clause>

      <Clause n={23} title="Contact">
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
        <p>
          Seller pricing and what a subscription includes are summarised at{" "}
          <Link href="/sell" className="font-semibold text-primary hover:underline">
            krishidukan.com/sell
          </Link>
          . Where that page and these Seller Terms differ, these Seller Terms govern.
        </p>
      </Clause>
    </LegalDoc>
  );
}
