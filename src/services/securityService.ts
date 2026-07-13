import { supabase } from "../config/supabase";
import {
  getRateLimitIdentifierHash,
  logErrorForDev,
  type RateLimitedAction,
} from "../utils/security";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const DEFAULT_ALLOWED: RateLimitResult = {
  allowed: true,
  retryAfterSeconds: 0,
};

export const checkRateLimit = async (
  action: RateLimitedAction,
  identifier: string
): Promise<RateLimitResult> => {
  try {
    const identifierHash = await getRateLimitIdentifierHash(identifier);
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_action: action,
      p_identifier_hash: identifierHash,
    });

    if (error) {
      logErrorForDev(error, "check_rate_limit");
      return DEFAULT_ALLOWED;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed ?? true),
      retryAfterSeconds: Number(row?.retry_after_seconds ?? 0),
    };
  } catch (error) {
    logErrorForDev(error, "check_rate_limit");
    return DEFAULT_ALLOWED;
  }
};

export const recordRateLimitAttempt = async (
  action: RateLimitedAction,
  identifier: string,
  success = false
) => {
  try {
    const identifierHash = await getRateLimitIdentifierHash(identifier);
    const { error } = await supabase.rpc("record_rate_limit_attempt", {
      p_action: action,
      p_identifier_hash: identifierHash,
      p_success: success,
    });

    if (error) logErrorForDev(error, "record_rate_limit_attempt");
  } catch (error) {
    logErrorForDev(error, "record_rate_limit_attempt");
  }
};

export const clearRateLimit = async (
  action: RateLimitedAction,
  identifier: string
) => {
  try {
    const identifierHash = await getRateLimitIdentifierHash(identifier);
    const { error } = await supabase.rpc("clear_rate_limit", {
      p_action: action,
      p_identifier_hash: identifierHash,
    });

    if (error) logErrorForDev(error, "clear_rate_limit");
  } catch (error) {
    logErrorForDev(error, "clear_rate_limit");
  }
};
