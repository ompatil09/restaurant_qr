import assert from "node:assert/strict";
import test from "node:test";
import { validateImageRequest, validateRegistration, validatedEmail } from "./validation.ts";

test("registration validation normalizes bounded allowlisted input", () => {
  const result = validateRegistration({
    restaurant_name: "  Spice   House ",
    owner_name: "Owner Name",
    phone: "+91 9876543210",
    email: " OWNER@EXAMPLE.COM ",
    city: "Mumbai",
    address: "Street 1",
    restaurant_type: "Restaurant",
    heard_from: "Google Search",
    notes: "Please call",
  });
  assert.equal(result.restaurant_name, "Spice House");
  assert.equal(result.phone, "+919876543210");
  assert.equal(result.email, "owner@example.com");
});

test("public input validation rejects unbounded and non-allowlisted values", () => {
  assert.throws(() => validatedEmail("not-an-email"));
  assert.throws(() => validateImageRequest({ folder: "../private", mime: "image/svg+xml", size: 10 }));
  assert.throws(() => validateRegistration({
    restaurant_name: "Restaurant",
    owner_name: "Owner",
    phone: "9999999999",
    email: "owner@example.com",
    city: "Mumbai",
    restaurant_type: "Injected",
  }));
});
