/**
 * The fixed text around a translated product page: headings, buttons, stock.
 *
 * A language without an entry here has no product pages at all (see
 * languages.ts), so adding a language is: add its strings here, then its
 * product text in ai-content/i18n/{code}.json and the import in
 * product-translations.ts.
 *
 * Product and shop names stay as they are; only the words around them change.
 */

export interface ProductUiStrings {
  /** Added after the product name when the content has no title of its own. */
  titleSuffix: string;
  inStock: string;
  checkAvailability: string;
  buyCta: string;
  about: (name: string) => string;
  photos: (name: string) => string;
  packSizes: string;
  benefits: string;
  faqHeading: (name: string) => string;
  shopsSelling: (name: string) => string;
  related: string;
  browseMore: string;
  reviews: (count: number) => string;
  otherLanguages: string;
  /** Category names as stored on listings → this language. Unknown ones stay English. */
  categories: Record<string, string>;
}

const mr: ProductUiStrings = {
  titleSuffix: " — किंमत व खरेदी",
  inStock: "स्टॉकमध्ये उपलब्ध",
  checkAvailability: "उपलब्धता तपासा",
  buyCta: "विक्रेते पहा व खरेदी करा →",
  about: (name) => `${name} विषयी माहिती`,
  photos: (name) => `${name} फोटो`,
  packSizes: "उपलब्ध पॅक साईझ",
  benefits: "मुख्य फायदे",
  faqHeading: (name) => `${name}: शेतकऱ्यांचे प्रश्न`,
  shopsSelling: (name) => `${name} विकणारी दुकाने`,
  related: "संबंधित उत्पादने",
  browseMore: "← अधिक उत्पादने पहा",
  reviews: (count) => `${count} रिव्ह्यू`,
  otherLanguages: "ही माहिती इतर भाषांमध्ये",
  categories: {
    Seeds: "बियाणे",
    Fertilizers: "खते",
    Pesticides: "कीटकनाशके",
    Insecticides: "कीटकनाशके",
    Herbicides: "तणनाशके",
    "Herbicides (Weedicides)": "तणनाशके",
    Fungicides: "बुरशीनाशके",
    "Bio-Stimulants": "बायो-स्टिम्युलंट",
    Sprayers: "फवारणी पंप",
  },
};

const hi: ProductUiStrings = {
  titleSuffix: " — कीमत व खरीदें",
  inStock: "स्टॉक में उपलब्ध",
  checkAvailability: "उपलब्धता जांचें",
  buyCta: "विक्रेता देखें व खरीदें →",
  about: (name) => `${name} के बारे में`,
  photos: (name) => `${name} की फोटो`,
  packSizes: "उपलब्ध पैक साइज़",
  benefits: "मुख्य फायदे",
  faqHeading: (name) => `${name}: किसानों के सवाल`,
  shopsSelling: (name) => `${name} बेचने वाली दुकानें`,
  related: "मिलते-जुलते उत्पाद",
  browseMore: "← और उत्पाद देखें",
  reviews: (count) => `${count} रिव्यू`,
  otherLanguages: "यह जानकारी दूसरी भाषाओं में",
  categories: {
    Seeds: "बीज",
    Fertilizers: "खाद",
    Pesticides: "कीटनाशक",
    Insecticides: "कीटनाशक",
    Herbicides: "खरपतवारनाशक",
    "Herbicides (Weedicides)": "खरपतवारनाशक",
    Fungicides: "फफूंदनाशक",
    "Bio-Stimulants": "बायो-स्टिमुलेंट",
    Sprayers: "स्प्रेयर",
  },
};

const STRINGS: Record<string, ProductUiStrings> = { mr, hi };

export function getUiStrings(code: string): ProductUiStrings | null {
  return STRINGS[code] ?? null;
}
