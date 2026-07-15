import assert from "node:assert/strict";
import test from "node:test";
import type { MenuItem } from "../src/config/supabase.ts";
import { mergeCartItem } from "../src/utils/cart.ts";

const item: MenuItem = {
  id: "dish-1",
  restaurant_id: "restaurant-1",
  name: "Paneer Bowl",
  base_price: 200,
  food_type: "veg",
  is_best_seller: false,
  is_recommended: false,
  is_available: true,
  created_at: "2026-07-15T00:00:00.000Z",
};

test("cart keeps request variants separate and merges matching quantities", () => {
  const medium = { name: "Medium", price: 250 };
  const first = mergeCartItem([], item, 2, medium, [], " no onions ");
  const merged = mergeCartItem(first, item, 1, medium, [], "no onions");
  const separate = mergeCartItem(merged, item, 1, medium, [], "extra spicy");

  assert.equal(separate.length, 2);
  assert.equal(separate[0].quantity, 3);
  assert.equal(separate[0].itemTotal, 250);
  assert.equal(separate[0].specialInstructions, "no onions");
  assert.equal(separate[1].quantity, 1);
  assert.equal(separate[1].specialInstructions, "extra spicy");
});
