-- Fix for register page errors:
-- 1. Creates registration_requests if it is missing.
-- 2. Adds the RLS policies required by the public registration form.
-- 3. Reloads Supabase/PostgREST schema cache.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS registration_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  address TEXT,
  restaurant_type TEXT NOT NULL,
  heard_from TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'verified', 'rejected')),
  contacted_at TIMESTAMPTZ,
  rejection_reason TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can submit registration requests" ON registration_requests;
DROP POLICY IF EXISTS "Public can check registration request status" ON registration_requests;

CREATE POLICY "Public can submit registration requests"
  ON registration_requests
  FOR INSERT
  WITH CHECK (status = 'pending');

CREATE POLICY "Public can check registration request status"
  ON registration_requests
  FOR SELECT
  USING (TRUE);

NOTIFY pgrst, 'reload schema';
