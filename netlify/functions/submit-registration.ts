import {
  enforceRateLimit,
  functionError,
  type FunctionEvent,
  HttpError,
  json,
  readJsonBody,
  supabasePublicRequest,
} from "../lib/billing.ts";
import { validateRegistration } from "../lib/validation.ts";

export const handler = async (event: FunctionEvent) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const input = validateRegistration(readJsonBody(event, 4_096));
    await enforceRateLimit(event, "registration_ip", input.email);
    const response = await supabasePublicRequest("rpc/submit_registration_request", {
      method: "POST",
      body: JSON.stringify({
        p_restaurant_name: input.restaurant_name,
        p_owner_name: input.owner_name,
        p_phone: input.phone,
        p_email: input.email,
        p_city: input.city,
        p_address: input.address,
        p_restaurant_type: input.restaurant_type,
        p_heard_from: input.heard_from,
        p_notes: input.notes,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      const message = String(payload?.message || "");
      if (message.includes("Too many attempts")) {
        throw new HttpError(429, "Too many attempts. Please wait and try again.");
      }
      throw new HttpError(400, "Registration could not be submitted.");
    }
    return json(201, { success: true });
  } catch (error) {
    return functionError(error, "Unable to submit registration right now.");
  }
};
