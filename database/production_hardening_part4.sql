-- Part 4: production hardening, manager password changes, optimized summaries,
-- date-range order fetching, and backup-friendly indexes.

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

NOTIFY pgrst, 'reload schema';
