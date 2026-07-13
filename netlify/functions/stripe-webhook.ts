import crypto from "crypto";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const getRawBody = (event: any) =>
  event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

const verifyStripeSignature = (rawBody: string, signatureHeader: string) => {
  const webhookSecret = requiredEnv("STRIPE_WEBHOOK_SECRET");
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
};

const updateRestaurant = async (
  restaurantId: string,
  updates: Record<string, unknown>
) => {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(
    `${supabaseUrl}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        ...updates,
        subscription_updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!response.ok) throw new Error("Unable to update subscription");
};

const findRestaurantIdByCustomer = async (customerId?: string) => {
  if (!customerId) return "";
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(
    `${supabaseUrl}/rest/v1/restaurants?stripe_customer_id=eq.${encodeURIComponent(
      customerId
    )}&select=id`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  );
  const rows = await response.json();
  return rows?.[0]?.id || "";
};

const toIso = (seconds?: number) =>
  seconds ? new Date(seconds * 1000).toISOString() : null;

const graceFromNow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 10);
  return date.toISOString();
};

const handleSubscription = async (subscription: any) => {
  const restaurantId =
    subscription?.metadata?.restaurant_id ||
    (await findRestaurantIdByCustomer(subscription?.customer));
  if (!restaurantId) return;

  await updateRestaurant(restaurantId, {
    subscription_status: subscription.status || "inactive",
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    stripe_price_id: subscription.items?.data?.[0]?.price?.id || null,
    current_period_start: toIso(subscription.current_period_start),
    current_period_end: toIso(subscription.current_period_end),
    grace_until:
      subscription.status === "past_due" ? graceFromNow() : null,
  });
};

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const rawBody = getRawBody(event);
  const signature = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"];
  if (!signature || !verifyStripeSignature(rawBody, signature)) {
    return json(400, { error: "Invalid Stripe signature" });
  }

  try {
    const stripeEvent = JSON.parse(rawBody);
    const object = stripeEvent?.data?.object;

    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const restaurantId = object?.metadata?.restaurant_id;
        if (restaurantId) {
          await updateRestaurant(restaurantId, {
            subscription_status: "active",
            stripe_customer_id: object.customer,
            stripe_subscription_id: object.subscription,
            stripe_price_id: process.env.STRIPE_PRICE_ID_RESTAURANT_MONTHLY || null,
            last_payment_at: new Date().toISOString(),
            grace_until: null,
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscription(object);
        break;
      case "invoice.payment_succeeded": {
        const restaurantId = await findRestaurantIdByCustomer(object?.customer);
        if (restaurantId) {
          await updateRestaurant(restaurantId, {
            subscription_status: "active",
            last_payment_at: new Date().toISOString(),
            grace_until: null,
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const restaurantId = await findRestaurantIdByCustomer(object?.customer);
        if (restaurantId) {
          await updateRestaurant(restaurantId, {
            subscription_status: "past_due",
            grace_until: graceFromNow(),
          });
        }
        break;
      }
      default:
        break;
    }

    return json(200, { received: true });
  } catch {
    return json(500, { error: "Webhook handling failed" });
  }
};
