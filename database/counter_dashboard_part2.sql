-- =====================================================
-- PART 2 MIGRATION: Counter dashboard and table QR admin RPCs
-- Run this after database/customer_ordering_part1.sql.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE tables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'new';

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

ALTER TABLE tables REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tables;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
