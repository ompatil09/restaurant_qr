-- Fix Supabase pgcrypto lookup for SECURITY DEFINER RPC functions.
-- Run this after security_hardening_part5.sql and subscription_auth_fixes_part6.sql
-- if login fails with "function digest(text, unknown) does not exist".

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER FUNCTION public.admin_login(TEXT, TEXT)
  SET search_path = public, extensions;

ALTER FUNCTION public.restaurant_login(TEXT, TEXT)
  SET search_path = public, extensions;

ALTER FUNCTION public.submit_registration_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  SET search_path = public, extensions;

ALTER FUNCTION public.request_password_reset(TEXT)
  SET search_path = public, extensions;

ALTER FUNCTION public.restaurant_change_password(UUID, UUID, TEXT, TEXT, BOOLEAN)
  SET search_path = public, extensions;

ALTER FUNCTION public.create_customer_order(TEXT, TEXT, JSONB, TEXT, TEXT, TEXT)
  SET search_path = public, extensions;

NOTIFY pgrst, 'reload schema';
