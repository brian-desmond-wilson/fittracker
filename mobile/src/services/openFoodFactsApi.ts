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
  imagePrimaryUrl: string | null;
  imageFrontUrl: string | null;
  imageBackUrl: string | null;
}

const API_BASE_URL = "https://world.openfoodfacts.org/api/v2";

/**
 * Fetch product information by barcode from Open Food Facts
 *
 * @param barcode - The product barcode (UPC, EAN, etc.)
 * @returns Product data or null if not found
 */
export async function getProductByBarcode(barcode: string): Promise<ProductData | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/product/${barcode}.json`);

    if (!response.ok) {
      console.error(`Open Food Facts API error: ${response.status}`);
      return null;
    }

    const data: OpenFoodFactsResponse = await response.json();

    if (data.status === 0 || !data.product) {
      console.log(`Product not found for barcode: ${barcode}`);
      return null;
    }

    return parseProductData(data.product);
  } catch (error) {
    console.error("Error fetching product from Open Food Facts:", error);
    return null;
  }
}

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

  // Extract nutritional information (prefer per serving if available, otherwise per 100g)
  const calories = nutriments["energy-kcal_serving"] || nutriments["energy-kcal_100g"] || null;
  const protein = nutriments.proteins_serving || nutriments.proteins_100g || null;
  const carbs = nutriments.carbohydrates_serving || nutriments.carbohydrates_100g || null;
  const fats = nutriments.fat_serving || nutriments.fat_100g || null;
  const sugars = nutriments.sugars_serving || nutriments.sugars_100g || null;

  // Extract images
  const imagePrimaryUrl = product.image_url || product.image_front_url || null;
  const imageFrontUrl = product.image_front_url || null;
  const imageBackUrl = product.image_nutrition_url || null;

  return {
    name,
    brand,
    category,
    servingSize,
    calories: calories ? Math.round(calories) : null,
    protein: protein ? Math.round(protein * 10) / 10 : null,
    carbs: carbs ? Math.round(carbs * 10) / 10 : null,
    fats: fats ? Math.round(fats * 10) / 10 : null,
    sugars: sugars ? Math.round(sugars * 10) / 10 : null,
    imagePrimaryUrl,
    imageFrontUrl,
    imageBackUrl,
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
      `${API_BASE_URL}/search?search_terms=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}&json=true`
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
