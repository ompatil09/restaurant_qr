import { HttpError } from "./billing.ts";

export interface ReportRequest {
  start: string;
  end: string;
  groupBy: "hour" | "day";
}

export interface ReportOrderRow {
  id: string;
  order_number: string;
  table_number?: string | null;
  items?: unknown;
  subtotal?: number | string | null;
  total?: number | string | null;
  status?: string | null;
  created_at: string;
}

export interface ReportMenuItemRow {
  id: string;
  name: string;
  category?: string | null;
  food_type?: string | null;
}

export interface ReportSettingsRow {
  gst_enabled?: boolean | null;
  cgst_rate?: number | string | null;
  sgst_rate?: number | string | null;
}

const MAX_REPORT_DAYS = 366;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const money = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000_000
    ? number
    : 0;
};
const rounded = (value: number) => Math.round(value * 100) / 100;
const label = (value: unknown, fallback: string, max = 100) =>
  String(value ?? "").trim().slice(0, max) || fallback;

export const validateReportRequest = (
  value: Record<string, unknown>,
  now = new Date()
): ReportRequest => {
  const start = typeof value.start === "string" ? value.start : "";
  const end = typeof value.end === "string" ? value.end : "";
  const groupBy = value.groupBy;
  if (
    !ISO_DATE_TIME.test(start) ||
    !ISO_DATE_TIME.test(end) ||
    (groupBy !== "hour" && groupBy !== "day")
  ) {
    throw new HttpError(400, "Choose a valid report range.");
  }

  const duration = new Date(end).getTime() - new Date(start).getTime();
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_REPORT_DAYS * 86_400_000 ||
    new Date(end).getTime() > now.getTime() + 2 * 86_400_000
  ) {
    throw new HttpError(400, "Choose a valid report range.");
  }
  return { start, end, groupBy };
};

export const aggregateReports = (
  orders: ReportOrderRow[],
  menuItems: ReportMenuItemRow[],
  settings: ReportSettingsRow,
  groupBy: "hour" | "day"
) => {
  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const itemSales = new Map<string, {
    item_name: string;
    category_name: string;
    food_type: string;
    quantity_sold: number;
    revenue: number;
  }>();
  const categorySales = new Map<string, { quantity_sold: number; revenue: number }>();
  const foodSales = new Map<string, { quantity_sold: number; revenue: number }>();
  const tableSales = new Map<string, { order_count: number; revenue: number; last_order_time: string }>();
  const statusSales = new Map<string, { order_count: number; revenue: number }>();
  const trend = new Map<string, { order_count: number; revenue: number }>();
  const hourly = new Map<number, { order_count: number; revenue: number }>();
  const orderRows: Array<Record<string, unknown>> = [];
  let totalRevenue = 0;
  let itemsSold = 0;
  let servedOrders = 0;
  let cancelledOrders = 0;
  let openOrders = 0;

  orders.forEach((order, index) => {
    const status = label(order.status, "new", 30).toLowerCase();
    const cancelled = status === "cancelled" || status === "rejected";
    const revenue = cancelled ? 0 : money(order.subtotal ?? order.total);
    const parsedDate = new Date(order.created_at);
    const createdAt = Number.isFinite(parsedDate.getTime()) ? parsedDate : new Date(0);
    const table = label(order.table_number, "Counter", 30);
    const items = Array.isArray(order.items) ? order.items.slice(0, 100) : [];
    let orderItemCount = 0;

    if (status === "served" || status === "completed") servedOrders += 1;
    if (cancelled) cancelledOrders += 1;
    if (["new", "pending", "accepted", "preparing", "ready"].includes(status)) {
      openOrders += 1;
    }

    const statusRow = statusSales.get(status) || { order_count: 0, revenue: 0 };
    statusRow.order_count += 1;
    statusRow.revenue += revenue;
    statusSales.set(status, statusRow);

    if (!cancelled) {
      totalRevenue += revenue;
      const tableRow = tableSales.get(table) || {
        order_count: 0,
        revenue: 0,
        last_order_time: createdAt.toISOString(),
      };
      tableRow.order_count += 1;
      tableRow.revenue += revenue;
      if (createdAt.toISOString() > tableRow.last_order_time) {
        tableRow.last_order_time = createdAt.toISOString();
      }
      tableSales.set(table, tableRow);

      const period = new Date(createdAt);
      if (groupBy === "hour") period.setUTCMinutes(0, 0, 0);
      else period.setUTCHours(0, 0, 0, 0);
      const periodKey = period.toISOString();
      const trendRow = trend.get(periodKey) || { order_count: 0, revenue: 0 };
      trendRow.order_count += 1;
      trendRow.revenue += revenue;
      trend.set(periodKey, trendRow);

      const hour = createdAt.getUTCHours();
      const hourRow = hourly.get(hour) || { order_count: 0, revenue: 0 };
      hourRow.order_count += 1;
      hourRow.revenue += revenue;
      hourly.set(hour, hourRow);
    }

    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const parsedQuantity = Number(item.quantity);
      const quantity = Number.isInteger(parsedQuantity)
        ? Math.min(99, Math.max(0, parsedQuantity))
        : 0;
      orderItemCount += quantity;
      if (cancelled || quantity === 0) continue;

      itemsSold += quantity;
      const menuItem = menuById.get(String(item.menu_item_id || ""));
      const itemName = label(item.name, menuItem?.name || "Unknown item");
      const category = label(item.category_name, menuItem?.category || "Uncategorized");
      const foodType = label(item.food_type, menuItem?.food_type || "unknown", 20);
      const itemRevenue = money(
        item.item_total ?? money(item.unit_price ?? item.base_price) * quantity
      );
      const key = `${itemName}\u0000${category}\u0000${foodType}`;
      const itemRow = itemSales.get(key) || {
        item_name: itemName,
        category_name: category,
        food_type: foodType,
        quantity_sold: 0,
        revenue: 0,
      };
      itemRow.quantity_sold += quantity;
      itemRow.revenue += itemRevenue;
      itemSales.set(key, itemRow);

      const categoryRow = categorySales.get(category) || { quantity_sold: 0, revenue: 0 };
      categoryRow.quantity_sold += quantity;
      categoryRow.revenue += itemRevenue;
      categorySales.set(category, categoryRow);
      const foodRow = foodSales.get(foodType) || { quantity_sold: 0, revenue: 0 };
      foodRow.quantity_sold += quantity;
      foodRow.revenue += itemRevenue;
      foodSales.set(foodType, foodRow);
    }

    if (index < 100) {
      orderRows.push({
        id: String(order.id || ""),
        order_number: label(order.order_number, "Order", 50),
        table_number: table,
        created_at: createdAt.toISOString(),
        status,
        items_count: orderItemCount,
        subtotal: rounded(money(order.subtotal ?? order.total)),
      });
    }
  });

  const topItems = [...itemSales.values()]
    .map((row) => ({
      ...row,
      revenue: rounded(row.revenue),
      average_price: rounded(row.revenue / Math.max(1, row.quantity_sold)),
    }))
    .sort((a, b) => b.quantity_sold - a.quantity_sold || b.revenue - a.revenue)
    .slice(0, 10);
  const tables = [...tableSales.entries()]
    .map(([table_number, row]) => ({
      table_number,
      order_count: row.order_count,
      revenue: rounded(row.revenue),
      average_order_value: rounded(row.revenue / Math.max(1, row.order_count)),
      last_order_time: row.last_order_time,
    }))
    .sort((a, b) => b.order_count - a.order_count || b.revenue - a.revenue)
    .slice(0, 20);
  const revenueOrders = orders.length - cancelledOrders;
  const gstEnabled = settings.gst_enabled === true;
  const cgstRate = Math.min(28, money(settings.cgst_rate));
  const sgstRate = Math.min(28, money(settings.sgst_rate));
  const cgst = gstEnabled ? rounded(totalRevenue * cgstRate / 100) : 0;
  const sgst = gstEnabled ? rounded(totalRevenue * sgstRate / 100) : 0;
  const mappedRows = <T extends { revenue: number }>(rows: T[]) =>
    rows.map((row) => ({ ...row, revenue: rounded(row.revenue) }));

  return {
    overview: {
      total_revenue: rounded(totalRevenue),
      total_orders: orders.length,
      average_order_value: rounded(totalRevenue / Math.max(1, revenueOrders)),
      items_sold: itemsSold,
      served_orders: servedOrders,
      cancelled_orders: cancelledOrders,
      open_orders: openOrders,
      top_item_name: topItems[0]?.item_name || null,
      top_item_quantity: topItems[0]?.quantity_sold || 0,
      most_active_table: tables[0]?.table_number || null,
      most_active_table_orders: tables[0]?.order_count || 0,
    },
    revenue_trend: mappedRows([...trend.entries()].map(([period_start, row]) => ({ period_start, ...row })))
      .sort((a, b) => a.period_start.localeCompare(b.period_start)),
    top_items: topItems,
    category_sales: mappedRows([...categorySales.entries()].map(([category_name, row]) => ({ category_name, ...row })))
      .sort((a, b) => b.revenue - a.revenue),
    food_type_sales: mappedRows([...foodSales.entries()].map(([food_type, row]) => ({ food_type, ...row })))
      .sort((a, b) => b.revenue - a.revenue),
    table_performance: tables,
    status_breakdown: mappedRows([...statusSales.entries()].map(([status, row]) => ({ status, ...row })))
      .sort((a, b) => b.order_count - a.order_count),
    hourly_rush: mappedRows([...hourly.entries()].map(([hour, row]) => ({ hour, ...row })))
      .sort((a, b) => a.hour - b.hour),
    orders: orderRows,
    gst: {
      enabled: gstEnabled,
      cgst_rate: cgstRate,
      sgst_rate: sgstRate,
      subtotal_before_gst: rounded(totalRevenue),
      cgst_estimate: cgst,
      sgst_estimate: sgst,
      grand_total_estimate: rounded(totalRevenue + cgst + sgst),
    },
  };
};
