-- Part 6: subscription gating, password reset workflow, and auth/order fixes.
-- Run after database/security_hardening_part5.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE restaurants
    ADD CONSTRAINT restaurants_subscription_status_chk
    CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'unpaid', 'cancelled', 'inactive')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_customer_id ON restaurants(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_subscription_id ON restaurants(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_subscription_status ON restaurants(subscription_status);

CREATE OR REPLACE FUNCTION restaurant_subscription_allows_ordering(p_restaurant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_restaurant restaurants%ROWTYPE;
BEGIN
  SELECT * INTO v_restaurant
  FROM restaurants
  WHERE id = p_restaurant_id;

  IF NOT FOUND OR v_restaurant.is_active IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(v_restaurant.subscription_status, 'active') IN ('active', 'trialing') THEN
    RETURN TRUE;
  END IF;

  IF v_restaurant.subscription_status = 'past_due'
    AND v_restaurant.grace_until IS NOT NULL
    AND v_restaurant.grace_until > NOW() THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION restaurant_subscription_allows_ordering(UUID) TO anon, authenticated;

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  restaurant_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'used')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status_created
  ON password_reset_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_email
  ON password_reset_requests(lower(email));

ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can request password resets" ON password_reset_requests;
CREATE POLICY "Public can request password resets"
  ON password_reset_requests
  FOR INSERT
  TO anon
  WITH CHECK (status = 'pending');

-- The app still uses custom localStorage admin auth. This temporary policy keeps
-- the existing admin dashboard functional. Move admin auth to Supabase Auth or
-- server-side admin APIs before treating this as fully production-secure.
DROP POLICY IF EXISTS "Admin dashboard can view pending password resets" ON password_reset_requests;
CREATE POLICY "Admin dashboard can view pending password resets"
  ON password_reset_requests
  FOR SELECT
  TO anon
  USING (status = 'pending');

CREATE OR REPLACE FUNCTION request_password_reset(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_email TEXT;
  v_user users%ROWTYPE;
  v_restaurant restaurants%ROWTYPE;
  v_identifier_hash TEXT;
  v_limit RECORD;
BEGIN
  v_email := lower(trim(COALESCE(p_email, '')));
  IF length(v_email) > 254 OR v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RETURN TRUE;
  END IF;

  v_identifier_hash := encode(digest(v_email, 'sha256'), 'hex');
  SELECT * INTO v_limit FROM check_rate_limit('password_change', v_identifier_hash);
  IF NOT v_limit.allowed THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO v_user FROM users WHERE lower(email) = v_email AND is_active = TRUE LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_restaurant FROM restaurants WHERE id = v_user.restaurant_id LIMIT 1;
  END IF;

  INSERT INTO password_reset_requests(email, restaurant_id, restaurant_name, status)
  VALUES (
    v_email,
    CASE WHEN FOUND THEN v_user.restaurant_id ELSE NULL END,
    CASE WHEN v_restaurant.id IS NOT NULL THEN v_restaurant.name ELSE NULL END,
    'pending'
  );

  PERFORM record_rate_limit_attempt('password_change', v_identifier_hash, TRUE);
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION admin_approve_password_reset(
  p_request_id UUID,
  p_admin_id UUID,
  p_password_hash TEXT
)
RETURNS TABLE(success BOOLEAN, email TEXT, restaurant_name TEXT, message TEXT) AS $$
DECLARE
  v_request password_reset_requests%ROWTYPE;
  v_user users%ROWTYPE;
  v_restaurant restaurants%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE id = p_admin_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_password_hash IS NULL OR length(p_password_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;

  SELECT * INTO v_request
  FROM password_reset_requests
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT, 'Reset request not found';
    RETURN;
  END IF;

  SELECT * INTO v_user
  FROM users
  WHERE lower(email) = lower(v_request.email)
    AND is_active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE password_reset_requests
    SET status = 'rejected',
        approved_by = p_admin_id,
        approved_at = NOW(),
        rejection_reason = 'No active restaurant user found'
    WHERE id = p_request_id;
    RETURN QUERY SELECT FALSE, v_request.email, NULL::TEXT, 'No active restaurant user found';
    RETURN;
  END IF;

  UPDATE users
  SET password_hash = p_password_hash,
      temp_password = TRUE
  WHERE id = v_user.id;

  SELECT * INTO v_restaurant FROM restaurants WHERE id = v_user.restaurant_id;

  UPDATE password_reset_requests
  SET status = 'approved',
      approved_by = p_admin_id,
      approved_at = NOW(),
      restaurant_id = v_user.restaurant_id,
      restaurant_name = v_restaurant.name
  WHERE id = p_request_id;

  RETURN QUERY SELECT TRUE, v_user.email, v_restaurant.name, 'Temporary password generated';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION admin_reject_password_reset(
  p_request_id UUID,
  p_admin_id UUID,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE id = p_admin_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE password_reset_requests
  SET status = 'rejected',
      approved_by = p_admin_id,
      approved_at = NOW(),
      rejection_reason = NULLIF(trim(COALESCE(p_rejection_reason, '')), '')
  WHERE id = p_request_id
    AND status = 'pending';

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION request_password_reset(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_approve_password_reset(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_reject_password_reset(UUID, UUID, TEXT) TO anon, authenticated;

DROP FUNCTION IF EXISTS restaurant_login(TEXT, TEXT);

CREATE OR REPLACE FUNCTION restaurant_login(
  p_email TEXT,
  p_password_hash TEXT
)
RETURNS TABLE (
  id UUID,
  restaurant_id UUID,
  email TEXT,
  role TEXT,
  temp_password BOOLEAN,
  restaurant_name TEXT,
  restaurant_slug TEXT,
  restaurant_is_active BOOLEAN
) AS $$
DECLARE
  v_identifier_hash TEXT;
  v_limit RECORD;
BEGIN
  IF p_email IS NULL OR length(p_email) > 254 OR p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email or password';
  END IF;

  IF p_password_hash IS NULL OR length(p_password_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid email or password';
  END IF;

  v_identifier_hash := encode(digest(lower(trim(p_email)), 'sha256'), 'hex');
  SELECT * INTO v_limit FROM check_rate_limit('restaurant_login', v_identifier_hash);
  IF NOT v_limit.allowed THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.restaurant_id,
    u.email,
    u.role,
    u.temp_password,
    r.name,
    r.slug,
    r.is_active
  FROM users u
  JOIN restaurants r ON r.id = u.restaurant_id
  WHERE lower(u.email) = lower(trim(p_email))
    AND u.password_hash = p_password_hash
    AND u.is_active = TRUE;

  IF NOT FOUND THEN
    PERFORM record_rate_limit_attempt('restaurant_login', v_identifier_hash, FALSE);
  ELSE
    PERFORM clear_rate_limit('restaurant_login', v_identifier_hash);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION restaurant_change_password(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_current_password_hash TEXT,
  p_new_password_hash TEXT,
  p_require_current_password BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user users%ROWTYPE;
  v_identifier_hash TEXT;
  v_limit RECORD;
BEGIN
  v_identifier_hash := encode(digest(COALESCE(p_user_id::TEXT, 'unknown'), 'sha256'), 'hex');
  SELECT * INTO v_limit FROM check_rate_limit('password_change', v_identifier_hash);
  IF NOT v_limit.allowed THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;

  IF p_new_password_hash IS NULL OR length(p_new_password_hash) < 32 THEN
    PERFORM record_rate_limit_attempt('password_change', v_identifier_hash, FALSE);
    RAISE EXCEPTION 'Invalid password';
  END IF;

  SELECT * INTO v_user
  FROM users
  WHERE id = p_user_id
    AND restaurant_id = p_restaurant_id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    PERFORM record_rate_limit_attempt('password_change', v_identifier_hash, FALSE);
    RAISE EXCEPTION 'Unable to change password';
  END IF;

  IF p_require_current_password
    AND COALESCE(v_user.password_hash, '') <> COALESCE(p_current_password_hash, '') THEN
    PERFORM record_rate_limit_attempt('password_change', v_identifier_hash, FALSE);
    RAISE EXCEPTION 'Current password is incorrect';
  END IF;

  UPDATE users
  SET password_hash = p_new_password_hash,
      temp_password = FALSE
  WHERE id = p_user_id
    AND restaurant_id = p_restaurant_id;

  PERFORM clear_rate_limit('password_change', v_identifier_hash);
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION restaurant_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_change_password(UUID, UUID, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_customer_order_context(
  p_restaurant_slug TEXT,
  p_table_token TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_restaurant restaurants%ROWTYPE;
  v_table tables%ROWTYPE;
  v_menu_items JSONB;
BEGIN
  SELECT * INTO v_restaurant
  FROM restaurants
  WHERE slug = p_restaurant_slug
    AND is_active = TRUE
    AND COALESCE(status, 'active') = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found or inactive';
  END IF;

  SELECT * INTO v_table
  FROM tables
  WHERE restaurant_id = v_restaurant.id
    AND table_token = p_table_token
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table token is invalid or inactive';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(mi) ORDER BY COALESCE(mi.category, ''), mi.name), '[]'::jsonb)
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
      'subscription_status', v_restaurant.subscription_status,
      'current_period_end', v_restaurant.current_period_end,
      'grace_until', v_restaurant.grace_until,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION get_customer_order_context(TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION restaurant_update_order_status(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_order_id UUID,
  p_status TEXT
)
RETURNS BOOLEAN AS $$
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
      cancelled_at = CASE WHEN p_status = 'cancelled' THEN NOW() ELSE cancelled_at END,
      updated_at = NOW()
  WHERE id = p_order_id
    AND restaurant_id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION restaurant_update_order_status(UUID, UUID, UUID, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION create_customer_order(
  p_restaurant_slug TEXT,
  p_table_token TEXT,
  p_items JSONB,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
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
  v_identifier_hash TEXT;
  v_limit RECORD;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Invalid order items';
  END IF;

  v_identifier_hash := encode(digest(lower(COALESCE(p_restaurant_slug, '')) || ':' || COALESCE(p_table_token, ''), 'sha256'), 'hex');
  SELECT * INTO v_limit FROM check_rate_limit('order_create', v_identifier_hash);
  IF NOT v_limit.allowed THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;

  SELECT * INTO v_restaurant
  FROM restaurants
  WHERE slug = p_restaurant_slug
    AND is_active = TRUE
    AND COALESCE(status, 'active') = 'active';

  IF NOT FOUND THEN
    PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
    RAISE EXCEPTION 'Invalid ordering link';
  END IF;

  IF NOT restaurant_subscription_allows_ordering(v_restaurant.id) THEN
    PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
    RAISE EXCEPTION 'Ordering is currently unavailable for this restaurant';
  END IF;

  SELECT * INTO v_table
  FROM tables
  WHERE restaurant_id = v_restaurant.id
    AND table_token = p_table_token
    AND is_active = TRUE;

  IF NOT FOUND THEN
    PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
    RAISE EXCEPTION 'Invalid ordering link';
  END IF;

  IF p_customer_name IS NOT NULL AND length(trim(p_customer_name)) > 100 THEN
    RAISE EXCEPTION 'Invalid customer details';
  END IF;
  IF p_customer_phone IS NOT NULL AND p_customer_phone <> '' AND p_customer_phone !~ '^\+?[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid customer details';
  END IF;
  IF p_customer_notes IS NOT NULL AND length(trim(p_customer_notes)) > 300 THEN
    RAISE EXCEPTION 'Invalid customer details';
  END IF;

  FOR v_input IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_input->>'menu_item_id') IS NULL
      OR (v_input->>'menu_item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
      RAISE EXCEPTION 'Invalid order items';
    END IF;

    v_quantity := COALESCE((v_input->>'quantity')::INTEGER, 0);
    IF v_quantity < 1 OR v_quantity > 99 THEN
      PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
      RAISE EXCEPTION 'Invalid order quantity';
    END IF;

    SELECT * INTO v_item
    FROM menu_items
    WHERE id = (v_input->>'menu_item_id')::UUID
      AND restaurant_id = v_restaurant.id
      AND is_available = TRUE;

    IF NOT FOUND THEN
      PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
      RAISE EXCEPTION 'One or more items are unavailable';
    END IF;

    v_unit_price := v_item.base_price;
    v_selected_size := NULL;
    v_size_name := NULLIF(v_input->>'selected_size_name', '');

    IF jsonb_array_length(COALESCE(v_item.sizes, '[]'::jsonb)) > 0 THEN
      SELECT size_option INTO v_selected_size
      FROM jsonb_array_elements(v_item.sizes) AS size_option
      WHERE size_option->>'name' = v_size_name
      LIMIT 1;

      IF v_selected_size IS NULL THEN
        PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
        RAISE EXCEPTION 'Invalid order items';
      END IF;
      v_unit_price := (v_selected_size->>'price')::NUMERIC;
    END IF;

    v_selected_addons := '[]'::jsonb;
    FOR v_addon_name IN
      SELECT DISTINCT value
      FROM jsonb_array_elements_text(COALESCE(v_input->'selected_addon_names', '[]'::jsonb))
    LOOP
      SELECT addon_option INTO v_addon
      FROM jsonb_array_elements(COALESCE(v_item.addons, '[]'::jsonb)) AS addon_option
      WHERE addon_option->>'name' = v_addon_name
      LIMIT 1;

      IF v_addon IS NULL THEN
        PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
        RAISE EXCEPTION 'Invalid order items';
      END IF;
      v_selected_addons := v_selected_addons || jsonb_build_array(v_addon);
      v_unit_price := v_unit_price + (v_addon->>'price')::NUMERIC;
      v_addon := NULL;
    END LOOP;

    v_line_total := ROUND(v_unit_price * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'menu_item_id', v_item.id,
      'name', v_item.name,
      'quantity', v_quantity,
      'base_price', v_item.base_price,
      'unit_price', v_unit_price,
      'selected_size', v_selected_size,
      'selected_addons', v_selected_addons,
      'item_total', v_line_total,
      'special_instructions', NULLIF(v_input->>'special_instructions', '')
    ));
  END LOOP;

  v_subtotal := ROUND(v_subtotal, 2);
  IF COALESCE(v_restaurant.gst_enabled, FALSE) THEN
    v_tax := ROUND(v_subtotal * ((COALESCE(v_restaurant.cgst_rate, 0) + COALESCE(v_restaurant.sgst_rate, 0)) / 100), 2);
  ELSE
    v_tax := 0;
  END IF;
  v_total := ROUND(v_subtotal + v_tax, 2);

  INSERT INTO orders (
    restaurant_id, table_id, table_number, order_type, customer_name,
    customer_phone, items, subtotal, tax, total, status, customer_notes
  ) VALUES (
    v_restaurant.id, v_table.id, v_table.table_number, 'qr',
    NULLIF(trim(COALESCE(p_customer_name, '')), ''),
    NULLIF(trim(COALESCE(p_customer_phone, '')), ''),
    v_order_items, v_subtotal, v_tax, v_total, 'new',
    NULLIF(trim(COALESCE(p_customer_notes, '')), '')
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, TRUE);

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION create_customer_order(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
