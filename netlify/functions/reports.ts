import {
  enforceRateLimit,
  functionError,
  type FunctionEvent,
  HttpError,
  json,
  readJsonBody,
  requireRestaurantSession,
  supabasePublicRequest,
} from "../lib/billing.ts";
import {
  aggregateReports,
  type ReportMenuItemRow,
  type ReportOrderRow,
  type ReportSettingsRow,
  validateReportRequest,
} from "../lib/reports.ts";

const readRpcArray = async <T>(name: string, body: Record<string, unknown>) => {
  const response = await supabasePublicRequest(`rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data)) {
    throw new HttpError(503, "Report data is temporarily unavailable.");
  }
  return data as T[];
};

export const handler = async (event: FunctionEvent) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const request = validateReportRequest(readJsonBody(event, 1_024));
    const session = requireRestaurantSession(event);
    await enforceRateLimit(event, "reports_read", session.userId);
    const analyticsResponse = await supabasePublicRequest(
      "rpc/restaurant_get_reports_analytics",
      {
        method: "POST",
        body: JSON.stringify({
          p_user_id: session.userId,
          p_restaurant_id: session.restaurantId,
          p_start_date: request.start,
          p_end_date: request.end,
          p_group_by: request.groupBy,
          p_order_limit: 100,
        }),
      }
    );
    const analytics = await analyticsResponse.json().catch(() => null);
    if (
      analyticsResponse.ok &&
      analytics &&
      !Array.isArray(analytics) &&
      typeof analytics === "object"
    ) {
      return json(200, { data: analytics });
    }

    const missingAnalyticsRpc =
      analyticsResponse.status === 404 &&
      analytics &&
      typeof analytics === "object" &&
      "code" in analytics &&
      analytics.code === "PGRST202";
    if (!missingAnalyticsRpc) {
      throw new HttpError(503, "Report data is temporarily unavailable.");
    }

    const identity = {
      p_user_id: session.userId,
      p_restaurant_id: session.restaurantId,
    };
    const [orders, menuItems, settingsResponse] = await Promise.all([
      readRpcArray<ReportOrderRow>("restaurant_list_orders_range", {
        ...identity,
        p_from: request.start,
        p_to: request.end,
      }),
      readRpcArray<ReportMenuItemRow>("restaurant_list_menu_items", identity),
      supabasePublicRequest(
        `restaurants?id=eq.${encodeURIComponent(session.restaurantId)}` +
          "&select=gst_enabled,cgst_rate,sgst_rate&limit=1"
      ),
    ]);
    const settingsRows = await settingsResponse.json().catch(() => []);
    const settings =
      settingsResponse.ok && Array.isArray(settingsRows)
        ? settingsRows[0] as ReportSettingsRow | undefined
        : undefined;

    return json(200, {
      data: aggregateReports(orders, menuItems, settings || {}, request.groupBy),
    });
  } catch (error) {
    return functionError(error, "Unable to load reports right now.");
  }
};
