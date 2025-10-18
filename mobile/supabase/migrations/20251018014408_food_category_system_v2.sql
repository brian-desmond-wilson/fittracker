-- Food Category System Migration (v2 - Handle user_id constraint)
-- This migration updates the existing category system and adds subcategories

-- Drop the user_id constraint from food_categories (make it nullable)
ALTER TABLE food_categories ALTER COLUMN user_id DROP NOT NULL;

-- Add slug column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'food_categories' AND column_name = 'slug'
  ) THEN
    ALTER TABLE food_categories ADD COLUMN slug TEXT;
  END IF;
END $$;

-- Add display_order column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'food_categories' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE food_categories ADD COLUMN display_order INTEGER;
  END IF;
END $$;

-- Clear existing categories and re-seed with new structure
TRUNCATE TABLE food_categories CASCADE;

-- Re-insert categories with slugs and display order (no user_id since they're global)
INSERT INTO food_categories (name, slug, display_order) VALUES
  ('All Products', 'all-products', 1),
  ('Produce', 'produce', 2),
  ('Dairy, Cheese & Eggs', 'dairy-cheese-eggs', 3),
  ('Meat & Seafood', 'meat-seafood', 4),
  ('Breads & Bakery', 'breads-bakery', 5),
  ('Frozen', 'frozen', 6),
  ('Deli & Prepared Foods', 'deli-prepared', 7),
  ('Beverages', 'beverages', 8),
  ('Snacks', 'snacks', 9),
  ('Pantry', 'pantry', 10),
  ('Breakfast Foods', 'breakfast', 11),
  ('Out of Stock', 'out-of-stock', 12);

-- Create food_subcategories table
CREATE TABLE IF NOT EXISTS food_subcategories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES food_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(category_id, slug)
);

-- Create food_inventory_category_map table (many-to-many)
CREATE TABLE IF NOT EXISTS food_inventory_category_map (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  food_inventory_id UUID NOT NULL REFERENCES food_inventory(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES food_categories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(food_inventory_id, category_id)
);

-- Create food_inventory_subcategory_map table (many-to-many)
CREATE TABLE IF NOT EXISTS food_inventory_subcategory_map (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  food_inventory_id UUID NOT NULL REFERENCES food_inventory(id) ON DELETE CASCADE,
  subcategory_id UUID NOT NULL REFERENCES food_subcategories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(food_inventory_id, subcategory_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_food_subcategories_category_id ON food_subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_food_inventory_category_map_food_id ON food_inventory_category_map(food_inventory_id);
CREATE INDEX IF NOT EXISTS idx_food_inventory_category_map_category_id ON food_inventory_category_map(category_id);
CREATE INDEX IF NOT EXISTS idx_food_inventory_category_map_user_id ON food_inventory_category_map(user_id);
CREATE INDEX IF NOT EXISTS idx_food_inventory_subcategory_map_food_id ON food_inventory_subcategory_map(food_inventory_id);
CREATE INDEX IF NOT EXISTS idx_food_inventory_subcategory_map_subcategory_id ON food_inventory_subcategory_map(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_food_inventory_subcategory_map_user_id ON food_inventory_subcategory_map(user_id);

-- Enable RLS on all tables
ALTER TABLE food_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_inventory_category_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_inventory_subcategory_map ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Everyone can read food_categories" ON food_categories;
DROP POLICY IF EXISTS "Everyone can read food_subcategories" ON food_subcategories;
DROP POLICY IF EXISTS "Users can view their own category mappings" ON food_inventory_category_map;
DROP POLICY IF EXISTS "Users can insert their own category mappings" ON food_inventory_category_map;
DROP POLICY IF EXISTS "Users can delete their own category mappings" ON food_inventory_category_map;
DROP POLICY IF EXISTS "Users can view their own subcategory mappings" ON food_inventory_subcategory_map;
DROP POLICY IF EXISTS "Users can insert their own subcategory mappings" ON food_inventory_subcategory_map;
DROP POLICY IF EXISTS "Users can delete their own subcategory mappings" ON food_inventory_subcategory_map;

-- RLS Policies for food_categories (public read, no write)
CREATE POLICY "Everyone can read food_categories"
  ON food_categories FOR SELECT
  USING (true);

-- RLS Policies for food_subcategories (public read, no write)
CREATE POLICY "Everyone can read food_subcategories"
  ON food_subcategories FOR SELECT
  USING (true);

-- RLS Policies for food_inventory_category_map
CREATE POLICY "Users can view their own category mappings"
  ON food_inventory_category_map FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own category mappings"
  ON food_inventory_category_map FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own category mappings"
  ON food_inventory_category_map FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for food_inventory_subcategory_map
CREATE POLICY "Users can view their own subcategory mappings"
  ON food_inventory_subcategory_map FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subcategory mappings"
  ON food_inventory_subcategory_map FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subcategory mappings"
  ON food_inventory_subcategory_map FOR DELETE
  USING (auth.uid() = user_id);

-- Seed data: Insert subcategories for Produce
INSERT INTO food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Vegetables', 'vegetables', 1 FROM food_categories WHERE slug = 'produce'
UNION ALL
SELECT id, 'Packaged Produce', 'packaged-produce', 2 FROM food_categories WHERE slug = 'produce'
UNION ALL
SELECT id, 'Fruits', 'fruits', 3 FROM food_categories WHERE slug = 'produce'
UNION ALL
SELECT id, 'Onions', 'onions', 4 FROM food_categories WHERE slug = 'produce'
UNION ALL
SELECT id, 'Citrus Fruits', 'citrus-fruits', 5 FROM food_categories WHERE slug = 'produce'
UNION ALL
SELECT id, 'Dried Fruits & Vegetables', 'dried-fruits-vegetables', 6 FROM food_categories WHERE slug = 'produce'
UNION ALL
SELECT id, 'Tofu & Plant-Based Proteins', 'tofu-plant-based', 7 FROM food_categories WHERE slug = 'produce'
UNION ALL
SELECT id, 'Herbs', 'herbs', 8 FROM food_categories WHERE slug = 'produce'
UNION ALL
SELECT id, 'Berries', 'berries', 9 FROM food_categories WHERE slug = 'produce';

-- Seed data: Dairy, Cheese & Eggs subcategories
INSERT INTO food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Cheese', 'cheese', 1 FROM food_categories WHERE slug = 'dairy-cheese-eggs'
UNION ALL
SELECT id, 'Yogurt', 'yogurt', 2 FROM food_categories WHERE slug = 'dairy-cheese-eggs'
UNION ALL
SELECT id, 'Milk & Cream', 'milk-cream', 3 FROM food_categories WHERE slug = 'dairy-cheese-eggs'
UNION ALL
SELECT id, 'Non-Dairy', 'non-dairy', 4 FROM food_categories WHERE slug = 'dairy-cheese-eggs'
UNION ALL
SELECT id, 'Butter', 'butter', 5 FROM food_categories WHERE slug = 'dairy-cheese-eggs'
UNION ALL
SELECT id, 'Snack Packs', 'snack-packs', 6 FROM food_categories WHERE slug = 'dairy-cheese-eggs'
UNION ALL
SELECT id, 'Creamed Cheeses', 'creamed-cheeses', 7 FROM food_categories WHERE slug = 'dairy-cheese-eggs'
UNION ALL
SELECT id, 'Eggs', 'eggs', 8 FROM food_categories WHERE slug = 'dairy-cheese-eggs'
UNION ALL
SELECT id, 'Cottage Cheese', 'cottage-cheese', 9 FROM food_categories WHERE slug = 'dairy-cheese-eggs'
UNION ALL
SELECT id, 'Plant-Based Cheese', 'plant-based-cheese', 10 FROM food_categories WHERE slug = 'dairy-cheese-eggs';

-- Seed data: Meat & Seafood subcategories
INSERT INTO food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Frozen Meat', 'frozen-meat', 1 FROM food_categories WHERE slug = 'meat-seafood'
UNION ALL
SELECT id, 'Sausages', 'sausages', 2 FROM food_categories WHERE slug = 'meat-seafood'
UNION ALL
SELECT id, 'Meat Substitutes', 'meat-substitutes', 3 FROM food_categories WHERE slug = 'meat-seafood'
UNION ALL
SELECT id, 'Bacon', 'bacon', 4 FROM food_categories WHERE slug = 'meat-seafood'
UNION ALL
SELECT id, 'Frozen Seafood', 'frozen-seafood', 5 FROM food_categories WHERE slug = 'meat-seafood'
UNION ALL
SELECT id, 'Hot Dogs', 'hot-dogs', 6 FROM food_categories WHERE slug = 'meat-seafood'
UNION ALL
SELECT id, 'Beef', 'beef', 7 FROM food_categories WHERE slug = 'meat-seafood'
UNION ALL
SELECT id, 'Chicken', 'chicken', 8 FROM food_categories WHERE slug = 'meat-seafood'
UNION ALL
SELECT id, 'Seafood', 'seafood', 9 FROM food_categories WHERE slug = 'meat-seafood'
UNION ALL
SELECT id, 'Turkey', 'turkey', 10 FROM food_categories WHERE slug = 'meat-seafood'
UNION ALL
SELECT id, 'Pork', 'pork', 11 FROM food_categories WHERE slug = 'meat-seafood';

-- Seed data: Breads & Bakery subcategories
INSERT INTO food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Cookies', 'cookies', 1 FROM food_categories WHERE slug = 'breads-bakery'
UNION ALL
SELECT id, 'Breads', 'breads', 2 FROM food_categories WHERE slug = 'breads-bakery'
UNION ALL
SELECT id, 'Flatbreads & Tortillas', 'flatbreads-tortillas', 3 FROM food_categories WHERE slug = 'breads-bakery'
UNION ALL
SELECT id, 'Refrigerated Doughs', 'refrigerated-doughs', 4 FROM food_categories WHERE slug = 'breads-bakery'
UNION ALL
SELECT id, 'Breakfast Bakery', 'breakfast-bakery', 5 FROM food_categories WHERE slug = 'breads-bakery'
UNION ALL
SELECT id, 'Rolls & Buns', 'rolls-buns', 6 FROM food_categories WHERE slug = 'breads-bakery'
UNION ALL
SELECT id, 'Cakes', 'cakes', 7 FROM food_categories WHERE slug = 'breads-bakery'
UNION ALL
SELECT id, 'Bakery Desserts', 'bakery-desserts', 8 FROM food_categories WHERE slug = 'breads-bakery'
UNION ALL
SELECT id, 'Bagels', 'bagels', 9 FROM food_categories WHERE slug = 'breads-bakery'
UNION ALL
SELECT id, 'Pizza Crusts', 'pizza-crusts', 10 FROM food_categories WHERE slug = 'breads-bakery';

-- Seed data: Frozen subcategories
INSERT INTO food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Meals & Entrees', 'meals-entrees', 1 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Ice Cream', 'ice-cream', 2 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Frozen Vegetables', 'frozen-vegetables', 3 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Frozen Meats', 'frozen-meats', 4 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Frozen Pizzas', 'frozen-pizzas', 5 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Breakfast Foods', 'breakfast-foods', 6 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Appetizers & Snacks', 'appetizers-snacks', 7 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Desserts & Toppings', 'desserts-toppings', 8 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Frozen Seafood', 'frozen-seafood', 9 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Potatoes & Onion Rings', 'potatoes-onion-rings', 10 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Bread & Dough', 'bread-dough', 11 FROM food_categories WHERE slug = 'frozen'
UNION ALL
SELECT id, 'Frozen Fruits', 'frozen-fruits', 12 FROM food_categories WHERE slug = 'frozen';

-- Seed data: Deli & Prepared Foods subcategories
INSERT INTO food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Deli Meat & Cheese', 'deli-meat-cheese', 1 FROM food_categories WHERE slug = 'deli-prepared'
UNION ALL
SELECT id, 'Dips, Salsas & Spreads', 'dips-salsas-spreads', 2 FROM food_categories WHERE slug = 'deli-prepared'
UNION ALL
SELECT id, 'Snack Packs', 'snack-packs', 3 FROM food_categories WHERE slug = 'deli-prepared'
UNION ALL
SELECT id, 'Fresh Prepared Entrees', 'fresh-prepared-entrees', 4 FROM food_categories WHERE slug = 'deli-prepared'
UNION ALL
SELECT id, 'Fresh Prepared Deli Salads', 'fresh-prepared-deli-salads', 5 FROM food_categories WHERE slug = 'deli-prepared'
UNION ALL
SELECT id, 'Pasta & Sauces', 'pasta-sauces', 6 FROM food_categories WHERE slug = 'deli-prepared'
UNION ALL
SELECT id, 'Sandwiches & Wraps', 'sandwiches-wraps', 7 FROM food_categories WHERE slug = 'deli-prepared'
UNION ALL
SELECT id, 'Soups, Stews & Chili', 'soups-stews-chili', 8 FROM food_categories WHERE slug = 'deli-prepared';

-- Seed data: Beverages subcategories
INSERT INTO food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Tea', 'tea', 1 FROM food_categories WHERE slug = 'beverages'
UNION ALL
SELECT id, 'Juices', 'juices', 2 FROM food_categories WHERE slug = 'beverages'
UNION ALL
SELECT id, 'Coffee', 'coffee', 3 FROM food_categories WHERE slug = 'beverages'
UNION ALL
SELECT id, 'Capsules & Pods', 'capsules-pods', 4 FROM food_categories WHERE slug = 'beverages'
UNION ALL
SELECT id, 'Energy Drinks', 'energy-drinks', 5 FROM food_categories WHERE slug = 'beverages'
UNION ALL
SELECT id, 'Water', 'water', 6 FROM food_categories WHERE slug = 'beverages'
UNION ALL
SELECT id, 'Powdered Drink Mixes', 'powdered-drink-mixes', 7 FROM food_categories WHERE slug = 'beverages'
UNION ALL
SELECT id, 'Soft Drinks', 'soft-drinks', 8 FROM food_categories WHERE slug = 'beverages'
UNION ALL
SELECT id, 'Sports Drinks', 'sports-drinks', 9 FROM food_categories WHERE slug = 'beverages'
UNION ALL
SELECT id, 'Protein Drinks', 'protein-drinks', 10 FROM food_categories WHERE slug = 'beverages'
UNION ALL
SELECT id, 'Coffee Substitutes', 'coffee-substitutes', 11 FROM food_categories WHERE slug = 'beverages';

-- Seed data: Snacks subcategories
INSERT INTO food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Candy & Chocolate', 'candy-chocolate', 1 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Chips', 'chips', 2 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Bars', 'bars', 3 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Cookies', 'cookies', 4 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Nuts & Seeds', 'nuts-seeds', 5 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Crackers', 'crackers', 6 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Puffed Snacks', 'puffed-snacks', 7 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Meat Snacks', 'meat-snacks', 8 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Fruit Snacks', 'fruit-snacks', 9 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Salsas, Dips & Spreads', 'salsas-dips-spreads', 10 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Cakes & Pastries', 'cakes-pastries', 11 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Snack & Trail Mixes', 'snack-trail-mixes', 12 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Applesauce & Fruitcups', 'applesauce-fruitcups', 13 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Dried Fruits & Raisins', 'dried-fruits-raisins', 14 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Pretzels', 'pretzels', 15 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Pudding & Gelatin', 'pudding-gelatin', 16 FROM food_categories WHERE slug = 'snacks'
UNION ALL
SELECT id, 'Ice Cream Cones & Toppings', 'ice-cream-cones-toppings', 17 FROM food_categories WHERE slug = 'snacks';

-- Seed data: Pantry subcategories
INSERT INTO food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Canned, Jarred & Packaged', 'canned-jarred-packaged', 1 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Cooking & Baking', 'cooking-baking', 2 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Sauces, Gravies & Marinades', 'sauces-gravies-marinades', 3 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Condiments & Salad Dressings', 'condiments-salad-dressings', 4 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Spices & Seasonings', 'spices-seasonings', 5 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Soups, Stocks & Broths', 'soups-stocks-broths', 6 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Olives, Pickles & Relishes', 'olives-pickles-relishes', 7 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Pasta & Noodles', 'pasta-noodles', 8 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Jams & Spreads', 'jams-spreads', 9 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Nuts & Seeds', 'nuts-seeds', 10 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Dried Grains & Rice', 'dried-grains-rice', 11 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Nut & Seed Butters', 'nut-seed-butters', 12 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Baking Mixes', 'baking-mixes', 13 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Oils & Vinegars', 'oils-vinegars', 14 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Flours & Meals', 'flours-meals', 15 FROM food_categories WHERE slug = 'pantry'
UNION ALL
SELECT id, 'Dried Beans, Lentils & Peas', 'dried-beans-lentils-peas', 16 FROM food_categories WHERE slug = 'pantry';

-- Seed data: Breakfast Foods subcategories
INSERT INTO food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Cereal', 'cereal', 1 FROM food_categories WHERE slug = 'breakfast'
UNION ALL
SELECT id, 'Oatmeal', 'oatmeal', 2 FROM food_categories WHERE slug = 'breakfast'
UNION ALL
SELECT id, 'Granola', 'granola', 3 FROM food_categories WHERE slug = 'breakfast'
UNION ALL
SELECT id, 'Breakfast Syrups & Toppings', 'breakfast-syrups-toppings', 4 FROM food_categories WHERE slug = 'breakfast'
UNION ALL
SELECT id, 'Toaster Pastries', 'toaster-pastries', 5 FROM food_categories WHERE slug = 'breakfast'
UNION ALL
SELECT id, 'Breakfast Biscuits', 'breakfast-biscuits', 6 FROM food_categories WHERE slug = 'breakfast';
