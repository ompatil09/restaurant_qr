import type { Restaurant } from "../config/supabase";

export type RestaurantAccessState = "active" | "grace" | "locked";

export interface RestaurantAccessStatus {
  state: RestaurantAccessState;
  canUseDashboard: boolean;
  canUseOrdering: boolean;
  message?: string;
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const LOCKED_STATUSES = new Set(["unpaid", "cancelled", "inactive"]);

const isFutureDate = (value?: string) =>
  Boolean(value && new Date(value).getTime() > Date.now());

export const getRestaurantAccessStatus = (
  restaurant?: Pick<
    Restaurant,
    "subscription_status" | "grace_until" | "current_period_end" | "is_active"
  > | null
): RestaurantAccessStatus => {
  if (!restaurant) {
    return {
      state: "active",
      canUseDashboard: true,
      canUseOrdering: true,
    };
  }

  if (restaurant.is_active === false) {
    return {
      state: "locked",
      canUseDashboard: false,
      canUseOrdering: false,
      message: "This restaurant account is inactive.",
    };
  }

  const status = restaurant.subscription_status || "active";

  if (ACTIVE_STATUSES.has(status)) {
    return {
      state: "active",
      canUseDashboard: true,
      canUseOrdering: true,
    };
  }

  if (status === "past_due" && isFutureDate(restaurant.grace_until)) {
    return {
      state: "grace",
      canUseDashboard: true,
      canUseOrdering: true,
      message:
        "Payment pending. Please update billing to avoid service interruption.",
    };
  }

  if (LOCKED_STATUSES.has(status) || status === "past_due") {
    return {
      state: "locked",
      canUseDashboard: false,
      canUseOrdering: false,
      message: "Payment required. Please renew your subscription to continue.",
    };
  }

  return {
    state: "active",
    canUseDashboard: true,
    canUseOrdering: true,
  };
};

export const isRestaurantSubscriptionActive = (
  restaurant?: Pick<
    Restaurant,
    "subscription_status" | "grace_until" | "current_period_end" | "is_active"
  > | null
) => getRestaurantAccessStatus(restaurant).canUseOrdering;
