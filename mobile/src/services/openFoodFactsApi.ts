/**
 * Open Food Facts API Service
 *
 * Free, open-source food database with nutritional information
 * API Documentation: https://world.openfoodfacts.org/data
 * No API key required
 */

export interface OpenFoodFactsProduct {
  product_name?: string;
  brands?: string;
  categories?: string;
  quantity?: string;
  serving_size?: string;
  nutriscore_grade?: string;
  image_url?: string;
  image_front_url?: string;
  image_ingredients_url?: string;
  image_nutrition_url?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    "energy-kcal_serving"?: number;
    proteins_100g?: number;
    proteins_serving?: number;
    carbohydrates_100g?: number;
    carbohydrates_serving?: number;
    fat_100g?: number;
    fat_serving?: number;
    sugars_100g?: number;
    sugars_serving?: number;
    fiber_100g?: number;
    fiber_serving?: number;
    sodium_100g?: number;
    sodium_serving?: number;
    salt_100g?: number;
    salt_serving?: number;
  };
}

export interface OpenFoodFactsResponse {
  status: number;
  status_verbose: string;
  code: string;
  product?: OpenFoodFactsProduct;
}

export interface ProductData {
  name: string;
  brand: string | null;
  category: string | null;
  servingSize: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
  imagePrimaryUrl: string | null;
  imageFrontUrl: string | null;
  imageBackUrl: string | null;
  auto_scaled: boolean;
  // True when OFF only had per-100 g/mL data and we couldn't auto-scale
  // (e.g. no parseable serving size). Presentation-only — not persisted.
  per100Only: boolean;
}

const API_BASE_URL = "https://world.openfoodfacts.org/api/v2";

// Open Food Facts requires a unique User-Agent identifying the client.
// Without it, requests may be silently rate-limited (HTTP 429) or blocked.
// Format guidance from their docs: "AppName/Version (ContactURL)".
const USER_AGENT =
  "FitTracker/1.0 (https://github.com/brian-desmond-wilson/fittracker)";

/**
 * Custom error class so callers can distinguish "product genuinely not in
 * the database" (resolved to null) from transient API failures (thrown).
 */
export class OpenFoodFactsError extends Error {
  readonly status: number | null;
  readonly rateLimited: boolean;
  constructor(status: number | null, message: string) {
    super(message);
    this.name = "OpenFoodFactsError";
    this.status = status;
    this.rateLimited = status === 429;
  }
}

/**
 * Fetch product information by barcode from Open Food Facts.
 *
 * @param barcode - The product barcode (UPC, EAN, etc.)
 * @returns Product data on hit, `null` if the API confirmed "not found".
 * @throws OpenFoodFactsError on transient failures (rate limit, network,
 *         5xx). The caller is expected to surface a "try again" message
 *         rather than telling the user "not found".
 */
export async function getProductByBarcode(barcode: string): Promise<ProductData | null> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/product/${barcode}.json`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
  } catch (networkErr) {
    console.error("Open Food Facts network error:", networkErr);
    throw new OpenFoodFactsError(null, "Network error reaching Open Food Facts");
  }

  // 404 from this endpoint means "barcode not in OFF" -> a clean "not
  // found" result. Other non-OK statuses (especially 429) are transient.
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    console.error(`Open Food Facts API error: ${response.status}`);
    throw new OpenFoodFactsError(
      response.status,
      response.status === 429
        ? "Open Food Facts is rate-limiting requests; try again shortly."
        : `Open Food Facts API returned ${response.status}`,
    );
  }

  let data: OpenFoodFactsResponse;
  try {
    data = await response.json();
  } catch (parseErr) {
    console.error("Open Food Facts JSON parse error:", parseErr);
    throw new OpenFoodFactsError(null, "Bad response from Open Food Facts");
  }

  if (data.status === 0 || !data.product) {
    return null;
  }

  return parseProductData(data.product);
}

/**
 * Pull a numeric grams/mL quantity out of a free-form serving_size string.
 * Examples:
 *   "237 mL"               -> 237
 *   "1 bottle (237 mL)"    -> 237
 *   "8 fl oz (237 mL)"     -> 237 (fl oz isn't matched; only g/ml are)
 *   "60g"                  -> 60
 *   "1 packet"             -> null
 */
export function parseServingSizeToGrams(s: string | null | undefined): number | null {
  if (!s) return null;
  const matches = Array.from(
    s.matchAll(/(\d+(?:\.\d+)?)\s*(g|ml)\b/gi),
  );
  if (matches.length === 0) return null;
  // Prefer a value inside parentheses if present (often the metric
  // restatement of a colloquial unit like "1 bottle (237 mL)").
  const parenMatch = s.match(/\(([^)]*?(\d+(?:\.\d+)?)\s*(g|ml)\b[^)]*)\)/i);
  if (parenMatch) {
    const n = parseFloat(parenMatch[2]);
    if (!isNaN(n)) return n;
  }
  const last = matches[matches.length - 1];
  const n = parseFloat(last[1]);
  return isNaN(n) ? null : n;
}

// Guardrail: refuse to auto-scale outside this range. Values outside
// suggest a data error (e.g. a 10g bottle, an 800g packet) — better to
// leave the per-100 g/mL value visible and let the user Edit.
const MIN_MULTIPLIER = 0.25;
const MAX_MULTIPLIER = 10;

/**
 * Parse Open Food Facts product data into our app's format
 */
function parseProductData(product: OpenFoodFactsProduct): ProductData {
  const nutriments = product.nutriments || {};

  // Extract product name
  const name = product.product_name || "Unknown Product";

  // Extract brand (may contain multiple brands separated by commas)
  const brand = product.brands?.split(",")[0]?.trim() || null;

  // Extract primary category
  const category = extractPrimaryCategory(product.categories);

  // Extract serving size
  const servingSize = product.serving_size || product.quantity || null;

  // For each nutrient prefer the _serving value; fall back to _100g
  // when OFF didn't populate _serving. When the fallback fires AND the
  // serving size parses to g/mL, scale the per-100 value to match.
  const calServing = nutriments["energy-kcal_serving"];
  const calPer100 = nutriments["energy-kcal_100g"];
  const proServing = nutriments.proteins_serving;
  const proPer100 = nutriments.proteins_100g;
  const carbServing = nutriments.carbohydrates_serving;
  const carbPer100 = nutriments.carbohydrates_100g;
  const fatServing = nutriments.fat_serving;
  const fatPer100 = nutriments.fat_100g;
  const sugServing = nutriments.sugars_serving;
  const sugPer100 = nutriments.sugars_100g;
  const fibServing = nutriments.fiber_serving;
  const fibPer100 = nutriments.fiber_100g;
  // Sodium: OFF reports in grams; we convert to mg downstream. Fall back
  // to salt × 393 (salt ≈ sodium × 2.5).
  const sodServingG = nutriments.sodium_serving;
  const sodPer100G = nutriments.sodium_100g;
  const saltServingG = nutriments.salt_serving;
  const saltPer100G = nutriments.salt_100g;

  const usedFallback = calServing == null && calPer100 != null;
  const grams = parseServingSizeToGrams(servingSize);
  let multiplier = 1;
  let autoScaled = false;
  if (usedFallback && grams != null && grams > 0 && grams !== 100) {
    const m = grams / 100;
    if (m >= MIN_MULTIPLIER && m <= MAX_MULTIPLIER) {
      multiplier = m;
      autoScaled = true;
    }
  }

  const scale = (
    perServing: number | null | undefined,
    per100: number | null | undefined,
  ): number | null => {
    if (perServing != null) return perServing;
    if (per100 == null) return null;
    return per100 * multiplier;
  };

  const calories = scale(calServing, calPer100);
  const protein = scale(proServing, proPer100);
  const carbs = scale(carbServing, carbPer100);
  const fats = scale(fatServing, fatPer100);
  const sugars = scale(sugServing, sugPer100);
  const fiber = scale(fibServing, fibPer100);
  const sodiumG = scale(sodServingG, sodPer100G);
  const saltG = scale(saltServingG, saltPer100G);
  const sodiumMg =
    sodiumG != null ? sodiumG * 1000 :
    saltG != null ? saltG * 393 :
    null;

  // Extract images
  const imagePrimaryUrl = product.image_url || product.image_front_url || null;
  const imageFrontUrl = product.image_front_url || null;
  const imageBackUrl = product.image_nutrition_url || null;

  return {
    name,
    brand,
    category,
    servingSize,
    calories: calories != null ? Math.round(calories) : null,
    protein: protein != null ? Math.round(protein * 10) / 10 : null,
    carbs: carbs != null ? Math.round(carbs * 10) / 10 : null,
    fats: fats != null ? Math.round(fats * 10) / 10 : null,
    sugars: sugars != null ? Math.round(sugars * 10) / 10 : null,
    sodium_mg: sodiumMg != null ? Math.round(sodiumMg) : null,
    fiber_g: fiber != null ? Math.round(fiber * 10) / 10 : null,
    imagePrimaryUrl,
    imageFrontUrl,
    imageBackUrl,
    auto_scaled: autoScaled,
    per100Only: usedFallback && !autoScaled,
  };
}

/**
 * Extract the primary category from the categories string
 * Open Food Facts returns categories in a hierarchical format like:
 * "en:plant-based-foods-and-beverages, en:beverages, en:plant-based-beverages"
 */
function extractPrimaryCategory(categories?: string): string | null {
  if (!categories) return null;

  const categoryList = categories.split(",").map((cat) => cat.trim());

  // Map Open Food Facts categories to our app categories
  const categoryMap: { [key: string]: string } = {
    "en:beverages": "Beverages",
    "en:plant-based-beverages": "Beverages",
    "en:dairy": "Dairy",
    "en:milk": "Dairy",
    "en:yogurt": "Dairy",
    "en:cheeses": "Dairy",
    "en:meats": "Meat",
    "en:poultry": "Meat",
    "en:beef": "Meat",
    "en:pork": "Meat",
    "en:seafood": "Seafood",
    "en:fish": "Seafood",
    "en:fruits": "Fruits",
    "en:vegetables": "Vegetables",
    "en:breads": "Grains",
    "en:cereals": "Grains",
    "en:pasta": "Grains",
    "en:rice": "Grains",
    "en:snacks": "Snacks",
    "en:chips": "Snacks",
    "en:cookies": "Snacks",
    "en:candies": "Snacks",
    "en:chocolates": "Snacks",
    "en:frozen-foods": "Frozen",
    "en:ice-creams": "Frozen",
    "en:condiments": "Condiments",
    "en:sauces": "Condiments",
    "en:dressings": "Condiments",
    "en:spices": "Spices",
  };

  // Try to find a matching category
  for (const category of categoryList) {
    const mapped = categoryMap[category.toLowerCase()];
    if (mapped) return mapped;
  }

  // If no match, return the first readable category (remove language prefix)
  const firstCategory = categoryList[0];
  if (firstCategory) {
    return firstCategory.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");
  }

  return null;
}

/**
 * Search for products by name
 * This can be used for a future feature to search products without barcode
 *
 * @param query - Search query
 * @param page - Page number (default 1)
 * @param pageSize - Number of results per page (default 20)
 */
export async function searchProducts(
  query: string,
  page: number = 1,
  pageSize: number = 20
): Promise<ProductData[]> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/search?search_terms=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}&json=true`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error(`Open Food Facts search error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data.products || data.products.length === 0) {
      return [];
    }

    return data.products.map((product: OpenFoodFactsProduct) => parseProductData(product));
  } catch (error) {
    console.error("Error searching products from Open Food Facts:", error);
    return [];
  }
}
