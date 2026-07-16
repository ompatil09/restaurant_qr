import {
  enforceRateLimit,
  functionError,
  type FunctionEvent,
  json,
  readJsonBody,
  supabasePublicRequest,
} from "../lib/billing.ts";
import { validatedEmail } from "../lib/validation.ts";

export const handler = async (event: FunctionEvent) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const email = validatedEmail(readJsonBody(event, 1_024).email);
    await enforceRateLimit(event, "password_reset_ip", email);
    const response = await supabasePublicRequest("rpc/request_password_reset", {
      method: "POST",
      body: JSON.stringify({ p_email: email }),
    });
    if (!response.ok) {
      throw new Error("Password reset RPC failed");
    }

    return json(200, {
      success: true,
      message: "If the account exists, the reset request has been received.",
    });
  } catch (error) {
    return functionError(error, "Unable to submit the reset request right now.");
  }
};
