import {
  enforceRateLimit,
  functionError,
  type FunctionEvent,
  getBillingContext,
  getStripe,
  HttpError,
  json,
  requiredEnv,
} from "../lib/billing.ts";

export const handler = async (event: FunctionEvent) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const { session, restaurant } = await getBillingContext(event);
    await enforceRateLimit(event, "billing_write", session.userId);
    if (
      restaurant.stripe_subscription_id &&
      !["cancelled", "inactive"].includes(
        restaurant.subscription_status || ""
      )
    ) {
      throw new HttpError(
        409,
        "A subscription already exists. Use Manage Billing to update it."
      );
    }

    const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
    const checkout = await getStripe().checkout.sessions.create({
      mode: "subscription",
      success_url: `${appUrl}/restaurant/settings?billing=success`,
      cancel_url: `${appUrl}/restaurant/settings?billing=cancelled`,
      line_items: [
        {
          price: requiredEnv("STRIPE_PRICE_ID_RESTAURANT_MONTHLY"),
          quantity: 1,
        },
      ],
      client_reference_id: restaurant.id,
      metadata: {
        restaurant_id: restaurant.id,
        user_id: session.userId,
      },
      subscription_data: {
        metadata: {
          restaurant_id: restaurant.id,
          user_id: session.userId,
        },
      },
      allow_promotion_codes: true,
      ...(restaurant.stripe_customer_id
        ? { customer: restaurant.stripe_customer_id }
        : { customer_email: restaurant.email || session.email }),
    });

    if (!checkout.url) {
      throw new Error("Stripe did not return a Checkout URL");
    }
    return json(200, { url: checkout.url });
  } catch (error) {
    return functionError(error, "Unable to start billing right now.");
  }
};
