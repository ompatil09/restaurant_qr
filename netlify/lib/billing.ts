import crypto from "node:crypto";
import Stripe from "stripe";

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface FunctionEvent {
  httpMethod: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
}

export interface RestaurantSession {
  userId: string;
  restaurantId: string;
  email: string;
  role: string;
  exp: number;
}

export interface BillingRestaurant {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  subscription_status?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

export const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new HttpError(500, "Server configuration is incomplete.");
  return value;
};

export const supabaseRequest = (path: string, options: RequestInit = {}) => {
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${requiredEnv("SUPABASE_URL")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
};

let stripeClient: Stripe | undefined;
export const getStripe = () =>
  (stripeClient ||= new Stripe(requiredEnv("STRIPE_SECRET_KEY")));

const sign = (payload: string) =>
  crypto
    .createHmac("sha256", requiredEnv("APP_SESSION_SECRET"))
    .update(payload)
    .digest("base64url");

export const createRestaurantSession = (
  session: Omit<RestaurantSession, "exp">
) => {
  if (requiredEnv("APP_SESSION_SECRET").length < 32) {
    throw new HttpError(500, "Server configuration is incomplete.");
  }

  const payload = Buffer.from(
    JSON.stringify({
      ...session,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

export const requireRestaurantSession = (
  event: FunctionEvent
): RestaurantSession => {
  const authorization =
    event.headers?.authorization || event.headers?.Authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const [payload, signature, extra] = token.split(".");

  if (!payload || !signature || extra) {
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  }

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as RestaurantSession;
    if (
      !session.userId ||
      !session.restaurantId ||
      !session.email ||
      !session.role ||
      !Number.isInteger(session.exp) ||
      session.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new Error("Invalid session");
    }
    return session;
  } catch {
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  }
};

export const getBillingContext = async (event: FunctionEvent) => {
  const session = requireRestaurantSession(event);
  if (session.role !== "owner") {
    throw new HttpError(403, "Only the restaurant owner can manage billing.");
  }

  const userResponse = await supabaseRequest(
    `users?id=eq.${encodeURIComponent(session.userId)}` +
      `&restaurant_id=eq.${encodeURIComponent(session.restaurantId)}` +
      `&email=eq.${encodeURIComponent(session.email)}` +
      "&is_active=eq.true&select=id"
  );
  const users = (await userResponse.json()) as Array<{ id: string }>;
  if (!userResponse.ok || !users?.[0]) {
    throw new HttpError(401, "Your session has expired. Please sign in again.");
  }

  const restaurantResponse = await supabaseRequest(
    `restaurants?id=eq.${encodeURIComponent(session.restaurantId)}` +
      "&select=id,name,email,is_active,subscription_status,stripe_customer_id,stripe_subscription_id"
  );
  const restaurants = (await restaurantResponse.json()) as BillingRestaurant[];
  const restaurant = restaurants?.[0];
  if (!restaurantResponse.ok || !restaurant?.is_active) {
    throw new HttpError(403, "This restaurant account is not active.");
  }

  return { session, restaurant };
};

export const functionError = (error: unknown, fallback: string) => {
  if (error instanceof HttpError) {
    return json(error.statusCode, { error: error.message });
  }
  console.error(fallback, error instanceof Error ? error.message : error);
  return json(500, { error: fallback });
};

export const normalizeStripeStatus = (status: Stripe.Subscription.Status) => {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "unpaid":
      return status;
    case "canceled":
      return "cancelled";
    default:
      return "inactive";
  }
};
