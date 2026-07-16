import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  enforceRateLimit,
  functionError,
  getRestaurantContext,
  type FunctionEvent,
  HttpError,
  json,
  readJsonBody,
  requiredEnv,
} from "../lib/billing.ts";
import { validateImageRequest } from "../lib/validation.ts";

export const handler = async (event: FunctionEvent) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const input = validateImageRequest(readJsonBody(event, 1_024));
    const { session } = await getRestaurantContext(event);
    await enforceRateLimit(event, "image_upload", session.userId);
    const path = `${input.folder}/${session.restaurantId}/${Date.now()}-${crypto.randomUUID()}.${input.extension}`;
    const admin = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data, error } = await admin.storage
      .from("menu-images")
      .createSignedUploadUrl(path);
    if (error || !data?.token) {
      throw new HttpError(503, "Image upload is temporarily unavailable.");
    }

    return json(200, { path, token: data.token });
  } catch (error) {
    return functionError(error, "Unable to prepare image upload.");
  }
};
