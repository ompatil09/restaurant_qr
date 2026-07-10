-- =====================================================
-- COMPLETE DATABASE SETUP - Food Ordering SaaS
-- Run this ONCE in Supabase SQL Editor
-- =====================================================
-- This includes:
-- 1. Tables with proper relationships
-- 2. RLS policies for security
-- 3. RPC functions for authentication
-- 4. Indexes for performance
-- 5. Triggers for automation
-- 6. Real-time configuration
-- =====================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TABLES
-- =====================================================

-- 1. Registration Requests
CREATE TABLE IF NOT EXISTS registration_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  address TEXT,
  restaurant_type TEXT NOT NULL,
  heard_from TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'verified', 'rejected')),
  contacted_at TIMESTAMPTZ,
  rejection_reason TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Restaurants
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_request_id UUID REFERENCES registration_requests(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_name TEXT,
  phone TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  city TEXT,
  address TEXT,
  restaurant_type TEXT,
  logo_url TEXT,
  qr_code_url TEXT,
  theme_color TEXT DEFAULT '#111827',
  welcome_message TEXT,
  upi_qr_url TEXT,
  admin_pin_hash TEXT,
  cgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 2.5,
  sgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 2.5,
  gst_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_plan TEXT NOT NULL DEFAULT 'free_trial' CHECK (subscription_plan IN ('free_trial', 'starter', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('active', 'blocked', 'trial')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  internal_notes TEXT,
  block_reason TEXT,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tables (QR tokens map public URLs to private table numbers)
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

-- 4. Users (Restaurant owners & staff)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  temp_password BOOLEAN NOT NULL DEFAULT TRUE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, name)
);

-- 6. Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
  category TEXT,
  name TEXT NOT NULL,
  description TEXT,
  base_price DECIMAL(10, 2) NOT NULL CHECK (base_price >= 0),
  image_url TEXT,
  food_type TEXT NOT NULL DEFAULT 'veg' CHECK (food_type IN ('veg', 'non_veg', 'egg', 'jain')),
  is_best_seller BOOLEAN NOT NULL DEFAULT FALSE,
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  tag_label TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  sizes JSONB DEFAULT '[]'::jsonb,
  addons JSONB DEFAULT '[]'::jsonb,
  tags TEXT[] DEFAULT '{}',
  prep_time_minutes INTEGER,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('qr', 'counter', 'phone', 'table')),
  table_number TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  items JSONB NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
  tax DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  discount DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'preparing', 'ready', 'served', 'cancelled')),
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
  payment_transaction_id TEXT,
  customer_notes TEXT,
  internal_notes TEXT,
  accepted_at TIMESTAMPTZ,
  preparing_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  kot_printed_at TIMESTAMPTZ,
  bill_printed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, order_number)
);

-- 8. Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Notifications (optional)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- IDEMPOTENT UPGRADES FOR EXISTING PROJECTS
-- =====================================================
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#111827';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS admin_pin_hash TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 2.5;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 2.5;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gst_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

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

NOTIFY pgrst, 'reload schema';

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS food_type TEXT NOT NULL DEFAULT 'veg';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_best_seller BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tag_label TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'menu_items_food_type_check'
  ) THEN
    ALTER TABLE menu_items
      ADD CONSTRAINT menu_items_food_type_check
      CHECK (food_type IN ('veg', 'non_veg', 'egg', 'jain'));
  END IF;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS kot_printed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bill_printed_at TIMESTAMPTZ;

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

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_registration_requests_status ON registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_registration_requests_created_at ON registration_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON restaurants(status);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_token ON tables(table_token);
CREATE INDEX IF NOT EXISTS idx_tables_active_token ON tables(restaurant_id, table_token, is_active);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_restaurant_id ON users(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant_id ON menu_categories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_available ON menu_items(restaurant_id, is_available);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created_at ON orders(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_table_created_at ON orders(restaurant_id, table_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created_at ON orders(restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- =====================================================
-- AUTO-UPDATE TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_registration_requests_updated_at ON registration_requests;
CREATE TRIGGER update_registration_requests_updated_at BEFORE UPDATE ON registration_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_restaurants_updated_at ON restaurants;
CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tables_updated_at ON tables;
CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_menu_categories_updated_at ON menu_categories;
CREATE TRIGGER update_menu_categories_updated_at BEFORE UPDATE ON menu_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_menu_items_updated_at ON menu_items;
CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_users_updated_at ON admin_users;
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- AUTO-GENERATE ORDER NUMBERS
-- =====================================================
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  today_date TEXT;
  order_count INTEGER;
BEGIN
  today_date := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
  
  SELECT COUNT(*) + 1 INTO order_count
  FROM orders
  WHERE restaurant_id = NEW.restaurant_id
    AND DATE(created_at) = CURRENT_DATE;
  
  NEW.order_number := today_date || '-' || LPAD(order_count::TEXT, 3, '0');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number ON orders;
CREATE TRIGGER set_order_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- =====================================================
-- RPC FUNCTIONS (Bypass RLS for authentication)
-- =====================================================

-- Admin Login
CREATE OR REPLACE FUNCTION admin_login(
  p_email TEXT,
  p_password_hash TEXT
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.email, au.name
  FROM admin_users au
  WHERE au.email = LOWER(p_email)
    AND au.password_hash = p_password_hash;
END;
$$;

-- Restaurant Login
CREATE OR REPLACE FUNCTION restaurant_login(
  p_email TEXT,
  p_password_hash TEXT
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  role TEXT,
  restaurant_id UUID,
  temp_password BOOLEAN,
  restaurant_name TEXT,
  restaurant_slug TEXT,
  restaurant_is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    u.role,
    u.restaurant_id,
    u.temp_password,
    r.name as restaurant_name,
    r.slug as restaurant_slug,
    r.is_active as restaurant_is_active
  FROM users u
  LEFT JOIN restaurants r ON r.id = u.restaurant_id
  WHERE u.email = LOWER(p_email)
    AND u.password_hash = p_password_hash;
END;
$$;

-- Create Restaurant (Admin function)
CREATE OR REPLACE FUNCTION admin_create_restaurant(
  p_request_id UUID,
  p_restaurant_name TEXT,
  p_slug TEXT,
  p_owner_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_city TEXT,
  p_address TEXT,
  p_subscription_plan TEXT,
  p_password_hash TEXT,
  p_internal_notes TEXT
)
RETURNS TABLE (
  restaurant_id UUID,
  user_id UUID,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_restaurant_id UUID;
  v_user_id UUID;
  v_email TEXT := LOWER(TRIM(p_email));
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Email is required'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM registration_requests
    WHERE id = p_request_id
      AND status = 'verified'
  ) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Registration request has already been approved'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM restaurants WHERE LOWER(email) = v_email) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'This email is already used by an existing restaurant account. Use a different email address or manage the existing restaurant.'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE LOWER(email) = v_email) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'This email is already used by an existing restaurant account. Use a different email address or manage the existing restaurant.'::TEXT;
    RETURN;
  END IF;

  INSERT INTO restaurants (
    registration_request_id, name, slug, owner_name, phone, email,
    city, address, subscription_plan, status, is_active
  ) VALUES (
    p_request_id, p_restaurant_name, p_slug, p_owner_name, p_phone, v_email,
    p_city, p_address, p_subscription_plan, 'active', TRUE
  )
  RETURNING id INTO v_restaurant_id;

  INSERT INTO users (restaurant_id, email, password_hash, temp_password, role)
  VALUES (v_restaurant_id, v_email, p_password_hash, TRUE, 'owner')
  RETURNING id INTO v_user_id;

  UPDATE registration_requests
  SET status = 'verified', contacted_at = NOW(), internal_notes = p_internal_notes
  WHERE id = p_request_id;

  RETURN QUERY SELECT v_restaurant_id, v_user_id, TRUE, 'Restaurant created successfully'::TEXT;

EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'This email is already used by an existing restaurant account. Use a different email address or manage the existing restaurant.'::TEXT;
  WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, SQLERRM;
END;
$$;

-- Toggle Restaurant Status (Admin function)
CREATE OR REPLACE FUNCTION admin_toggle_restaurant_status(
  p_restaurant_id UUID,
  p_is_active BOOLEAN,
  p_block_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE restaurants
  SET 
    is_active = p_is_active,
    status = CASE WHEN p_is_active THEN 'active' ELSE 'blocked' END,
    block_reason = p_block_reason
  WHERE id = p_restaurant_id;
  RETURN TRUE;
END;
$$;

-- Reject Registration Request (Admin function)
CREATE OR REPLACE FUNCTION admin_reject_request(
  p_request_id UUID,
  p_rejection_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE registration_requests
  SET 
    status = 'rejected',
    rejection_reason = p_rejection_reason,
    contacted_at = NOW()
  WHERE id = p_request_id;
  RETURN TRUE;
END;
$$;

-- Validate public QR ordering context without exposing table-token lists.
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
      'theme_color', v_restaurant.theme_color,
      'welcome_message', v_restaurant.welcome_message,
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

-- Safe public customer order creation. The client supplies no trusted table,
-- restaurant, price, subtotal, tax, or total values.
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

CREATE OR REPLACE FUNCTION restaurant_user_can_manage(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM users u
    JOIN restaurants r ON r.id = u.restaurant_id
    WHERE u.id = p_user_id
      AND u.restaurant_id = p_restaurant_id
      AND u.is_active = TRUE
      AND r.is_active = TRUE
      AND r.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION restaurant_create_table(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_table_number TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table tables%ROWTYPE;
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  INSERT INTO tables (restaurant_id, table_number)
  VALUES (p_restaurant_id, TRIM(p_table_number))
  RETURNING * INTO v_table;

  RETURN to_jsonb(v_table);
END;
$$;

CREATE OR REPLACE FUNCTION restaurant_list_tables(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tables JSONB;
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
  INTO v_tables
  FROM tables t
  WHERE t.restaurant_id = p_restaurant_id;

  RETURN v_tables;
END;
$$;

CREATE OR REPLACE FUNCTION restaurant_update_table(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_table_id UUID,
  p_table_number TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table tables%ROWTYPE;
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  UPDATE tables
  SET
    table_number = COALESCE(NULLIF(TRIM(p_table_number), ''), table_number),
    is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_table_id
    AND restaurant_id = p_restaurant_id
  RETURNING * INTO v_table;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found';
  END IF;

  RETURN to_jsonb(v_table);
END;
$$;

CREATE OR REPLACE FUNCTION restaurant_regenerate_table_token(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table tables%ROWTYPE;
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  UPDATE tables
  SET table_token = 'tbl_' || encode(gen_random_bytes(16), 'hex'),
      is_active = TRUE
  WHERE id = p_table_id
    AND restaurant_id = p_restaurant_id
  RETURNING * INTO v_table;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found';
  END IF;

  RETURN to_jsonb(v_table);
END;
$$;

CREATE OR REPLACE FUNCTION restaurant_update_order_status(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_order_id UUID,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  IF p_status NOT IN ('new', 'accepted', 'preparing', 'ready', 'served', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid order status';
  END IF;

  UPDATE orders
  SET status = p_status,
      accepted_at = CASE WHEN p_status = 'accepted' THEN NOW() ELSE accepted_at END,
      preparing_at = CASE WHEN p_status = 'preparing' THEN NOW() ELSE preparing_at END,
      ready_at = CASE WHEN p_status = 'ready' THEN NOW() ELSE ready_at END,
      completed_at = CASE WHEN p_status = 'served' THEN NOW() ELSE completed_at END,
      cancelled_at = CASE WHEN p_status = 'cancelled' THEN NOW() ELSE cancelled_at END
  WHERE id = p_order_id
    AND restaurant_id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION restaurant_list_orders(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders JSONB;
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO v_orders
  FROM orders o
  WHERE o.restaurant_id = p_restaurant_id;

  RETURN v_orders;
END;
$$;

CREATE OR REPLACE FUNCTION restaurant_list_menu_items(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items JSONB;
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(mi) ORDER BY mi.created_at DESC), '[]'::jsonb)
  INTO v_items
  FROM menu_items mi
  WHERE mi.restaurant_id = p_restaurant_id;

  RETURN v_items;
END;
$$;

CREATE OR REPLACE FUNCTION restaurant_upsert_menu_item(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_item_id UUID,
  p_item JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item menu_items%ROWTYPE;
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  IF p_item_id IS NULL THEN
    INSERT INTO menu_items (
      restaurant_id,
      name,
      description,
      category,
      base_price,
      image_url,
      food_type,
      is_best_seller,
      is_recommended,
      tag_label,
      is_available,
      sizes,
      addons
    ) VALUES (
      p_restaurant_id,
      NULLIF(TRIM(p_item->>'name'), ''),
      NULLIF(TRIM(p_item->>'description'), ''),
      NULLIF(TRIM(p_item->>'category'), ''),
      COALESCE((p_item->>'base_price')::NUMERIC, 0),
      NULLIF(TRIM(p_item->>'image_url'), ''),
      COALESCE(NULLIF(p_item->>'food_type', ''), 'veg'),
      COALESCE((p_item->>'is_best_seller')::BOOLEAN, FALSE),
      COALESCE((p_item->>'is_recommended')::BOOLEAN, FALSE),
      NULLIF(TRIM(p_item->>'tag_label'), ''),
      COALESCE((p_item->>'is_available')::BOOLEAN, TRUE),
      COALESCE(p_item->'sizes', '[]'::jsonb),
      COALESCE(p_item->'addons', '[]'::jsonb)
    )
    RETURNING * INTO v_item;
  ELSE
    UPDATE menu_items
    SET
      name = COALESCE(NULLIF(TRIM(p_item->>'name'), ''), name),
      description = CASE WHEN p_item ? 'description' THEN NULLIF(TRIM(p_item->>'description'), '') ELSE description END,
      category = CASE WHEN p_item ? 'category' THEN NULLIF(TRIM(p_item->>'category'), '') ELSE category END,
      base_price = CASE WHEN p_item ? 'base_price' THEN (p_item->>'base_price')::NUMERIC ELSE base_price END,
      image_url = CASE WHEN p_item ? 'image_url' THEN NULLIF(TRIM(p_item->>'image_url'), '') ELSE image_url END,
      food_type = CASE WHEN p_item ? 'food_type' THEN COALESCE(NULLIF(p_item->>'food_type', ''), 'veg') ELSE food_type END,
      is_best_seller = CASE WHEN p_item ? 'is_best_seller' THEN (p_item->>'is_best_seller')::BOOLEAN ELSE is_best_seller END,
      is_recommended = CASE WHEN p_item ? 'is_recommended' THEN (p_item->>'is_recommended')::BOOLEAN ELSE is_recommended END,
      tag_label = CASE WHEN p_item ? 'tag_label' THEN NULLIF(TRIM(p_item->>'tag_label'), '') ELSE tag_label END,
      is_available = CASE WHEN p_item ? 'is_available' THEN (p_item->>'is_available')::BOOLEAN ELSE is_available END,
      sizes = CASE WHEN p_item ? 'sizes' THEN COALESCE(p_item->'sizes', '[]'::jsonb) ELSE sizes END,
      addons = CASE WHEN p_item ? 'addons' THEN COALESCE(p_item->'addons', '[]'::jsonb) ELSE addons END
    WHERE id = p_item_id
      AND restaurant_id = p_restaurant_id
    RETURNING * INTO v_item;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Menu item not found';
    END IF;
  END IF;

  RETURN to_jsonb(v_item);
END;
$$;

CREATE OR REPLACE FUNCTION restaurant_delete_menu_item(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_item_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  DELETE FROM menu_items
  WHERE id = p_item_id
    AND restaurant_id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item not found';
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION restaurant_update_branding(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_branding JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant restaurants%ROWTYPE;
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  UPDATE restaurants
  SET
    logo_url = CASE WHEN p_branding ? 'logo_url' THEN NULLIF(TRIM(p_branding->>'logo_url'), '') ELSE logo_url END,
    theme_color = CASE WHEN p_branding ? 'theme_color' THEN COALESCE(NULLIF(TRIM(p_branding->>'theme_color'), ''), '#111827') ELSE theme_color END,
    welcome_message = CASE WHEN p_branding ? 'welcome_message' THEN NULLIF(TRIM(p_branding->>'welcome_message'), '') ELSE welcome_message END,
    upi_qr_url = CASE WHEN p_branding ? 'upi_qr_url' THEN NULLIF(TRIM(p_branding->>'upi_qr_url'), '') ELSE upi_qr_url END,
    cgst_rate = CASE WHEN p_branding ? 'cgst_rate' THEN (p_branding->>'cgst_rate')::NUMERIC ELSE cgst_rate END,
    sgst_rate = CASE WHEN p_branding ? 'sgst_rate' THEN (p_branding->>'sgst_rate')::NUMERIC ELSE sgst_rate END,
    gst_enabled = CASE WHEN p_branding ? 'gst_enabled' THEN (p_branding->>'gst_enabled')::BOOLEAN ELSE gst_enabled END,
    admin_pin_hash = CASE WHEN p_branding ? 'admin_pin_hash' THEN NULLIF(TRIM(p_branding->>'admin_pin_hash'), '') ELSE admin_pin_hash END
  WHERE id = p_restaurant_id
  RETURNING * INTO v_restaurant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  RETURN to_jsonb(v_restaurant);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION admin_login TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_login TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_create_restaurant TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_toggle_restaurant_status TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_reject_request TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_customer_order_context TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_customer_order TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_user_can_manage TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_list_tables TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_create_table TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_update_table TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_regenerate_table_token TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_update_order_status TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_list_orders TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_list_menu_items TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_upsert_menu_item TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_delete_menu_item TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_update_branding TO anon, authenticated;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Public policies (for customer ordering)
DROP POLICY IF EXISTS "Public can submit registration requests" ON registration_requests;
DROP POLICY IF EXISTS "Public can check registration request status" ON registration_requests;
DROP POLICY IF EXISTS "Public can view available menu items" ON menu_items;
DROP POLICY IF EXISTS "Public can view active restaurants" ON restaurants;
DROP POLICY IF EXISTS "Public can create orders" ON orders;
DROP POLICY IF EXISTS "Public can read orders" ON orders;

CREATE POLICY "Public can submit registration requests"
  ON registration_requests
  FOR INSERT
  WITH CHECK (status = 'pending');

CREATE POLICY "Public can check registration request status"
  ON registration_requests
  FOR SELECT
  USING (TRUE);

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

-- Restaurant policies (owners manage their data)
DROP POLICY IF EXISTS "Restaurant owners can view their restaurant" ON restaurants;
DROP POLICY IF EXISTS "Restaurant owners can update their restaurant" ON restaurants;
DROP POLICY IF EXISTS "Restaurant owners can manage tables" ON tables;
DROP POLICY IF EXISTS "Restaurant owners can manage menu" ON menu_items;
DROP POLICY IF EXISTS "Restaurant owners can manage orders" ON orders;

CREATE POLICY "Restaurant owners can view their restaurant" ON restaurants FOR SELECT USING (auth.uid()::text IN (SELECT id::text FROM users WHERE restaurant_id = restaurants.id));
CREATE POLICY "Restaurant owners can update their restaurant" ON restaurants FOR UPDATE USING (auth.uid()::text IN (SELECT id::text FROM users WHERE restaurant_id = restaurants.id));
CREATE POLICY "Restaurant owners can manage tables" ON tables FOR ALL USING (auth.uid()::text IN (SELECT id::text FROM users WHERE restaurant_id = tables.restaurant_id));
CREATE POLICY "Restaurant owners can manage menu" ON menu_items FOR ALL USING (auth.uid()::text IN (SELECT id::text FROM users WHERE restaurant_id = menu_items.restaurant_id));
CREATE POLICY "Restaurant owners can manage orders" ON orders FOR ALL USING (auth.uid()::text IN (SELECT id::text FROM users WHERE restaurant_id = orders.restaurant_id));

-- =====================================================
-- ENABLE REAL-TIME REPLICATION
-- =====================================================
ALTER TABLE registration_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE registration_requests;

ALTER TABLE restaurants REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE restaurants;

ALTER TABLE tables REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE tables;

ALTER TABLE menu_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;

ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- =====================================================
-- STORAGE FOR MENU / BRANDING IMAGES
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

DROP POLICY IF EXISTS "Public can read menu images" ON storage.objects;
DROP POLICY IF EXISTS "Anon can upload menu images" ON storage.objects;

CREATE POLICY "Public can read menu images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'menu-images');

CREATE POLICY "Anon can upload menu images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'menu-images');

-- =====================================================
-- INSERT DEFAULT ADMIN USER
-- =====================================================
-- Email: admin@foodorder.com
-- Password: admin123
-- Hash: SHA-256 of "admin123"
INSERT INTO admin_users (email, password_hash, name, is_super_admin)
VALUES ('admin@foodorder.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'System Admin', TRUE)
ON CONFLICT (email) DO NOTHING;

-- =====================================================
-- PART 4: PRODUCTION HARDENING
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created
ON orders (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status
ON orders (restaurant_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_table_created
ON orders (table_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_table_created
ON orders (restaurant_id, table_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant
ON menu_items (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_available
ON menu_items (restaurant_id, is_available);

CREATE INDEX IF NOT EXISTS idx_tables_restaurant_token
ON tables (restaurant_id, table_token);

CREATE INDEX IF NOT EXISTS idx_tables_restaurant_active
ON tables (restaurant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_users_restaurant_email
ON users (restaurant_id, email);

CREATE OR REPLACE FUNCTION restaurant_change_password(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_current_password_hash TEXT,
  p_new_password_hash TEXT,
  p_require_current_password BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
BEGIN
  IF p_new_password_hash IS NULL OR length(p_new_password_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid new password hash';
  END IF;

  SELECT *
  INTO v_user
  FROM users
  WHERE id = p_user_id
    AND restaurant_id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User session not found';
  END IF;

  IF p_require_current_password
    AND COALESCE(v_user.password_hash, '') <> COALESCE(p_current_password_hash, '') THEN
    RAISE EXCEPTION 'Current password is incorrect';
  END IF;

  UPDATE users
  SET password_hash = p_new_password_hash,
      temp_password = FALSE
  WHERE id = p_user_id
    AND restaurant_id = p_restaurant_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION restaurant_list_orders_range(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders JSONB;
BEGIN
  IF NOT restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this restaurant';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO v_orders
  FROM orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at < p_to);

  RETURN v_orders;
END;
$$;

CREATE OR REPLACE FUNCTION get_daily_sales_summary(
  p_restaurant_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_orders BIGINT,
  total_revenue NUMERIC,
  new_orders BIGINT,
  served_orders BIGINT,
  top_item_name TEXT,
  top_item_quantity BIGINT,
  most_active_table TEXT,
  most_active_table_orders BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH day_orders AS (
    SELECT *
    FROM orders
    WHERE restaurant_id = p_restaurant_id
      AND created_at >= p_date::timestamptz
      AND created_at < (p_date::timestamptz + INTERVAL '1 day')
  ),
  revenue_orders AS (
    SELECT *
    FROM day_orders
    WHERE status NOT IN ('cancelled', 'rejected')
  ),
  top_item AS (
    SELECT
      item->>'name' AS item_name,
      SUM(COALESCE((item->>'quantity')::int, 0)) AS quantity_sold
    FROM revenue_orders ro
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ro.items, '[]'::jsonb)) item
    GROUP BY item->>'name'
    ORDER BY quantity_sold DESC, item_name ASC
    LIMIT 1
  ),
  active_table AS (
    SELECT
      COALESCE(table_number, 'Counter') AS table_label,
      COUNT(*) AS table_orders
    FROM revenue_orders
    GROUP BY COALESCE(table_number, 'Counter')
    ORDER BY table_orders DESC, table_label ASC
    LIMIT 1
  )
  SELECT
    (SELECT COUNT(*) FROM day_orders) AS total_orders,
    COALESCE((SELECT SUM(COALESCE(total, subtotal, 0)) FROM revenue_orders), 0) AS total_revenue,
    (SELECT COUNT(*) FROM day_orders WHERE status IN ('new', 'pending')) AS new_orders,
    (SELECT COUNT(*) FROM day_orders WHERE status IN ('served', 'completed')) AS served_orders,
    (SELECT item_name FROM top_item) AS top_item_name,
    COALESCE((SELECT quantity_sold FROM top_item), 0) AS top_item_quantity,
    (SELECT table_label FROM active_table) AS most_active_table,
    COALESCE((SELECT table_orders FROM active_table), 0) AS most_active_table_orders;
$$;

CREATE OR REPLACE FUNCTION get_top_selling_items(
  p_restaurant_id UUID,
  p_days INT DEFAULT 1
)
RETURNS TABLE (
  item_name TEXT,
  quantity_sold BIGINT,
  revenue NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH range_orders AS (
    SELECT *
    FROM orders
    WHERE restaurant_id = p_restaurant_id
      AND created_at >= (date_trunc('day', now()) - ((GREATEST(p_days, 1) - 1) * INTERVAL '1 day'))
      AND status NOT IN ('cancelled', 'rejected')
  )
  SELECT
    item->>'name' AS item_name,
    SUM(COALESCE((item->>'quantity')::int, 0)) AS quantity_sold,
    SUM(
      COALESCE(
        NULLIF(item->>'item_total', '')::numeric,
        NULLIF(item->>'unit_price', '')::numeric * COALESCE((item->>'quantity')::int, 1),
        NULLIF(item->>'base_price', '')::numeric * COALESCE((item->>'quantity')::int, 1),
        0
      )
    ) AS revenue
  FROM range_orders ro
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ro.items, '[]'::jsonb)) item
  GROUP BY item->>'name'
  ORDER BY quantity_sold DESC, revenue DESC, item_name ASC
  LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION get_table_order_history(
  p_restaurant_id UUID,
  p_table_id UUID,
  p_days INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.table_id = p_table_id
    AND o.created_at >= (date_trunc('day', now()) - ((GREATEST(p_days, 1) - 1) * INTERVAL '1 day'));
$$;

GRANT EXECUTE ON FUNCTION restaurant_change_password TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_list_orders_range TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_daily_sales_summary TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_top_selling_items TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_table_order_history TO anon, authenticated;

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Database setup complete!';
  RAISE NOTICE '✓ Tables created with indexes and triggers';
  RAISE NOTICE '✓ RPC functions configured';
  RAISE NOTICE '✓ RLS policies enabled';
  RAISE NOTICE '✓ Real-time replication configured';
  RAISE NOTICE '';
  RAISE NOTICE 'Admin Login:';
  RAISE NOTICE '  Email: admin@foodorder.com';
  RAISE NOTICE '  Password: admin123';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Enable real-time in Supabase Dashboard > Database > Replication';
END $$;
