import type Stripe from "stripe";
import {
  type FunctionEvent,
  getStripe,
  json,
  normalizeStripeStatus,
  requiredEnv,
  supabaseRequest,
} from "../lib/billing.ts";

interface RestaurantBillingRow {
  id: string;
  stripe_subscription_id?: string;
}

const getRawBody = (event: FunctionEvent) =>
  event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

const readRows = async <T>(path: string) => {
  const response = await supabaseRequest(path);
  const rows = (await response.json()) as T[];
  if (!response.ok) throw new Error("Unable to read billing data");
  return rows;
};

const updateRestaurant = async (
  restaurantId: string,
  updates: Record<string, unknown>
) => {
  const response = await supabaseRequest(
    `restaurants?id=eq.${encodeURIComponent(restaurantId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        ...updates,
        subscription_updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!response.ok) throw new Error("Unable to update subscription");
};

const findRestaurantByCustomer = async (customerId?: string) => {
  if (!customerId) return undefined;
  const rows = await readRows<RestaurantBillingRow>(
    `restaurants?stripe_customer_id=eq.${encodeURIComponent(customerId)}` +
      "&select=id,stripe_subscription_id&limit=1"
  );
  return rows[0];
};

const findRestaurantById = async (restaurantId?: string) => {
  if (!restaurantId) return undefined;
  const rows = await readRows<RestaurantBillingRow>(
    `restaurants?id=eq.${encodeURIComponent(restaurantId)}` +
      "&select=id,stripe_subscription_id&limit=1"
  );
  return rows[0];
};

const eventTime = (created: number) => new Date(created * 1000).toISOString();

const graceFromEvent = (created: number) => {
  const date = new Date(created * 1000);
  date.setUTCDate(date.getUTCDate() + 10);
  return date.toISOString();
};

const syncSubscription = async (
  subscription: Stripe.Subscription,
  created: number,
  markPaid = false
) => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const restaurant =
    (await findRestaurantById(subscription.metadata.restaurant_id)) ||
    (await findRestaurantByCustomer(customerId));
  if (!restaurant) return;

  if (
    restaurant.stripe_subscription_id &&
    restaurant.stripe_subscription_id !== subscription.id
  ) {
    return;
  }

  const item = subscription.items.data[0];
  const legacySubscription = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStart = item?.current_period_start ?? legacySubscription.current_period_start;
  const periodEnd = item?.current_period_end ?? legacySubscription.current_period_end;
  const status = normalizeStripeStatus(subscription.status);
  const updates: Record<string, unknown> = {
    subscription_status: status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: item?.price?.id || null,
    current_period_start: periodStart ? eventTime(periodStart) : null,
    current_period_end: periodEnd ? eventTime(periodEnd) : null,
    grace_until: status === "past_due" ? graceFromEvent(created) : null,
  };
  if (markPaid) updates.last_payment_at = eventTime(created);
  await updateRestaurant(restaurant.id, updates);
};

const subscriptionIdFromInvoice = (invoice: Stripe.Invoice) => {
  const compatibleInvoice = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const reference =
    compatibleInvoice.subscription ||
    invoice.parent?.subscription_details?.subscription;
  return typeof reference === "string" ? reference : reference?.id;
};

const wasProcessed = async (eventId: string) => {
  const rows = await readRows<{ event_id: string }>(
    `stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}` +
      "&select=event_id&limit=1"
  );
  return Boolean(rows[0]);
};

const markProcessed = async (event: Stripe.Event) => {
  const response = await supabaseRequest("stripe_webhook_events", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ event_id: event.id, event_type: event.type }),
  });
  if (!response.ok) throw new Error("Unable to record Stripe event");
};

export const handler = async (event: FunctionEvent) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const signature =
    event.headers?.["stripe-signature"] ||
    event.headers?.["Stripe-Signature"];
  if (!signature) return json(400, { error: "Invalid Stripe signature" });

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = getStripe().webhooks.constructEvent(
      getRawBody(event),
      signature,
      requiredEnv("STRIPE_WEBHOOK_SECRET")
    );
  } catch {
    return json(400, { error: "Invalid Stripe signature" });
  }

  try {
    if (await wasProcessed(stripeEvent.id)) {
      return json(200, { received: true });
    }

    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        const checkout = stripeEvent.data.object;
        const subscriptionId =
          typeof checkout.subscription === "string"
            ? checkout.subscription
            : checkout.subscription?.id;
        if (subscriptionId) {
          await syncSubscription(
            await getStripe().subscriptions.retrieve(subscriptionId),
            stripeEvent.created
          );
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncSubscription(
          await getStripe().subscriptions.retrieve(stripeEvent.data.object.id),
          stripeEvent.created
        );
        break;
      case "customer.subscription.deleted":
        await syncSubscription(stripeEvent.data.object, stripeEvent.created);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const subscriptionId = subscriptionIdFromInvoice(
          stripeEvent.data.object
        );
        if (subscriptionId) {
          await syncSubscription(
            await getStripe().subscriptions.retrieve(subscriptionId),
            stripeEvent.created,
            stripeEvent.type === "invoice.paid"
          );
        }
        break;
      }
      default:
        break;
    }

    await markProcessed(stripeEvent);
    return json(200, { received: true });
  } catch (error) {
    console.error(
      "Stripe webhook handling failed",
      error instanceof Error ? error.message : error
    );
    return json(500, { error: "Webhook handling failed" });
  }
};
