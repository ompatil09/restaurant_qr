-- Rasivo reports and analytics.
-- Run after subscription_auth_fixes_part6.sql and the counter/menu migrations.

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created
  ON public.orders (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status
  ON public.orders (restaurant_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_table_created
  ON public.orders (restaurant_id, table_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_status
  ON public.orders (created_at DESC, status);

DROP FUNCTION IF EXISTS public.restaurant_get_reports_analytics(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  INTEGER
);

CREATE FUNCTION public.restaurant_get_reports_analytics(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_group_by TEXT DEFAULT 'day',
  p_order_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.restaurant_user_can_manage(p_user_id, p_restaurant_id) THEN
    RAISE EXCEPTION 'Not allowed to view reports for this restaurant';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date <= p_start_date THEN
    RAISE EXCEPTION 'Invalid report date range';
  END IF;

  IF p_end_date - p_start_date > INTERVAL '366 days' THEN
    RAISE EXCEPTION 'Report date range cannot exceed 366 days';
  END IF;

  IF p_group_by NOT IN ('hour', 'day') THEN
    RAISE EXCEPTION 'Report grouping must be hour or day';
  END IF;

  WITH range_orders AS MATERIALIZED (
    SELECT
      o.id,
      o.order_number,
      o.table_number,
      o.order_type,
      o.items,
      o.subtotal,
      o.total,
      o.status,
      o.created_at
    FROM public.orders o
    WHERE o.restaurant_id = p_restaurant_id
      AND o.created_at >= p_start_date
      AND o.created_at < p_end_date
  ),
  revenue_orders AS MATERIALIZED (
    SELECT *
    FROM range_orders
    WHERE status NOT IN ('cancelled', 'rejected')
  ),
  item_rows AS MATERIALIZED (
    SELECT
      ro.id AS order_id,
      COALESCE(NULLIF(entry.item->>'name', ''), mi.name, 'Unknown item') AS item_name,
      COALESCE(
        NULLIF(entry.item->>'category_name', ''),
        mc.name,
        NULLIF(mi.category, ''),
        'Uncategorized'
      ) AS category_name,
      COALESCE(NULLIF(entry.item->>'food_type', ''), mi.food_type, 'unknown') AS food_type,
      parsed.quantity,
      CASE
        WHEN COALESCE(entry.item->>'item_total', '') ~ '^[0-9]+([.][0-9]+)?$'
          THEN (entry.item->>'item_total')::NUMERIC
        WHEN COALESCE(entry.item->>'unit_price', '') ~ '^[0-9]+([.][0-9]+)?$'
          THEN (entry.item->>'unit_price')::NUMERIC * parsed.quantity
        WHEN COALESCE(entry.item->>'base_price', '') ~ '^[0-9]+([.][0-9]+)?$'
          THEN (entry.item->>'base_price')::NUMERIC * parsed.quantity
        ELSE 0
      END AS revenue
    FROM revenue_orders ro
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(ro.items) = 'array' THEN ro.items
        ELSE '[]'::JSONB
      END
    ) AS entry(item)
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN COALESCE(entry.item->>'quantity', '') ~ '^[0-9]+$'
          THEN GREATEST((entry.item->>'quantity')::INTEGER, 0)
        ELSE 0
      END AS quantity
    ) parsed
    LEFT JOIN public.menu_items mi
      ON mi.restaurant_id = p_restaurant_id
      AND mi.id::TEXT = entry.item->>'menu_item_id'
    LEFT JOIN public.menu_categories mc
      ON mc.restaurant_id = p_restaurant_id
      AND mc.id = mi.category_id
  ),
  top_items AS MATERIALIZED (
    SELECT
      item_name,
      category_name,
      food_type,
      SUM(quantity)::BIGINT AS quantity_sold,
      ROUND(SUM(revenue), 2) AS revenue,
      ROUND(SUM(revenue) / NULLIF(SUM(quantity), 0), 2) AS average_price
    FROM item_rows
    GROUP BY item_name, category_name, food_type
    ORDER BY quantity_sold DESC, revenue DESC, item_name ASC
  ),
  category_sales AS MATERIALIZED (
    SELECT
      category_name,
      SUM(quantity)::BIGINT AS quantity_sold,
      ROUND(SUM(revenue), 2) AS revenue
    FROM item_rows
    GROUP BY category_name
    ORDER BY revenue DESC, category_name ASC
  ),
  food_type_sales AS MATERIALIZED (
    SELECT
      food_type,
      SUM(quantity)::BIGINT AS quantity_sold,
      ROUND(SUM(revenue), 2) AS revenue
    FROM item_rows
    GROUP BY food_type
    ORDER BY revenue DESC, food_type ASC
  ),
  table_performance AS MATERIALIZED (
    SELECT
      COALESCE(table_number, 'Counter') AS table_number,
      COUNT(*)::BIGINT AS order_count,
      ROUND(SUM(COALESCE(subtotal, total, 0)), 2) AS revenue,
      ROUND(AVG(COALESCE(subtotal, total, 0)), 2) AS average_order_value,
      MAX(created_at) AS last_order_time
    FROM revenue_orders
    GROUP BY COALESCE(table_number, 'Counter')
    ORDER BY order_count DESC, revenue DESC, table_number ASC
  ),
  status_breakdown AS MATERIALIZED (
    SELECT
      status,
      COUNT(*)::BIGINT AS order_count,
      ROUND(SUM(COALESCE(subtotal, total, 0)), 2) AS revenue
    FROM range_orders
    GROUP BY status
    ORDER BY order_count DESC, status ASC
  ),
  trend AS MATERIALIZED (
    SELECT
      date_trunc(p_group_by, created_at) AS period_start,
      ROUND(SUM(COALESCE(subtotal, total, 0)), 2) AS revenue,
      COUNT(*)::BIGINT AS order_count
    FROM revenue_orders
    GROUP BY date_trunc(p_group_by, created_at)
    ORDER BY period_start ASC
  ),
  hourly_rush AS MATERIALIZED (
    SELECT
      EXTRACT(HOUR FROM created_at)::INTEGER AS hour,
      COUNT(*)::BIGINT AS order_count,
      ROUND(SUM(COALESCE(subtotal, total, 0)), 2) AS revenue
    FROM revenue_orders
    GROUP BY EXTRACT(HOUR FROM created_at)
    ORDER BY hour ASC
  ),
  overview AS MATERIALIZED (
    SELECT
      ROUND(COALESCE((SELECT SUM(COALESCE(subtotal, total, 0)) FROM revenue_orders), 0), 2) AS total_revenue,
      (SELECT COUNT(*) FROM range_orders)::BIGINT AS total_orders,
      ROUND(COALESCE((SELECT AVG(COALESCE(subtotal, total, 0)) FROM revenue_orders), 0), 2) AS average_order_value,
      COALESCE((SELECT SUM(quantity) FROM item_rows), 0)::BIGINT AS items_sold,
      (SELECT COUNT(*) FROM range_orders WHERE status IN ('served', 'completed'))::BIGINT AS served_orders,
      (SELECT COUNT(*) FROM range_orders WHERE status IN ('cancelled', 'rejected'))::BIGINT AS cancelled_orders,
      (SELECT COUNT(*) FROM range_orders WHERE status IN ('new', 'pending', 'accepted', 'preparing', 'ready'))::BIGINT AS open_orders,
      (SELECT item_name FROM top_items LIMIT 1) AS top_item_name,
      COALESCE((SELECT quantity_sold FROM top_items LIMIT 1), 0)::BIGINT AS top_item_quantity,
      (SELECT table_number FROM table_performance LIMIT 1) AS most_active_table,
      COALESCE((SELECT order_count FROM table_performance LIMIT 1), 0)::BIGINT AS most_active_table_orders
  )
  SELECT jsonb_build_object(
    'overview', COALESCE((SELECT to_jsonb(overview) FROM overview), '{}'::JSONB),
    'revenue_trend', COALESCE((SELECT jsonb_agg(to_jsonb(trend) ORDER BY period_start) FROM trend), '[]'::JSONB),
    'top_items', COALESCE((SELECT jsonb_agg(to_jsonb(top_items)) FROM (SELECT * FROM top_items LIMIT 10) top_items), '[]'::JSONB),
    'category_sales', COALESCE((SELECT jsonb_agg(to_jsonb(category_sales)) FROM category_sales), '[]'::JSONB),
    'food_type_sales', COALESCE((SELECT jsonb_agg(to_jsonb(food_type_sales)) FROM food_type_sales), '[]'::JSONB),
    'table_performance', COALESCE((SELECT jsonb_agg(to_jsonb(table_performance)) FROM (SELECT * FROM table_performance LIMIT 20) table_performance), '[]'::JSONB),
    'status_breakdown', COALESCE((SELECT jsonb_agg(to_jsonb(status_breakdown)) FROM status_breakdown), '[]'::JSONB),
    'hourly_rush', COALESCE((SELECT jsonb_agg(to_jsonb(hourly_rush) ORDER BY hour) FROM hourly_rush), '[]'::JSONB),
    'orders', COALESCE((
      SELECT jsonb_agg(to_jsonb(order_rows) ORDER BY created_at DESC)
      FROM (
        SELECT
          ro.id,
          ro.order_number,
          COALESCE(ro.table_number, 'Counter') AS table_number,
          ro.created_at,
          ro.status,
          COALESCE((
            SELECT SUM(
              CASE
                WHEN COALESCE(item->>'quantity', '') ~ '^[0-9]+$'
                  THEN GREATEST((item->>'quantity')::INTEGER, 0)
                ELSE 0
              END
            )
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(ro.items) = 'array' THEN ro.items ELSE '[]'::JSONB END
            ) item
          ), 0)::BIGINT AS items_count,
          ROUND(COALESCE(ro.subtotal, ro.total, 0), 2) AS subtotal
        FROM range_orders ro
        ORDER BY ro.created_at DESC
        LIMIT LEAST(GREATEST(p_order_limit, 1), 250)
      ) order_rows
    ), '[]'::JSONB),
    'gst', COALESCE((
      SELECT jsonb_build_object(
        'enabled', COALESCE(r.gst_enabled, FALSE),
        'cgst_rate', COALESCE(r.cgst_rate, 0),
        'sgst_rate', COALESCE(r.sgst_rate, 0),
        'subtotal_before_gst', o.total_revenue,
        'cgst_estimate', CASE WHEN r.gst_enabled THEN ROUND(o.total_revenue * COALESCE(r.cgst_rate, 0) / 100, 2) ELSE 0 END,
        'sgst_estimate', CASE WHEN r.gst_enabled THEN ROUND(o.total_revenue * COALESCE(r.sgst_rate, 0) / 100, 2) ELSE 0 END,
        'grand_total_estimate', CASE
          WHEN r.gst_enabled THEN ROUND(o.total_revenue * (1 + (COALESCE(r.cgst_rate, 0) + COALESCE(r.sgst_rate, 0)) / 100), 2)
          ELSE o.total_revenue
        END
      )
      FROM public.restaurants r
      CROSS JOIN overview o
      WHERE r.id = p_restaurant_id
    ), '{}'::JSONB)
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_get_reports_analytics(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.restaurant_get_reports_analytics(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  INTEGER
) TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Rasivo reports analytics RPC installed successfully.';
END;
$$;
