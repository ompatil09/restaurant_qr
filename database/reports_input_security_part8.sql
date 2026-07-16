-- Rasivo reports/input boundary hardening.
-- Run after security_hardening_part5.sql, subscription_auth_fixes_part6.sql,
-- reports_analytics_part7.sql, and stripe_billing_hardening_part7.sql.

CREATE OR REPLACE FUNCTION public.get_rate_limit_config(p_action TEXT)
RETURNS TABLE (
  max_attempts INTEGER,
  window_minutes INTEGER,
  backoff_base_seconds INTEGER,
  max_backoff_seconds INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE p_action
      WHEN 'admin_login' THEN 5
      WHEN 'restaurant_login' THEN 5
      WHEN 'restaurant_login_ip' THEN 10
      WHEN 'registration' THEN 3
      WHEN 'registration_ip' THEN 3
      WHEN 'password_reset' THEN 3
      WHEN 'password_reset_ip' THEN 3
      WHEN 'order_create' THEN 20
      WHEN 'password_change' THEN 5
      WHEN 'image_upload' THEN 20
      WHEN 'reports_read' THEN 60
      WHEN 'billing_write' THEN 10
      WHEN 'public_menu_read' THEN 120
      ELSE 20
    END::INTEGER,
    CASE p_action
      WHEN 'admin_login' THEN 15
      WHEN 'restaurant_login' THEN 15
      WHEN 'restaurant_login_ip' THEN 15
      WHEN 'registration' THEN 60
      WHEN 'registration_ip' THEN 60
      WHEN 'password_reset' THEN 60
      WHEN 'password_reset_ip' THEN 60
      WHEN 'order_create' THEN 10
      WHEN 'password_change' THEN 30
      WHEN 'image_upload' THEN 60
      WHEN 'reports_read' THEN 1
      WHEN 'billing_write' THEN 10
      WHEN 'public_menu_read' THEN 1
      ELSE 15
    END::INTEGER,
    CASE p_action
      WHEN 'admin_login' THEN 30
      WHEN 'restaurant_login' THEN 30
      WHEN 'restaurant_login_ip' THEN 30
      WHEN 'password_change' THEN 30
      ELSE 0
    END::INTEGER,
    CASE p_action
      WHEN 'admin_login' THEN 1800
      WHEN 'restaurant_login' THEN 1800
      WHEN 'restaurant_login_ip' THEN 1800
      WHEN 'password_change' THEN 1800
      ELSE 0
    END::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_rate_limit_attempt(
  p_action TEXT,
  p_identifier_hash TEXT,
  p_success BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  allowed BOOLEAN,
  retry_after_seconds INTEGER,
  blocked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_config RECORD;
  v_existing public.rate_limits%ROWTYPE;
  v_attempts INTEGER;
  v_blocked_until TIMESTAMPTZ;
  v_window_reset BOOLEAN;
  v_extra_attempts INTEGER;
BEGIN
  -- Successful credential checks clear failure counters. Successful volume
  -- actions still count, otherwise registration/order/reset limits are bypassed.
  IF p_success AND p_action IN ('admin_login', 'restaurant_login', 'password_change') THEN
    DELETE FROM public.rate_limits
    WHERE action = p_action AND identifier_hash = p_identifier_hash;
    RETURN QUERY SELECT TRUE, 0, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT * INTO v_config FROM public.get_rate_limit_config(p_action);
  SELECT * INTO v_existing
  FROM public.rate_limits
  WHERE action = p_action AND identifier_hash = p_identifier_hash
  FOR UPDATE;

  v_window_reset := FOUND
    AND v_existing.first_attempt_at < NOW() - make_interval(mins => v_config.window_minutes)
    AND COALESCE(v_existing.blocked_until, NOW() - interval '1 second') <= NOW();

  IF NOT FOUND OR v_window_reset THEN
    INSERT INTO public.rate_limits(action, identifier_hash, attempts, first_attempt_at, last_attempt_at)
    VALUES (p_action, p_identifier_hash, 1, NOW(), NOW())
    ON CONFLICT (action, identifier_hash)
    DO UPDATE SET attempts = 1,
                  first_attempt_at = NOW(),
                  last_attempt_at = NOW(),
                  blocked_until = NULL
    RETURNING rate_limits.attempts, rate_limits.blocked_until
    INTO v_attempts, v_blocked_until;
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
        v_blocked_until := v_existing.first_attempt_at
          + make_interval(mins => v_config.window_minutes);
      END IF;
    END IF;

    UPDATE public.rate_limits
    SET attempts = v_attempts,
        last_attempt_at = NOW(),
        blocked_until = v_blocked_until
    WHERE id = v_existing.id;
  END IF;

  RETURN QUERY
  SELECT * FROM public.check_rate_limit(p_action, p_identifier_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_action TEXT,
  p_identifier_hash TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  retry_after_seconds INTEGER,
  blocked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_action NOT IN (
    'restaurant_login_ip',
    'registration_ip',
    'password_reset_ip',
    'reports_read',
    'billing_write',
    'image_upload'
  ) THEN
    RAISE EXCEPTION 'Invalid rate limit action';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.record_rate_limit_attempt(p_action, p_identifier_hash, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_rate_limit_attempt(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_rate_limit(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_api_rate_limit(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_rate_limit_attempt(TEXT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_rate_limit(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_password_reset(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email TEXT;
  v_user public.users%ROWTYPE;
  v_restaurant public.restaurants%ROWTYPE;
  v_identifier_hash TEXT;
  v_limit RECORD;
  v_request_id UUID;
BEGIN
  v_email := lower(trim(COALESCE(p_email, '')));
  IF length(v_email) > 254 OR v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
    RETURN TRUE;
  END IF;

  v_identifier_hash := encode(digest(v_email, 'sha256'), 'hex');
  SELECT * INTO v_limit FROM public.check_rate_limit('password_reset', v_identifier_hash);
  IF NOT v_limit.allowed THEN RETURN TRUE; END IF;

  SELECT * INTO v_user
  FROM public.users
  WHERE lower(email) = v_email AND is_active = TRUE
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_restaurant
    FROM public.restaurants
    WHERE id = v_user.restaurant_id
    LIMIT 1;

    UPDATE public.password_reset_requests
    SET created_at = NOW(), restaurant_id = v_user.restaurant_id,
        restaurant_name = v_restaurant.name
    WHERE lower(email) = v_email AND status = 'pending'
    RETURNING id INTO v_request_id;

    IF v_request_id IS NULL THEN
      INSERT INTO public.password_reset_requests(
        email, restaurant_id, restaurant_name, status
      ) VALUES (
        v_email, v_user.restaurant_id, v_restaurant.name, 'pending'
      );
    END IF;
  END IF;

  PERFORM public.record_rate_limit_attempt('password_reset', v_identifier_hash, TRUE);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_order_context(
  p_restaurant_slug TEXT,
  p_table_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_restaurant public.restaurants%ROWTYPE;
  v_table public.tables%ROWTYPE;
  v_menu_items JSONB;
  v_identifier_hash TEXT;
  v_limit RECORD;
BEGIN
  IF p_restaurant_slug IS NULL OR p_restaurant_slug !~ '^[a-z0-9-]{2,100}$'
    OR p_table_token IS NULL OR length(p_table_token) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'Invalid ordering link';
  END IF;

  v_identifier_hash := encode(
    digest(p_restaurant_slug || ':' || p_table_token, 'sha256'), 'hex'
  );
  SELECT * INTO v_limit
  FROM public.check_rate_limit('public_menu_read', v_identifier_hash);
  IF NOT v_limit.allowed THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;

  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE slug = p_restaurant_slug
    AND is_active = TRUE
    AND COALESCE(status, 'active') = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant not found or inactive'; END IF;

  SELECT * INTO v_table
  FROM public.tables
  WHERE restaurant_id = v_restaurant.id
    AND table_token = p_table_token
    AND is_active = TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table token is invalid or inactive'; END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(mi) ORDER BY COALESCE(mi.category, ''), mi.name),
    '[]'::JSONB
  ) INTO v_menu_items
  FROM public.menu_items mi
  WHERE mi.restaurant_id = v_restaurant.id AND mi.is_available = TRUE;

  PERFORM public.record_rate_limit_attempt('public_menu_read', v_identifier_hash, TRUE);
  RETURN jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', v_restaurant.id, 'name', v_restaurant.name,
      'slug', v_restaurant.slug, 'logo_url', v_restaurant.logo_url,
      'theme_color', v_restaurant.theme_color,
      'welcome_message', v_restaurant.welcome_message,
      'subscription_status', v_restaurant.subscription_status,
      'current_period_end', v_restaurant.current_period_end,
      'grace_until', v_restaurant.grace_until,
      'is_active', v_restaurant.is_active
    ),
    'table', jsonb_build_object(
      'id', v_table.id, 'table_number', v_table.table_number,
      'is_active', v_table.is_active
    ),
    'menu_items', v_menu_items
  );
END;
$$;

-- Validate writes at the table boundary as a final guard even when a future
-- client or RPC forgets UI validation.
CREATE OR REPLACE FUNCTION public.validate_menu_item_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_option JSONB;
BEGIN
  IF length(trim(COALESCE(NEW.name, ''))) NOT BETWEEN 2 AND 100
    OR NEW.base_price <= 0 OR NEW.base_price > 100000
    OR COALESCE(NEW.food_type, 'veg') NOT IN ('veg', 'non_veg', 'egg', 'jain')
    OR (NEW.description IS NOT NULL AND length(NEW.description) > 500)
    OR (NEW.category IS NOT NULL AND length(NEW.category) > 80)
    OR (NEW.tag_label IS NOT NULL AND length(NEW.tag_label) > 40)
    OR (NEW.image_url IS NOT NULL AND (
      length(NEW.image_url) > 2048 OR NEW.image_url !~ '^https://'
    )) THEN
    RAISE EXCEPTION 'Invalid menu item';
  END IF;

  IF jsonb_typeof(COALESCE(NEW.sizes, '[]'::JSONB)) <> 'array'
    OR jsonb_array_length(COALESCE(NEW.sizes, '[]'::JSONB)) > 20
    OR jsonb_typeof(COALESCE(NEW.addons, '[]'::JSONB)) <> 'array'
    OR jsonb_array_length(COALESCE(NEW.addons, '[]'::JSONB)) > 20 THEN
    RAISE EXCEPTION 'Invalid menu options';
  END IF;

  FOR v_option IN
    SELECT value FROM jsonb_array_elements(
      COALESCE(NEW.sizes, '[]'::JSONB) || COALESCE(NEW.addons, '[]'::JSONB)
    )
  LOOP
    IF jsonb_typeof(v_option) <> 'object'
      OR length(trim(COALESCE(v_option->>'name', ''))) NOT BETWEEN 1 AND 50
      OR COALESCE(v_option->>'price', '') !~ '^[0-9]+([.][0-9]{1,2})?$'
      OR (v_option->>'price')::NUMERIC <= 0
      OR (v_option->>'price')::NUMERIC > 100000 THEN
      RAISE EXCEPTION 'Invalid menu options';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_menu_item_write ON public.menu_items;
CREATE TRIGGER validate_menu_item_write
BEFORE INSERT OR UPDATE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.validate_menu_item_write();

CREATE OR REPLACE FUNCTION public.validate_restaurant_branding_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.logo_url IS NOT NULL AND (
      length(NEW.logo_url) > 2048 OR NEW.logo_url !~ '^https://'
    ))
    OR (NEW.upi_qr_url IS NOT NULL AND (
      length(NEW.upi_qr_url) > 2048 OR NEW.upi_qr_url !~ '^https://'
    ))
    OR COALESCE(NEW.theme_color, '#111827') !~ '^#[0-9A-Fa-f]{6}$'
    OR (NEW.welcome_message IS NOT NULL AND length(NEW.welcome_message) > 250)
    OR COALESCE(NEW.cgst_rate, 0) NOT BETWEEN 0 AND 28
    OR COALESCE(NEW.sgst_rate, 0) NOT BETWEEN 0 AND 28
    OR (NEW.admin_pin_hash IS NOT NULL AND NEW.admin_pin_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Invalid restaurant settings';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_restaurant_branding_write ON public.restaurants;
CREATE TRIGGER validate_restaurant_branding_write
BEFORE INSERT OR UPDATE OF logo_url, theme_color, welcome_message, upi_qr_url,
  cgst_rate, sgst_rate, admin_pin_hash ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.validate_restaurant_branding_write();

CREATE OR REPLACE FUNCTION public.validate_order_input_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
BEGIN
  IF jsonb_typeof(NEW.items) <> 'array' OR jsonb_array_length(NEW.items) NOT BETWEEN 1 AND 50
    OR (NEW.customer_name IS NOT NULL AND length(NEW.customer_name) > 100)
    OR (NEW.customer_phone IS NOT NULL AND NEW.customer_phone !~ '^\+?[0-9]{10,15}$')
    OR (NEW.customer_notes IS NOT NULL AND length(NEW.customer_notes) > 300) THEN
    RAISE EXCEPTION 'Invalid order input';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR COALESCE(v_item->>'quantity', '') !~ '^[0-9]+$'
      OR (v_item->>'quantity')::INTEGER NOT BETWEEN 1 AND 99
      OR (v_item->>'special_instructions' IS NOT NULL
        AND length(v_item->>'special_instructions') > 200) THEN
      RAISE EXCEPTION 'Invalid order input';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_order_input_write ON public.orders;
CREATE TRIGGER validate_order_input_write
BEFORE INSERT OR UPDATE OF items, customer_name, customer_phone, customer_notes
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.validate_order_input_write();

DO $$
BEGIN
  ALTER TABLE public.restaurants
    ADD CONSTRAINT restaurants_admin_text_length_chk
    CHECK (
      (block_reason IS NULL OR length(block_reason) <= 500)
      AND (internal_notes IS NULL OR length(internal_notes) <= 500)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.registration_requests
    ADD CONSTRAINT registration_admin_text_length_chk
    CHECK (
      (internal_notes IS NULL OR length(internal_notes) <= 500)
      AND (rejection_reason IS NULL OR length(rejection_reason) <= 500)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.password_reset_requests
    ADD CONSTRAINT password_reset_reason_length_chk
    CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 500) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Signed upload URLs are issued by the authenticated Netlify function. Menu
-- images remain public for QR-menu performance; anonymous writes are disabled.
UPDATE storage.buckets
SET public = TRUE,
    file_size_limit = 3145728,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::TEXT[]
WHERE id = 'menu-images';

DROP POLICY IF EXISTS "Anon can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Public can upload menu images" ON storage.objects;
DROP POLICY IF EXISTS "Limited anon menu image uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public can update menu images" ON storage.objects;
DROP POLICY IF EXISTS "Public can delete menu images" ON storage.objects;

GRANT EXECUTE ON FUNCTION public.request_password_reset(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_order_context(TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  RAISE NOTICE 'Rasivo reports/input security hardening installed.';
END $$;
