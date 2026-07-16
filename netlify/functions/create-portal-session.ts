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
    if (!restaurant.stripe_customer_id) {
      throw new HttpError(400, "No Stripe billing account exists yet.");
    }

    const portal = await getStripe().billingPortal.sessions.create({
      customer: restaurant.stripe_customer_id,
      return_url: `${requiredEnv("APP_URL").replace(/\/$/, "")}/restaurant/settings`,
    });
    return json(200, { url: portal.url });
  } catch (error) {
    return functionError(error, "Unable to open billing right now.");
  }
};
