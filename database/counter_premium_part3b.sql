-- =====================================================
-- PART 3B MIGRATION: Counter premium features
-- Run after Part 1, Part 2, and Part 3A migrations.
-- =====================================================

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 2.5;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 2.5;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gst_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS admin_pin_hash TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS kot_printed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bill_printed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created_at ON orders(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_table_created_at ON orders(restaurant_id, table_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status_created_at ON orders(restaurant_id, status, created_at DESC);

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

CREATE OR REPLACE FUNCTION restaurant_mark_order_printed(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_order_id UUID,
  p_print_type TEXT
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

  IF p_print_type = 'kot' THEN
    UPDATE orders
    SET kot_printed_at = NOW()
    WHERE id = p_order_id
      AND restaurant_id = p_restaurant_id;
  ELSIF p_print_type = 'bill' THEN
    UPDATE orders
    SET bill_printed_at = NOW()
    WHERE id = p_order_id
      AND restaurant_id = p_restaurant_id;
  ELSE
    RAISE EXCEPTION 'Invalid print type';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION restaurant_update_branding TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_mark_order_printed TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
