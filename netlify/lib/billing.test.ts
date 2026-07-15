import assert from "node:assert/strict";
import test from "node:test";
import {
  createRestaurantSession,
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
