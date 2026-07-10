-- =====================================================
-- PART 3 MIGRATION: Lightweight premium menu UX
-- Run after Part 1 and Part 2 migrations.
-- =====================================================

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

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#111827';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS admin_pin_hash TEXT;

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
    upi_qr_url = CASE WHEN p_branding ? 'upi_qr_url' THEN NULLIF(TRIM(p_branding->>'upi_qr_url'), '') ELSE upi_qr_url END
  WHERE id = p_restaurant_id
  RETURNING * INTO v_restaurant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  RETURN to_jsonb(v_restaurant);
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

GRANT EXECUTE ON FUNCTION restaurant_update_branding TO anon, authenticated;
GRANT EXECUTE ON FUNCTION restaurant_upsert_menu_item TO anon, authenticated;

-- Storage bucket for menu and branding images. This app currently uses a
-- lightweight custom login, so uploads use the anon client and restaurant
-- scoping is enforced by UI/service paths rather than Supabase Auth users.
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

NOTIFY pgrst, 'reload schema';
