-- Part 7: Stripe webhook idempotency and billing identifier integrity.
-- Run after subscription_auth_fixes_part6.sql.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.stripe_webhook_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
  ON public.stripe_webhook_events(processed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_stripe_customer_unique
  ON public.restaurants(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_stripe_subscription_unique
  ON public.restaurants(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
