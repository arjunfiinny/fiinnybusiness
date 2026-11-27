# KrishiDukan-written product content

`products.json` holds product page text written by the KrishiDukan team with
AI help, keyed by product doc id: a description, FAQs and the sources used.

- It ships with the site code. Nothing is written to Firestore.
- It shows on a product page only when the switch `settings/pageContent.aiContent`
  is on (Admin → Product page content → "KrishiDukan-written content").
  Turning it off removes it from every product page at once.
- Content a team member saves for a product in the admin editor
  (`productPageContent/{id}`) always replaces this text for that product.

Writing rules:
- Facts only: active ingredient, formulation, pests, crops, mode of action.
- A dose figure appears only when the seller's own listing or the
  manufacturer states it; otherwise the text says to follow the label.
- Original wording; never copied from another site.
- Never name competing marketplaces.

## Indian-language pages (`i18n/{code}.json`)

Each file holds one language's product pages, keyed by product doc id:
`name`, `title` (without " | KrishiDukan", ≤ 46 characters), `metaDescription`,
`description` and `faqs`. A product with an entry gets a page at
`/{code}/products/{slug}`, hreflang links to and from the English page, and
sitemap entries. A product without one has no page in that language (404).

- Translate the checked English text above; never add crops, pests, doses
  or claims. Every number and unit must match the English exactly.
- Don't translate a product whose English text is flagged in
  `docs/seo-reports/*listing-fixes*` until the listing is fixed: a wrong dose
  would be copied into every language.
- Not switched off by `settings/pageContent.aiContent`: these pages exist only
  because of this text, so removing a product means deleting its entry.

To add a language: write `i18n/{code}.json`, import it in
`app/lib/seo/i18n/product-translations.ts`, and add the language's page
strings in `app/lib/seo/i18n/ui-strings.ts` (the code must be listed in
`languages.ts`).
