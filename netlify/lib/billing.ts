import crypto from "node:crypto";
import Stripe from "stripe";

export class HttpError extends Error {
  statusCode: number;
  headers?: Record<string, string>;

  constructor(
    statusCode: number,
    message: string,
    headers?: Record<string, string>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.headers = headers;
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

export const json = (
  statusCode: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  },
  body: JSON.stringify(body),
});

export const readJsonBody = <T extends Record<string, unknown>>(
  event: FunctionEvent,
  maxBytes = 16_384
): T => {
  const body = event.body || "";
  if (!body || Buffer.byteLength(body, "utf8") > maxBytes) {
    throw new HttpError(400, "Invalid request.");
  }

  try {
    const value = JSON.parse(body);
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error("Body must be an object");
    }
    return value as T;
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
};

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

export const supabasePublicRequest = (
  path: string,
  options: RequestInit = {}
) => {
  const publicKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!publicKey) throw new HttpError(500, "Server configuration is incomplete.");
  return fetch(`${requiredEnv("SUPABASE_URL")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${publicKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
};

const clientIp = (event: FunctionEvent) =>
  event.headers?.["x-nf-client-connection-ip"] ||
  event.headers?.["X-Nf-Client-Connection-Ip"] ||
  "local";

export const enforceRateLimit = async (
  event: FunctionEvent,
  action: string,
  identity: string
) => {
  const identifierHash = crypto
    .createHash("sha256")
    .update(`${clientIp(event)}:${identity.trim().toLowerCase()}`, "utf8")
    .digest("hex");
  let response = await supabasePublicRequest("rpc/consume_api_rate_limit", {
    method: "POST",
    body: JSON.stringify({
      p_action: action,
      p_identifier_hash: identifierHash,
    }),
  });
  // Part 5 compatibility until the Part 8 one-way limiter RPC is installed.
  if (response.status === 404) {
    response = await supabasePublicRequest("rpc/record_rate_limit_attempt", {
      method: "POST",
      body: JSON.stringify({
        p_action: action,
        p_identifier_hash: identifierHash,
        p_success: false,
      }),
    });
  }
  const payload = await response.json();
  if (!response.ok) {
    throw new HttpError(503, "Request protection is temporarily unavailable.");
  }

  const row = Array.isArray(payload) ? payload[0] : payload;
  if (row?.allowed === false) {
    const retryAfter = Math.max(1, Number(row.retry_after_seconds) || 60);
    throw new HttpError(
      429,
      "Too many attempts. Please wait and try again.",
      { "Retry-After": String(retryAfter) }
    );
  }
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

export const getRestaurantContext = async (event: FunctionEvent) => {
  const session = requireRestaurantSession(event);
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

export const getBillingContext = async (event: FunctionEvent) => {
  const context = await getRestaurantContext(event);
  const { session } = context;
  if (session.role !== "owner") {
    throw new HttpError(403, "Only the restaurant owner can manage billing.");
  }
  return context;
};

export const functionError = (error: unknown, fallback: string) => {
  if (error instanceof HttpError) {
    return json(error.statusCode, { error: error.message }, error.headers);
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
