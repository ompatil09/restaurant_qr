const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error("Billing is not configured yet.");
  return value;
};

const supabaseRequest = async (
  path: string,
  options: RequestInit = {}
) => {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
};

const createStripeCheckoutSession = async (params: URLSearchParams) => {
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "Stripe error");
  return payload;
};

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const { restaurantId, userId, email } = JSON.parse(event.body || "{}");
    if (!restaurantId || !userId || !email) {
      return json(400, { error: "Invalid billing request." });
    }

    const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
    const priceId = requiredEnv("STRIPE_PRICE_ID_RESTAURANT_MONTHLY");

    const restaurantResponse = await supabaseRequest(
      `restaurants?id=eq.${encodeURIComponent(restaurantId)}&select=id,name,email,stripe_customer_id`
    );
    const restaurants = await restaurantResponse.json();
    const restaurant = restaurants?.[0];
    if (!restaurant) return json(404, { error: "Restaurant not found." });

    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("success_url", `${appUrl}/restaurant/settings?billing=success`);
    params.set("cancel_url", `${appUrl}/restaurant/settings?billing=cancelled`);
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("client_reference_id", restaurantId);
    params.set("metadata[restaurant_id]", restaurantId);
    params.set("metadata[user_id]", userId);
    params.set("subscription_data[metadata][restaurant_id]", restaurantId);
    params.set("subscription_data[metadata][user_id]", userId);
    params.set("allow_promotion_codes", "true");

    if (restaurant.stripe_customer_id) {
      params.set("customer", restaurant.stripe_customer_id);
    } else {
      params.set("customer_email", email);
    }

    const session = await createStripeCheckoutSession(params);
    return json(200, { url: session.url });
  } catch (error) {
    return json(500, {
      error:
        error instanceof Error
          ? error.message
          : "Billing is not configured yet.",
    });
  }
};
