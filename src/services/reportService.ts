import { supabase } from "../config/supabase";

export type ReportPreset =
  | "today"
  | "yesterday"
  | "7days"
  | "30days"
  | "month"
  | "custom";

export interface ReportRange {
  start: Date;
  end: Date;
  groupBy: "hour" | "day";
  label: string;
}

export interface ReportOverview {
  total_revenue: number;
  total_orders: number;
  average_order_value: number;
  items_sold: number;
  served_orders: number;
  cancelled_orders: number;
  open_orders: number;
  top_item_name: string | null;
  top_item_quantity: number;
  most_active_table: string | null;
  most_active_table_orders: number;
}

export interface ReportTrendPoint {
  period_start: string;
  revenue: number;
  order_count: number;
}

export interface ReportTopItem {
  item_name: string;
  category_name: string;
  food_type: string;
  quantity_sold: number;
  revenue: number;
  average_price: number;
}

export interface ReportCategorySale {
  category_name: string;
  quantity_sold: number;
  revenue: number;
}

export interface ReportFoodTypeSale {
  food_type: string;
  quantity_sold: number;
  revenue: number;
}

export interface ReportTablePerformance {
  table_number: string;
  order_count: number;
  revenue: number;
  average_order_value: number;
  last_order_time: string;
}

export interface ReportStatusBreakdown {
  status: string;
  order_count: number;
  revenue: number;
}

export interface ReportHourlyRush {
  hour: number;
  order_count: number;
  revenue: number;
}

export interface ReportOrderSummary {
  id: string;
  order_number: string;
  table_number: string;
  created_at: string;
  status: string;
  items_count: number;
  subtotal: number;
}

export interface ReportGstSummary {
  enabled: boolean;
  cgst_rate: number;
  sgst_rate: number;
  subtotal_before_gst: number;
  cgst_estimate: number;
  sgst_estimate: number;
  grand_total_estimate: number;
}

export interface ReportsAnalytics {
  overview: ReportOverview;
  revenue_trend: ReportTrendPoint[];
  top_items: ReportTopItem[];
  category_sales: ReportCategorySale[];
  food_type_sales: ReportFoodTypeSale[];
  table_performance: ReportTablePerformance[];
  status_breakdown: ReportStatusBreakdown[];
  hourly_rush: ReportHourlyRush[];
  orders: ReportOrderSummary[];
  gst: ReportGstSummary;
}

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const addDays = (date: Date, days: number) => {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
};

const parseDateInput = (value: string) =>
  value ? startOfDay(new Date(`${value}T00:00:00`)) : null;

export const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const buildReportRange = (
  preset: ReportPreset,
  customStart = "",
  customEnd = ""
): ReportRange | null => {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  if (preset === "today") {
    return { start: today, end: tomorrow, groupBy: "hour", label: "Today" };
  }

  if (preset === "yesterday") {
    return {
      start: addDays(today, -1),
      end: today,
      groupBy: "hour",
      label: "Yesterday",
    };
  }

  if (preset === "7days" || preset === "30days") {
    const days = preset === "7days" ? 7 : 30;
    return {
      start: addDays(today, -(days - 1)),
      end: tomorrow,
      groupBy: "day",
      label: `Last ${days} days`,
    };
  }

  if (preset === "month") {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      end: tomorrow,
      groupBy: "day",
      label: "This month",
    };
  }

  const start = parseDateInput(customStart);
  const inclusiveEnd = parseDateInput(customEnd);
  if (!start || !inclusiveEnd || inclusiveEnd < start) return null;

  return {
    start,
    end: addDays(inclusiveEnd, 1),
    groupBy: "day",
    label: `${customStart} to ${customEnd}`,
  };
};

export const fetchReportsAnalytics = async (range: ReportRange) => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (!user?.id || !user?.restaurant_id) {
    return { data: null, error: new Error("Restaurant session not found") };
  }

  const { data, error } = await supabase.rpc(
    "restaurant_get_reports_analytics",
    {
      p_user_id: user.id,
      p_restaurant_id: user.restaurant_id,
      p_start_date: range.start.toISOString(),
      p_end_date: range.end.toISOString(),
      p_group_by: range.groupBy,
      p_order_limit: 100,
    }
  );

  return {
    data: error ? null : (data as ReportsAnalytics),
    error,
  };
};
