const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error("Billing portal is not configured yet.");
  return value;
};

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const { restaurantId } = JSON.parse(event.body || "{}");
    if (!restaurantId) return json(400, { error: "Invalid billing request." });

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const restaurantResponse = await fetch(
      `${supabaseUrl}/rest/v1/restaurants?id=eq.${encodeURIComponent(
        restaurantId
      )}&select=stripe_customer_id`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    const restaurants = await restaurantResponse.json();
    const customerId = restaurants?.[0]?.stripe_customer_id;
    if (!customerId) {
      return json(400, { error: "Billing portal is not configured yet." });
    }

    const params = new URLSearchParams();
    params.set("customer", customerId);
    params.set(
      "return_url",
      `${requiredEnv("APP_URL").replace(/\/$/, "")}/restaurant/settings`
    );

    const response = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Stripe error");
    }

    return json(200, { url: payload.url });
  } catch (error) {
    return json(500, {
      error:
        error instanceof Error
          ? error.message
          : "Billing portal is not configured yet.",
    });
  }
};
