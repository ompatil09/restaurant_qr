-- Part 5: security hardening for production readiness.
-- Run after setup.sql, customer_ordering_secure.sql, premium_menu_part3.sql,
-- and production_hardening_part4.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Central rate limiting primitives. Identifiers are SHA-256 hashes supplied by
-- the client or generated inside SECURITY DEFINER functions from low-sensitivity
-- identifiers such as email/table token. Do not store raw IP/email here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  identifier_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (action, identifier_hash),
  CHECK (length(action) BETWEEN 3 AND 80),
  CHECK (length(identifier_hash) BETWEEN 32 AND 128)
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct public access to rate limits" ON rate_limits;
CREATE POLICY "No direct public access to rate limits"
  ON rate_limits
  FOR ALL
  USING (FALSE)
  WITH CHECK (FALSE);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON rate_limits(action, identifier_hash);
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup
  ON rate_limits(last_attempt_at);

CREATE OR REPLACE FUNCTION update_rate_limits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_rate_limits_updated_at ON rate_limits;
CREATE TRIGGER update_rate_limits_updated_at
BEFORE UPDATE ON rate_limits
FOR EACH ROW EXECUTE FUNCTION update_rate_limits_updated_at();

CREATE OR REPLACE FUNCTION get_rate_limit_config(p_action TEXT)
RETURNS TABLE (
  max_attempts INTEGER,
  window_minutes INTEGER,
  backoff_base_seconds INTEGER,
  max_backoff_seconds INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE p_action
      WHEN 'admin_login' THEN 5
      WHEN 'restaurant_login' THEN 5
      WHEN 'registration' THEN 3
      WHEN 'order_create' THEN 20
      WHEN 'password_change' THEN 5
      WHEN 'image_upload' THEN 20
      ELSE 10
    END::INTEGER,
    CASE p_action
      WHEN 'admin_login' THEN 15
      WHEN 'restaurant_login' THEN 15
      WHEN 'registration' THEN 60
      WHEN 'order_create' THEN 10
      WHEN 'password_change' THEN 30
      WHEN 'image_upload' THEN 60
      ELSE 15
    END::INTEGER,
    CASE p_action
      WHEN 'admin_login' THEN 30
      WHEN 'restaurant_login' THEN 30
      WHEN 'password_change' THEN 30
      ELSE 0
    END::INTEGER,
    CASE p_action
      WHEN 'admin_login' THEN 1800
      WHEN 'restaurant_login' THEN 1800
      WHEN 'password_change' THEN 1800
      ELSE 0
    END::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_action TEXT,
  p_identifier_hash TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  retry_after_seconds INTEGER,
  blocked_until TIMESTAMPTZ
) AS $$
DECLARE
  v_config RECORD;
  v_limit rate_limits%ROWTYPE;
  v_window_start TIMESTAMPTZ;
BEGIN
  IF p_action IS NULL OR length(p_action) < 3 OR length(p_action) > 80 THEN
    RAISE EXCEPTION 'Invalid rate limit action';
  END IF;

  IF p_identifier_hash IS NULL OR length(p_identifier_hash) < 32 OR length(p_identifier_hash) > 128 THEN
    RAISE EXCEPTION 'Invalid rate limit identifier';
  END IF;

  SELECT * INTO v_config FROM get_rate_limit_config(p_action);
  v_window_start := NOW() - make_interval(mins => v_config.window_minutes);

  SELECT * INTO v_limit
  FROM rate_limits
  WHERE action = p_action
    AND identifier_hash = p_identifier_hash;

  IF NOT FOUND THEN
    RETURN QUERY SELECT TRUE, 0, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_limit.first_attempt_at < v_window_start AND COALESCE(v_limit.blocked_until, NOW() - interval '1 second') <= NOW() THEN
    DELETE FROM rate_limits WHERE id = v_limit.id;
    RETURN QUERY SELECT TRUE, 0, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF v_limit.blocked_until IS NOT NULL AND v_limit.blocked_until > NOW() THEN
    RETURN QUERY
    SELECT
      FALSE,
      CEIL(EXTRACT(EPOCH FROM (v_limit.blocked_until - NOW())))::INTEGER,
      v_limit.blocked_until;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 0, NULL::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION record_rate_limit_attempt(
  p_action TEXT,
  p_identifier_hash TEXT,
  p_success BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  allowed BOOLEAN,
  retry_after_seconds INTEGER,
  blocked_until TIMESTAMPTZ
) AS $$
DECLARE
  v_config RECORD;
  v_existing rate_limits%ROWTYPE;
  v_attempts INTEGER;
  v_blocked_until TIMESTAMPTZ;
  v_window_reset BOOLEAN;
  v_extra_attempts INTEGER;
BEGIN
  IF p_success THEN
    DELETE FROM rate_limits
    WHERE action = p_action AND identifier_hash = p_identifier_hash;
    RETURN QUERY SELECT TRUE, 0, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT * INTO v_config FROM get_rate_limit_config(p_action);

  SELECT * INTO v_existing
  FROM rate_limits
  WHERE action = p_action AND identifier_hash = p_identifier_hash;

  v_window_reset := FOUND
    AND v_existing.first_attempt_at < NOW() - make_interval(mins => v_config.window_minutes)
    AND COALESCE(v_existing.blocked_until, NOW() - interval '1 second') <= NOW();

  IF NOT FOUND OR v_window_reset THEN
    INSERT INTO rate_limits(action, identifier_hash, attempts, first_attempt_at, last_attempt_at)
    VALUES (p_action, p_identifier_hash, 1, NOW(), NOW())
    ON CONFLICT (action, identifier_hash)
    DO UPDATE SET attempts = 1,
                  first_attempt_at = NOW(),
                  last_attempt_at = NOW(),
                  blocked_until = NULL
    RETURNING attempts, blocked_until INTO v_attempts, v_blocked_until;
  ELSE
    v_attempts := v_existing.attempts + 1;
    v_blocked_until := v_existing.blocked_until;

    IF v_attempts >= v_config.max_attempts THEN
      IF v_config.backoff_base_seconds > 0 THEN
        v_extra_attempts := GREATEST(v_attempts - v_config.max_attempts, 0);
        v_blocked_until := NOW() + make_interval(
          secs => LEAST(
            v_config.max_backoff_seconds,
            v_config.backoff_base_seconds * POWER(2, LEAST(v_extra_attempts, 10))::INTEGER
          )
        );
      ELSE
        v_blocked_until := v_existing.first_attempt_at + make_interval(mins => v_config.window_minutes);
      END IF;
    END IF;

    UPDATE rate_limits
    SET attempts = v_attempts,
        last_attempt_at = NOW(),
        blocked_until = v_blocked_until
    WHERE id = v_existing.id;
  END IF;

  RETURN QUERY SELECT * FROM check_rate_limit(p_action, p_identifier_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION clear_rate_limit(
  p_action TEXT,
  p_identifier_hash TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE action = p_action AND identifier_hash = p_identifier_hash;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_rate_limit_attempt(TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION clear_rate_limit(TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Login RPCs with database-enforced rate limiting.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS restaurant_login(TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin_login(
  p_email TEXT,
  p_password_hash TEXT
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT
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
  SELECT * INTO v_limit FROM check_rate_limit('admin_login', v_identifier_hash);
  IF NOT v_limit.allowed THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;

  RETURN QUERY
  SELECT au.id, au.email, au.name
  FROM admin_users au
  WHERE lower(au.email) = lower(trim(p_email))
    AND au.password_hash = p_password_hash
    AND au.is_active = TRUE;

  IF NOT FOUND THEN
    PERFORM record_rate_limit_attempt('admin_login', v_identifier_hash, FALSE);
  ELSE
    PERFORM clear_rate_limit('admin_login', v_identifier_hash);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

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
    r.name as restaurant_name,
    r.slug as restaurant_slug,
    r.is_active as restaurant_is_active
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

GRANT EXECUTE ON FUNCTION admin_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_login(TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public registration through validated/rate-limited RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_registration_request(
  p_restaurant_name TEXT,
  p_owner_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_city TEXT,
  p_address TEXT DEFAULT NULL,
  p_restaurant_type TEXT DEFAULT NULL,
  p_heard_from TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_identifier_hash TEXT;
  v_limit RECORD;
  v_request_id UUID;
BEGIN
  p_email := lower(trim(COALESCE(p_email, '')));
  p_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g');

  IF p_restaurant_name IS NULL OR length(trim(p_restaurant_name)) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Invalid registration details';
  END IF;
  IF p_owner_name IS NULL OR length(trim(p_owner_name)) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Invalid registration details';
  END IF;
  IF p_phone !~ '^\+?[0-9]{10,15}$' THEN
    RAISE EXCEPTION 'Invalid registration details';
  END IF;
  IF p_email = '' OR length(p_email) > 254 OR p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid registration details';
  END IF;
  IF p_city IS NULL OR length(trim(p_city)) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Invalid registration details';
  END IF;
  IF p_address IS NOT NULL AND length(trim(p_address)) > 250 THEN
    RAISE EXCEPTION 'Invalid registration details';
  END IF;
  IF p_notes IS NOT NULL AND length(trim(p_notes)) > 500 THEN
    RAISE EXCEPTION 'Invalid registration details';
  END IF;

  v_identifier_hash := encode(digest(p_email || ':' || p_phone, 'sha256'), 'hex');
  SELECT * INTO v_limit FROM check_rate_limit('registration', v_identifier_hash);
  IF NOT v_limit.allowed THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;

  INSERT INTO registration_requests (
    restaurant_name,
    owner_name,
    phone,
    email,
    city,
    address,
    restaurant_type,
    heard_from,
    notes,
    status
  )
  VALUES (
    trim(p_restaurant_name),
    trim(p_owner_name),
    p_phone,
    p_email,
    trim(p_city),
    NULLIF(trim(COALESCE(p_address, '')), ''),
    NULLIF(trim(COALESCE(p_restaurant_type, '')), ''),
    NULLIF(trim(COALESCE(p_heard_from, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    'pending'
  )
  RETURNING id INTO v_request_id;

  PERFORM record_rate_limit_attempt('registration', v_identifier_hash, TRUE);
  RETURN v_request_id;
EXCEPTION
  WHEN unique_violation THEN
    PERFORM record_rate_limit_attempt('registration', v_identifier_hash, FALSE);
    RAISE EXCEPTION 'Registration could not be submitted';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION submit_registration_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Password change with rate limiting.
-- ---------------------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION restaurant_change_password(UUID, UUID, TEXT, TEXT, BOOLEAN) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customer order creation: preserve secure token/pricing behavior and add
-- validation/rate limiting. This expects the Part 1 tables/functions to exist.
-- ---------------------------------------------------------------------------
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
  IF p_restaurant_slug IS NULL OR p_restaurant_slug !~ '^[a-z0-9-]{2,100}$' THEN
    RAISE EXCEPTION 'Invalid ordering link';
  END IF;
  IF p_table_token IS NULL OR length(p_table_token) < 16 OR length(p_table_token) > 128 THEN
    RAISE EXCEPTION 'Invalid ordering link';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Invalid order items';
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

  v_identifier_hash := encode(digest(lower(p_restaurant_slug) || ':' || p_table_token, 'sha256'), 'hex');
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

  SELECT * INTO v_table
  FROM tables
  WHERE table_token = p_table_token
    AND restaurant_id = v_restaurant.id
    AND is_active = TRUE;

  IF NOT FOUND THEN
    PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
    RAISE EXCEPTION 'Invalid ordering link';
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
      IF v_size_name IS NULL THEN
        PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
        RAISE EXCEPTION 'Invalid order items';
      END IF;

      SELECT size_option
      INTO v_selected_size
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
        PERFORM record_rate_limit_attempt('order_create', v_identifier_hash, FALSE);
        RAISE EXCEPTION 'Invalid order items';
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
  IF COALESCE(v_restaurant.gst_enabled, FALSE) THEN
    v_tax := ROUND(v_subtotal * ((COALESCE(v_restaurant.cgst_rate, 0) + COALESCE(v_restaurant.sgst_rate, 0)) / 100), 2);
  ELSE
    v_tax := 0;
  END IF;
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
  )
  VALUES (
    v_restaurant.id,
    v_table.id,
    v_table.table_number,
    'qr',
    NULLIF(trim(COALESCE(p_customer_name, '')), ''),
    NULLIF(trim(COALESCE(p_customer_phone, '')), ''),
    v_order_items,
    v_subtotal,
    v_tax,
    v_total,
    'new',
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

-- ---------------------------------------------------------------------------
-- Defensive database constraints. Some constraints are intentionally NOT VALID
-- so you can validate after cleaning old data:
--   ALTER TABLE ... VALIDATE CONSTRAINT constraint_name;
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE restaurants
    ADD CONSTRAINT restaurants_slug_format_chk
    CHECK (slug ~ '^[a-z0-9-]{2,100}$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE restaurants
    ADD CONSTRAINT restaurants_gst_rate_chk
    CHECK (
      COALESCE(cgst_rate, 0) BETWEEN 0 AND 28
      AND COALESCE(sgst_rate, 0) BETWEEN 0 AND 28
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE registration_requests
    ADD CONSTRAINT registration_requests_input_chk
    CHECK (
      length(trim(restaurant_name)) BETWEEN 2 AND 100
      AND length(trim(owner_name)) BETWEEN 2 AND 100
      AND phone ~ '^\+?[0-9]{10,15}$'
      AND email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
      AND length(trim(city)) BETWEEN 2 AND 80
      AND (address IS NULL OR length(address) <= 250)
      AND (notes IS NULL OR length(notes) <= 500)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE tables
    ADD CONSTRAINT tables_number_token_chk
    CHECK (
      length(trim(table_number)) BETWEEN 1 AND 20
      AND length(table_token) BETWEEN 16 AND 128
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE menu_items
    ADD CONSTRAINT menu_items_input_chk
    CHECK (
      length(trim(name)) BETWEEN 2 AND 100
      AND (description IS NULL OR length(description) <= 500)
      AND base_price > 0
      AND base_price <= 100000
      AND COALESCE(food_type, 'veg') IN ('veg', 'non_veg', 'egg', 'jain')
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE orders
    ADD CONSTRAINT orders_customer_status_chk
    CHECK (
      status IN ('new', 'accepted', 'preparing', 'ready', 'served', 'cancelled', 'pending', 'completed')
      AND subtotal >= 0
      AND tax >= 0
      AND total >= 0
      AND (customer_name IS NULL OR length(customer_name) <= 100)
      AND (customer_phone IS NULL OR customer_phone ~ '^\+?[0-9]{10,15}$')
      AND (customer_notes IS NULL OR length(customer_notes) <= 300)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Storage policies. Public reads remain allowed for menu images; public writes
-- are narrowed to expected folder, MIME, and size metadata. For strict
-- production protection, move uploads behind a Netlify/Supabase Edge Function.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Public can update menu images" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete menu images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read menu images" ON storage.objects;

CREATE POLICY "Public can read menu images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'menu-images');

CREATE POLICY "Limited anon menu image uploads"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] IN ('menu', 'branding')
    AND lower(name) !~ '\.svg$'
    AND COALESCE((metadata->>'mimetype'), '') IN ('image/jpeg', 'image/png', 'image/webp')
    AND CASE
      WHEN COALESCE(metadata->>'size', '') ~ '^[0-9]+$'
      THEN (metadata->>'size')::BIGINT <= 3145728
      ELSE FALSE
    END
  );

-- Keep custom-auth dashboard compatibility but remove broad anonymous updates
-- where earlier scripts may have created them.
DROP POLICY IF EXISTS "Anon can update menu images" ON storage.objects;
DROP POLICY IF EXISTS "Anon can delete menu images" ON storage.objects;
