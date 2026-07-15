import { getSafeErrorMessage, logErrorForDev } from "../utils/security";

const parseFunctionResponse = async (response: Response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

export const startRestaurantCheckout = async () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user?.session_token) {
      throw new Error("Please sign out and sign in again to manage billing.");
    }

    const response = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${user.session_token}` },
    });
    const payload = await parseFunctionResponse(response);

    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || "Billing is not configured yet.");
    }

    window.location.href = payload.url;
    return { success: true, error: null };
  } catch (error) {
    logErrorForDev(error, "startRestaurantCheckout");
    return {
      success: false,
      error: getSafeErrorMessage(error, "Billing is not configured yet."),
    };
  }
};

export const openBillingPortal = async () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user?.session_token) {
      throw new Error("Please sign out and sign in again to manage billing.");
    }

    const response = await fetch("/.netlify/functions/create-portal-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${user.session_token}` },
    });
    const payload = await parseFunctionResponse(response);

    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error || "Billing portal is not configured yet.");
    }

    window.location.href = payload.url;
    return { success: true, error: null };
  } catch (error) {
    logErrorForDev(error, "openBillingPortal");
    return {
      success: false,
      error: getSafeErrorMessage(error, "Billing portal is not configured yet."),
    };
  }
};
