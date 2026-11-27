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
