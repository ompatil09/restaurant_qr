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
    if (!user?.restaurant_id || !user?.id || !user?.email) {
      throw new Error("Restaurant session not found.");
    }

    const response = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: user.restaurant_id,
        userId: user.id,
        email: user.email,
      }),
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
    if (!user?.restaurant_id) {
      throw new Error("Restaurant session not found.");
    }

    const response = await fetch("/.netlify/functions/create-portal-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: user.restaurant_id }),
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
