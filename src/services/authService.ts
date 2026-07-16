import { supabase } from "../config/supabase";
import type { PasswordResetRequest } from "../config/supabase";
import { generateTempPassword, hashPassword } from "../utils/helpers";
import {
  getSafeErrorMessage,
  logErrorForDev,
  normalizeEmail,
} from "../utils/security";

export const requestPasswordReset = async (email: string) => {
  try {
    const response = await fetch("/.netlify/functions/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizeEmail(email) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Unable to submit reset request.");
    return { success: true, error: null };
  } catch (error) {
    logErrorForDev(error, "request_password_reset");
    return {
      success: false,
      error: getSafeErrorMessage(error, "Unable to submit reset request."),
    };
  }
};

export const subscribeToPasswordResetRequests = (
  callback: (requests: PasswordResetRequest[]) => void
) => {
  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from("password_reset_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (!error && data) {
      callback(data as PasswordResetRequest[]);
    }
  };

  fetchRequests();

  return supabase
    .channel("password-reset-requests")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "password_reset_requests",
      },
      () => fetchRequests()
    )
    .subscribe();
};

export const approvePasswordReset = async (
  requestId: string,
  adminId: string
) => {
  try {
    const temporaryPassword = generateTempPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const { data, error } = await supabase.rpc("admin_approve_password_reset", {
      p_request_id: requestId,
      p_admin_id: adminId,
      p_password_hash: passwordHash,
    });

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) {
      throw new Error(row?.message || "Unable to approve reset request.");
    }

    return {
      success: true,
      credentials: {
        email: row.email as string,
        password: temporaryPassword,
        restaurantName: row.restaurant_name as string,
      },
      error: null,
    };
  } catch (error) {
    logErrorForDev(error, "admin_approve_password_reset");
    return {
      success: false,
      credentials: null,
      error: getSafeErrorMessage(error, "Unable to approve reset request."),
    };
  }
};

export const rejectPasswordReset = async (
  requestId: string,
  adminId: string,
  reason: string
) => {
  try {
    const { data, error } = await supabase.rpc("admin_reject_password_reset", {
      p_request_id: requestId,
      p_admin_id: adminId,
      p_rejection_reason: reason || null,
    });

    if (error) throw error;
    return { success: Boolean(data), error: null };
  } catch (error) {
    logErrorForDev(error, "admin_reject_password_reset");
    return {
      success: false,
      error: getSafeErrorMessage(error, "Unable to reject reset request."),
    };
  }
};
