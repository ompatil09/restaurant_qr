-- Emergency rollback for reports_input_security_part8.sql.
-- This intentionally restores only API compatibility. Re-run Part 8 as soon
-- as possible because public limiter helpers and anonymous uploads are unsafe.

GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_rate_limit_attempt(TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_rate_limit(TEXT, TEXT) TO anon, authenticated;
DROP FUNCTION IF EXISTS public.consume_api_rate_limit(TEXT, TEXT);

DROP TRIGGER IF EXISTS validate_menu_item_write ON public.menu_items;
DROP TRIGGER IF EXISTS validate_restaurant_branding_write ON public.restaurants;
DROP TRIGGER IF EXISTS validate_order_input_write ON public.orders;
DROP FUNCTION IF EXISTS public.validate_menu_item_write();
DROP FUNCTION IF EXISTS public.validate_restaurant_branding_write();
DROP FUNCTION IF EXISTS public.validate_order_input_write();

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_admin_text_length_chk;
ALTER TABLE public.registration_requests
  DROP CONSTRAINT IF EXISTS registration_admin_text_length_chk;
ALTER TABLE public.password_reset_requests
  DROP CONSTRAINT IF EXISTS password_reset_reason_length_chk;

DROP POLICY IF EXISTS "Limited anon menu image uploads" ON storage.objects;
CREATE POLICY "Limited anon menu image uploads"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'menu-images'
    AND (storage.foldername(name))[1] IN ('menu', 'branding')
    AND lower(name) !~ '\.svg$'
    AND COALESCE(metadata->>'mimetype', '') IN ('image/jpeg', 'image/png', 'image/webp')
    AND CASE WHEN COALESCE(metadata->>'size', '') ~ '^[0-9]+$'
      THEN (metadata->>'size')::BIGINT <= 3145728 ELSE FALSE END
  );

NOTIFY pgrst, 'reload schema';
