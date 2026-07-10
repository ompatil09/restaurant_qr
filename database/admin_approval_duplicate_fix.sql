-- Fix admin approval duplicate email handling.
-- Run this in Supabase SQL editor if approving a restaurant shows
-- restaurants_email_key or users_email_key duplicate errors.

CREATE OR REPLACE FUNCTION admin_create_restaurant(
  p_request_id UUID,
  p_restaurant_name TEXT,
  p_slug TEXT,
  p_owner_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_city TEXT,
  p_address TEXT,
  p_subscription_plan TEXT,
  p_password_hash TEXT,
  p_internal_notes TEXT
)
RETURNS TABLE (
  restaurant_id UUID,
  user_id UUID,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id UUID;
  v_user_id UUID;
  v_email TEXT := LOWER(TRIM(p_email));
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Email is required'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM registration_requests
    WHERE id = p_request_id
      AND status = 'verified'
  ) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Registration request has already been approved'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM restaurants WHERE LOWER(email) = v_email) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'This email is already used by an existing restaurant account. Use a different email address or manage the existing restaurant.'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE LOWER(email) = v_email) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'This email is already used by an existing restaurant account. Use a different email address or manage the existing restaurant.'::TEXT;
    RETURN;
  END IF;

  INSERT INTO restaurants (
    registration_request_id, name, slug, owner_name, phone, email,
    city, address, subscription_plan, status, is_active
  ) VALUES (
    p_request_id, p_restaurant_name, p_slug, p_owner_name, p_phone, v_email,
    p_city, p_address, p_subscription_plan, 'active', TRUE
  )
  RETURNING id INTO v_restaurant_id;

  INSERT INTO users (restaurant_id, email, password_hash, temp_password, role)
  VALUES (v_restaurant_id, v_email, p_password_hash, TRUE, 'owner')
  RETURNING id INTO v_user_id;

  UPDATE registration_requests
  SET status = 'verified', contacted_at = NOW(), internal_notes = p_internal_notes
  WHERE id = p_request_id;

  RETURN QUERY SELECT v_restaurant_id, v_user_id, TRUE, 'Restaurant created successfully'::TEXT;

EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'This email is already used by an existing restaurant account. Use a different email address or manage the existing restaurant.'::TEXT;
  WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_create_restaurant TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
