import crypto from "node:crypto";
import {
  createRestaurantSession,
  enforceRateLimit,
  functionError,
  type FunctionEvent,
  json,
  readJsonBody,
  supabasePublicRequest,
} from "../lib/billing.ts";

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

interface LoginRow {
  id: string;
  restaurant_id: string;
  email: string;
  role: string;
  temp_password: boolean;
  restaurant_name: string;
  restaurant_slug: string;
  restaurant_is_active: boolean;
}

interface SupabaseError {
  message?: string;
}

export const handler = async (event: FunctionEvent) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const { email: rawEmail, password } = readJsonBody(event, 1_024);
    const email = String(rawEmail || "").trim().toLowerCase();
    if (
      !EMAIL_PATTERN.test(email) ||
      email.length > 254 ||
      typeof password !== "string" ||
      !password ||
      password.length > 256
    ) {
      return json(400, { error: "Invalid email or password." });
    }
    await enforceRateLimit(event, "restaurant_login_ip", email);

    const loginResponse = await supabasePublicRequest("rpc/restaurant_login", {
      method: "POST",
      body: JSON.stringify({
        p_email: email,
        p_password_hash: crypto
          .createHash("sha256")
          .update(password, "utf8")
          .digest("hex"),
      }),
    });
    const loginPayload = (await loginResponse.json()) as
      | LoginRow[]
      | SupabaseError;

    if (!loginResponse.ok) {
      const rateLimited = String(
        !Array.isArray(loginPayload) ? loginPayload.message || "" : ""
      ).includes(
        "Too many attempts"
      );
      return json(rateLimited ? 429 : 401, {
        error: rateLimited
          ? "Too many attempts. Please wait and try again."
          : "Invalid email or password.",
      });
    }

    const userData = Array.isArray(loginPayload) ? loginPayload[0] : undefined;
    if (!userData) {
      const pendingResponse = await supabasePublicRequest(
        `registration_requests?email=eq.${encodeURIComponent(email)}` +
          "&status=eq.pending&select=id&limit=1"
      );
      const pending = (await pendingResponse.json()) as Array<{ id: string }>;
      if (pendingResponse.ok && pending?.[0]) {
        return json(202, { status: "pending" });
      }
      return json(401, { error: "Invalid email or password." });
    }

    if (!userData.restaurant_is_active) {
      return json(403, {
        error:
          "Your restaurant account has been deactivated. Please contact support.",
      });
    }

    const user = {
      id: userData.id,
      email: userData.email,
      role: userData.role,
      restaurant_id: userData.restaurant_id,
      restaurant: {
        name: userData.restaurant_name,
        slug: userData.restaurant_slug,
        is_active: userData.restaurant_is_active,
      },
      temp_password: userData.temp_password,
    };
    const sessionToken = createRestaurantSession({
      userId: user.id,
      restaurantId: user.restaurant_id,
      email: user.email,
      role: user.role,
    });

    return json(200, { user, sessionToken });
  } catch (error) {
    return functionError(error, "Unable to sign in right now.");
  }
};
