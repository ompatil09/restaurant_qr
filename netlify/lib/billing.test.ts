import assert from "node:assert/strict";
import test from "node:test";
import {
  createRestaurantSession,
  enforceRateLimit,
  HttpError,
  normalizeStripeStatus,
  requireRestaurantSession,
} from "./billing.ts";

process.env.APP_SESSION_SECRET = "test-secret-that-is-at-least-32-characters";

test("restaurant billing sessions reject tampering", () => {
  const token = createRestaurantSession({
    userId: "user-1",
    restaurantId: "restaurant-1",
    email: "owner@example.com",
    role: "owner",
  });
  const event = {
    httpMethod: "POST",
    headers: { authorization: `Bearer ${token}` },
  };

  assert.equal(requireRestaurantSession(event).restaurantId, "restaurant-1");
  assert.throws(() =>
    requireRestaurantSession({
      httpMethod: "POST",
      headers: { authorization: `Bearer ${token.slice(0, -1)}x` },
    })
  );
});

test("Stripe statuses map to database-safe values", () => {
  assert.equal(normalizeStripeStatus("active"), "active");
  assert.equal(normalizeStripeStatus("canceled"), "cancelled");
  assert.equal(normalizeStripeStatus("incomplete"), "inactive");
});

test("rate limiting hashes identity and returns a retryable 429", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.VITE_SUPABASE_ANON_KEY = "test-publishable-key";

  let sentBody = "";
  globalThis.fetch = async (_input, init) => {
    sentBody = String(init?.body || "");
    return new Response(
      JSON.stringify([{ allowed: false, retry_after_seconds: 90 }]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  await assert.rejects(
    () => enforceRateLimit(
      {
        httpMethod: "POST",
        headers: { "x-nf-client-connection-ip": "203.0.113.10" },
      },
      "reports_read",
      "User-1"
    ),
    (error) =>
      error instanceof HttpError &&
      error.statusCode === 429 &&
      error.headers?.["Retry-After"] === "90"
  );

  const payload = JSON.parse(sentBody);
  assert.equal(payload.p_action, "reports_read");
  assert.match(payload.p_identifier_hash, /^[0-9a-f]{64}$/);
  assert.equal(sentBody.includes("User-1"), false);
});
