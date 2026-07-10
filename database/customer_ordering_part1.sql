-- =====================================================
-- PART 1 MIGRATION: Secure customer table QR ordering
-- Run this in Supabase SQL Editor for an existing project.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  table_token TEXT NOT NULL DEFAULT ('tbl_' || encode(gen_random_bytes(16), 'hex')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, table_number),
  UNIQUE(table_token),
  CHECK (table_token ~ '^tbl_[A-Za-z0-9_-]{16,}$')
);

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'menu_categories'
      AND column_name = 'display_order'
  ) THEN
    EXECUTE 'UPDATE menu_categories SET sort_order = display_order';
  END IF;
END $$;

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE orders SET status = 'new' WHERE status = 'pending';
UPDATE orders SET status = 'served' WHERE status = 'completed';
UPDATE orders SET status = 'cancelled' WHERE status = 'rejected';
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'new';

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  FOR v_constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'orders'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%payment_status%'
  LOOP
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', v_constraint_name);
  END LOOP;
END $$;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('new', 'accepted', 'preparing', 'ready', 'served', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_token ON tables(table_token);
CREATE INDEX IF NOT EXISTS idx_tables_active_token ON tables(restaurant_id, table_token, is_active);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tables_updated_at ON tables;
CREATE TRIGGER update_tables_updated_at
  BEFORE UPDATE ON tables
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION get_customer_order_context(
  p_restaurant_slug TEXT,
  p_table_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant restaurants%ROWTYPE;
  v_table tables%ROWTYPE;
  v_menu_items JSONB;
BEGIN
  SELECT *
  INTO v_restaurant
  FROM restaurants
  WHERE slug = p_restaurant_slug
    AND is_active = TRUE
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found or inactive';
  END IF;

  SELECT *
  INTO v_table
  FROM tables
  WHERE restaurant_id = v_restaurant.id
    AND table_token = p_table_token
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table token is invalid or inactive';
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(mi) ORDER BY COALESCE(mi.category, ''), mi.name),
    '[]'::jsonb
  )
  INTO v_menu_items
  FROM menu_items mi
  WHERE mi.restaurant_id = v_restaurant.id
    AND mi.is_available = TRUE;

  RETURN jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', v_restaurant.id,
      'name', v_restaurant.name,
      'slug', v_restaurant.slug,
      'logo_url', v_restaurant.logo_url,
      'is_active', v_restaurant.is_active
    ),
    'table', jsonb_build_object(
      'id', v_table.id,
      'table_number', v_table.table_number,
      'is_active', v_table.is_active
    ),
    'menu_items', v_menu_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION create_customer_order(
  p_restaurant_slug TEXT,
  p_table_token TEXT,
  p_items JSONB,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant restaurants%ROWTYPE;
  v_table tables%ROWTYPE;
  v_input JSONB;
  v_item menu_items%ROWTYPE;
  v_quantity INTEGER;
  v_size_name TEXT;
  v_selected_size JSONB;
  v_selected_addons JSONB;
  v_addon_name TEXT;
  v_addon JSONB;
  v_unit_price NUMERIC(10, 2);
  v_line_total NUMERIC(10, 2);
  v_subtotal NUMERIC(10, 2) := 0;
  v_tax NUMERIC(10, 2) := 0;
  v_total NUMERIC(10, 2) := 0;
  v_order_items JSONB := '[]'::jsonb;
  v_order_id UUID;
  v_order_number TEXT;
BEGIN
  SELECT *
  INTO v_restaurant
  FROM restaurants
  WHERE slug = p_restaurant_slug
    AND is_active = TRUE
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found or inactive';
  END IF;

  SELECT *
  INTO v_table
  FROM tables
  WHERE restaurant_id = v_restaurant.id
    AND table_token = p_table_token
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table token is invalid or inactive';
  END IF;

  IF p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  FOR v_input IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_input->>'quantity')::INTEGER, 0);

    IF v_quantity < 1 OR v_quantity > 99 THEN
      RAISE EXCEPTION 'Invalid item quantity';
    END IF;

    SELECT *
    INTO v_item
    FROM menu_items
    WHERE id = (v_input->>'menu_item_id')::UUID
      AND restaurant_id = v_restaurant.id
      AND is_available = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'One or more menu items are unavailable';
    END IF;

    v_unit_price := v_item.base_price;
    v_selected_size := NULL;
    v_size_name := NULLIF(v_input->>'selected_size_name', '');

    IF jsonb_array_length(COALESCE(v_item.sizes, '[]'::jsonb)) > 0 THEN
      IF v_size_name IS NULL THEN
        RAISE EXCEPTION 'A size is required for %', v_item.name;
      END IF;

      SELECT size_option
      INTO v_selected_size
      FROM jsonb_array_elements(v_item.sizes) AS size_option
      WHERE size_option->>'name' = v_size_name
      LIMIT 1;

      IF v_selected_size IS NULL THEN
        RAISE EXCEPTION 'Invalid size selected for %', v_item.name;
      END IF;

      v_unit_price := (v_selected_size->>'price')::NUMERIC;
    END IF;

    v_selected_addons := '[]'::jsonb;

    FOR v_addon_name IN
      SELECT DISTINCT value
      FROM jsonb_array_elements_text(
        COALESCE(v_input->'selected_addon_names', '[]'::jsonb)
      )
    LOOP
      SELECT addon_option
      INTO v_addon
      FROM jsonb_array_elements(COALESCE(v_item.addons, '[]'::jsonb)) AS addon_option
      WHERE addon_option->>'name' = v_addon_name
      LIMIT 1;

      IF v_addon IS NULL THEN
        RAISE EXCEPTION 'Invalid add-on selected for %', v_item.name;
      END IF;

      v_selected_addons := v_selected_addons || jsonb_build_array(v_addon);
      v_unit_price := v_unit_price + (v_addon->>'price')::NUMERIC;
      v_addon := NULL;
    END LOOP;

    v_line_total := ROUND(v_unit_price * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_order_items := v_order_items || jsonb_build_array(
      jsonb_build_object(
        'menu_item_id', v_item.id,
        'name', v_item.name,
        'quantity', v_quantity,
        'base_price', v_item.base_price,
        'unit_price', v_unit_price,
        'selected_size', v_selected_size,
        'selected_addons', v_selected_addons,
        'item_total', v_line_total,
        'special_instructions', NULLIF(v_input->>'special_instructions', '')
      )
    );
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);
  v_tax := ROUND(v_subtotal * 0.05, 2);
  v_total := ROUND(v_subtotal + v_tax, 2);

  INSERT INTO orders (
    restaurant_id,
    table_id,
    table_number,
    order_type,
    customer_name,
    customer_phone,
    items,
    subtotal,
    tax,
    total,
    status,
    customer_notes
  ) VALUES (
    v_restaurant.id,
    v_table.id,
    v_table.table_number,
    'qr',
    NULLIF(TRIM(p_customer_name), ''),
    NULLIF(TRIM(p_customer_phone), ''),
    v_order_items,
    v_subtotal,
    v_tax,
    v_total,
    'new',
    NULLIF(TRIM(p_customer_notes), '')
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'table_number', v_table.table_number,
    'subtotal', v_subtotal,
    'tax', v_tax,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_order_context TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_customer_order TO anon, authenticated;

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view available menu items" ON menu_items;
DROP POLICY IF EXISTS "Public can view active restaurants" ON restaurants;
DROP POLICY IF EXISTS "Public can create orders" ON orders;
DROP POLICY IF EXISTS "Public can read orders" ON orders;

CREATE POLICY "Public can view active restaurants"
  ON restaurants
  FOR SELECT
  USING (is_active = TRUE AND status = 'active');

CREATE POLICY "Public can view available menu items"
  ON menu_items
  FOR SELECT
  USING (
    is_available = TRUE
    AND EXISTS (
      SELECT 1
      FROM restaurants r
      WHERE r.id = menu_items.restaurant_id
        AND r.is_active = TRUE
        AND r.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Restaurant owners can manage tables" ON tables;
CREATE POLICY "Restaurant owners can manage tables"
  ON tables
  FOR ALL
  USING (
    auth.uid()::text IN (
      SELECT id::text FROM users WHERE restaurant_id = tables.restaurant_id
    )
  );

ALTER TABLE menu_items REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- Example table setup after migration:
-- INSERT INTO tables (restaurant_id, table_number)
-- SELECT id, '07' FROM restaurants WHERE slug = 'spice-cafe';
--
-- QR URL format:
-- /order/spice-cafe/<table_token returned from tables>
