import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  IndianRupee,
  Lightbulb,
  Package,
  Printer,
  ReceiptText,
  ShoppingBag,
  Table2,
  Trophy,
  XCircle,
} from "lucide-react";
import { Button, Card, Loading } from "../../components/ui";
import { TableBillPanel } from "../../components/reports/TableBillPanel";
import type { Restaurant } from "../../config/supabase";
import { APP_CONFIG } from "../../config/config";
import {
  buildReportRange,
  fetchReportsAnalytics,
  toDateInputValue,
  type ReportPreset,
  type ReportsAnalytics,
} from "../../services/reportService";
import { formatCurrency, formatDateTime } from "../../utils/helpers";
import { logErrorForDev } from "../../utils/security";

interface ReportsProps {
  restaurant: Restaurant | null;
}

type DetailView = "items" | "tables" | "orders";

const CHART_COLORS = [
  "#214c37",
  "#4f705e",
  "#789181",
  "#a5b4aa",
  "#68706a",
  "#c5cec8",
];

const tooltipStyle = {
  border: "1px solid #deded8",
  borderRadius: 6,
  boxShadow: "0 8px 24px rgba(23, 25, 22, 0.08)",
};

const formatHour = (hour: number) => {
  const suffix = hour >= 12 ? "PM" : "AM";
  const value = hour % 12 || 12;
  return `${value} ${suffix}`;
};

const formatTrendLabel = (value: string, groupBy: "hour" | "day") => {
  const date = new Date(value);
  return groupBy === "hour"
    ? date.toLocaleTimeString("en-IN", { hour: "numeric" })
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const foodTypeLabel = (value: string) =>
  ({ veg: "Veg", non_veg: "Non-Veg", egg: "Egg", jain: "Jain" }[value] ||
  "Unknown");

const statusLabel = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");

const escapeCsv = (value: string | number) =>
  `"${String(value).replace(/"/g, '""')}"`;

const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const content = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${content}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
}> = ({ icon, label, value, helper }) => (
  <Card className="min-h-[138px] rounded-[8px] p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <p className="mt-2 break-words text-2xl font-bold leading-tight text-text">
          {value}
        </p>
        <p className="mt-2 text-xs text-text-secondary">{helper}</p>
      </div>
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[6px] bg-[#edf2ee] text-[#214c37]">
        {icon}
      </span>
    </div>
  </Card>
);

const ChartCard: React.FC<{
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, children, className = "" }) => (
  <Card className={`rounded-[8px] p-5 sm:p-6 ${className}`}>
    <h3 className="font-bold text-text">{title}</h3>
    <p className="mt-1 text-sm text-text-secondary">{description}</p>
    <div className="mt-5 h-72 min-w-0">{children}</div>
  </Card>
);

const EmptyChart: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex h-full items-center justify-center rounded-[6px] border border-dashed border-border text-sm text-text-secondary">
    {message}
  </div>
);

const Reports: React.FC<ReportsProps> = ({ restaurant }) => {
  const todayInput = toDateInputValue(new Date());
  const [preset, setPreset] = useState<ReportPreset>("today");
  const [customStart, setCustomStart] = useState(todayInput);
  const [customEnd, setCustomEnd] = useState(todayInput);
  const [detailView, setDetailView] = useState<DetailView>("items");
  const [data, setData] = useState<ReportsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const range = useMemo(
    () => buildReportRange(preset, customStart, customEnd),
    [customEnd, customStart, preset]
  );

  const loadReports = useCallback(async () => {
    if (!range) {
      setErrorMessage("Choose a valid custom date range.");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const result = await fetchReportsAnalytics(range);
      if (result.error || !result.data) throw result.error;
      setData(result.data);
    } catch (error) {
      logErrorForDev(error, "fetchReportsAnalytics");
      setData(null);
      setErrorMessage("Reports are temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const trendData = useMemo(
    () =>
      (data?.revenue_trend || []).map((point) => ({
        ...point,
        label: formatTrendLabel(point.period_start, range?.groupBy || "day"),
      })),
    [data, range?.groupBy]
  );

  const hourlyData = useMemo(
    () =>
      (data?.hourly_rush || []).map((point) => ({
        ...point,
        label: formatHour(point.hour),
      })),
    [data]
  );

  const insights = useMemo(() => {
    if (!data) return [];
    const result: string[] = [];
    if (data.overview.top_item_name) {
      result.push(
        `${data.overview.top_item_name} led sales with ${data.overview.top_item_quantity} items sold.`
      );
    }
    if (data.overview.most_active_table) {
      result.push(
        `${data.overview.most_active_table === "Counter" ? "Counter orders" : `Table ${data.overview.most_active_table}`} generated the most orders in this period.`
      );
    }
    const peak = [...data.hourly_rush].sort(
      (a, b) => b.order_count - a.order_count
    )[0];
    if (peak) {
      result.push(`The busiest hour started at ${formatHour(peak.hour)}.`);
    }
    if (
      data.overview.total_orders > 0 &&
      data.overview.cancelled_orders / data.overview.total_orders >= 0.1
    ) {
      result.push("Cancelled orders are above 10%. Review service delays.");
    }
    result.push(
      `Average order value was ${formatCurrency(data.overview.average_order_value)}.`
    );
    return result.slice(0, 4);
  }, [data]);

  const exportReport = () => {
    if (!data || !range) return;
    const rows: (string | number)[][] = [
      [`${APP_CONFIG.appName} Reports`, range.label],
      ["Revenue before GST", data.overview.total_revenue],
      ["Total orders", data.overview.total_orders],
      ["Average order value", data.overview.average_order_value],
      ["Items sold", data.overview.items_sold],
      ["Served orders", data.overview.served_orders],
      ["Cancelled orders", data.overview.cancelled_orders],
      [],
      ["Top Items"],
      ["Item", "Category", "Food type", "Quantity", "Revenue", "Average price"],
      ...data.top_items.map((item) => [
        item.item_name,
        item.category_name,
        foodTypeLabel(item.food_type),
        item.quantity_sold,
        item.revenue,
        item.average_price,
      ]),
      [],
      ["Orders"],
      ["Order", "Table", "Time", "Status", "Items", "Before GST"],
      ...data.orders.map((order) => [
        order.order_number,
        order.table_number,
        formatDateTime(order.created_at),
        statusLabel(order.status),
        order.items_count,
        order.subtotal,
      ]),
    ];
    downloadCsv(
      `rasivo-report-${range.start.toISOString().slice(0, 10)}.csv`,
      rows
    );
  };

  if (loading && !data) return <Loading text="Loading reports..." />;

  if (!data) {
    return (
      <Card className="mx-auto max-w-2xl rounded-[8px] py-12 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-text-secondary" />
        <h2 className="mt-4 text-xl font-bold">Reports unavailable</h2>
        <p className="mt-2 text-text-secondary">{errorMessage}</p>
        <Button className="mt-6" onClick={loadReports}>Retry</Button>
      </Card>
    );
  }

  const overview = data.overview;
  const pieLabel = ({ name }: { name?: string }) => name || "";

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 border-b border-border pb-6 xl:flex-row xl:items-end">
        <div>
          <h2 className="text-2xl font-bold text-text">Reports & Analytics</h2>
          <p className="mt-2 text-text-secondary">
            Track sales, orders, top dishes, table performance, and customer demand.
          </p>
          <p className="mt-2 text-xs font-semibold text-[#214c37]">
            Revenue is shown before GST unless stated otherwise.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end xl:justify-end">
          <label className="text-sm font-semibold text-text">
            Date range
            <select
              value={preset}
              onChange={(event) => setPreset(event.target.value as ReportPreset)}
              className="input mt-1.5 min-w-[180px]"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
              <option value="month">This month</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
          {preset === "custom" && (
            <>
              <label className="text-sm font-semibold text-text">
                From
                <input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="input mt-1.5"
                />
              </label>
              <label className="text-sm font-semibold text-text">
                To
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={todayInput}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="input mt-1.5"
                />
              </label>
            </>
          )}
          <Button
            variant="outline"
            icon={<Download className="h-4 w-4" aria-hidden="true" />}
            onClick={exportReport}
            className="!border-[#214c37] !text-[#214c37] hover:!bg-[#214c37] hover:!text-white"
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            icon={<Printer className="h-4 w-4" aria-hidden="true" />}
            onClick={() => window.print()}
          >
            Print Report
          </Button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<IndianRupee className="h-5 w-5" />} label="Revenue" value={formatCurrency(overview.total_revenue)} helper="Before GST" />
        <MetricCard icon={<ShoppingBag className="h-5 w-5" />} label="Total Orders" value={String(overview.total_orders)} helper={range?.label || "Selected period"} />
        <MetricCard icon={<ReceiptText className="h-5 w-5" />} label="Average Order Value" value={formatCurrency(overview.average_order_value)} helper="Excludes cancelled orders" />
        <MetricCard icon={<Package className="h-5 w-5" />} label="Items Sold" value={String(overview.items_sold)} helper="Across completed and active orders" />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Served Orders" value={String(overview.served_orders)} helper="Served or completed" />
        <MetricCard icon={<XCircle className="h-5 w-5" />} label="Cancelled Orders" value={String(overview.cancelled_orders)} helper="Excluded from revenue" />
        <MetricCard icon={<Trophy className="h-5 w-5" />} label="Top Selling Item" value={overview.top_item_name || "No sales yet"} helper={overview.top_item_name ? `${overview.top_item_quantity} sold` : "Selected period"} />
        <MetricCard icon={<Table2 className="h-5 w-5" />} label="Most Active Table" value={overview.most_active_table ? (overview.most_active_table === "Counter" ? "Counter" : `Table ${overview.most_active_table}`) : "No table yet"} helper={`${overview.most_active_table_orders} orders`} />
      </div>

      {data.gst.enabled ? (
        <section className="grid gap-3 rounded-[8px] border border-[#cad5cd] bg-[#f0f4f1] p-4 sm:grid-cols-2 xl:grid-cols-4">
          <TaxValue label="Subtotal before GST" value={data.gst.subtotal_before_gst} />
          <TaxValue label={`CGST estimate (${data.gst.cgst_rate}%)`} value={data.gst.cgst_estimate} />
          <TaxValue label={`SGST estimate (${data.gst.sgst_rate}%)`} value={data.gst.sgst_estimate} />
          <TaxValue label="Grand total estimate" value={data.gst.grand_total_estimate} strong />
        </section>
      ) : (
        <div className="rounded-[8px] border border-border bg-white px-4 py-3 text-sm text-text-secondary">
          GST is disabled for this restaurant. Revenue values are unchanged.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Revenue Trend" description={`Revenue before GST · ${range?.label}`}>
          {trendData.length === 0 ? <EmptyChart message="No revenue in this period" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#ecece7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#777b75" />
                <YAxis tick={{ fontSize: 11 }} stroke="#777b75" tickFormatter={(value) => `${APP_CONFIG.defaultCurrency}${Math.round(Number(value) / 1000)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatCurrency(Number(value)), "Revenue"]} />
                <Area type="monotone" dataKey="revenue" stroke="#214c37" fill="#dce7e0" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Orders Trend" description={`Order volume · ${range?.label}`}>
          {trendData.length === 0 ? <EmptyChart message="No orders in this period" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#ecece7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#777b75" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#777b75" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="order_count" name="Orders" fill="#214c37" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top Selling Items" description="Top 10 dishes by quantity sold">
          {data.top_items.length === 0 ? <EmptyChart message="No item sales in this period" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.top_items} layout="vertical" margin={{ top: 0, right: 10, left: 12, bottom: 0 }}>
                <CartesianGrid stroke="#ecece7" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="item_name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="quantity_sold" name="Items sold" fill="#214c37" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Table Performance" description="Orders and revenue from the busiest tables">
          {data.table_performance.length === 0 ? <EmptyChart message="No table activity in this period" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.table_performance.slice(0, 8)} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#ecece7" vertical={false} />
                <XAxis dataKey="table_number" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="orders" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="revenue" orientation="right" hide />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar yAxisId="orders" dataKey="order_count" name="Orders" fill="#789181" radius={[3, 3, 0, 0]} />
                <Line yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenue" stroke="#214c37" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Revenue by Category" description="Menu category contribution">
          {data.category_sales.length === 0 ? <EmptyChart message="Category data is unavailable for this period" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.category_sales} dataKey="revenue" nameKey="category_name" innerRadius={56} outerRadius={92} paddingAngle={2} label={pieLabel}>
                  {data.category_sales.map((entry, index) => <Cell key={entry.category_name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Food Type Breakdown" description="Revenue by food preference">
          {data.food_type_sales.length === 0 ? <EmptyChart message="Food type data is unavailable" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.food_type_sales.map((entry) => ({ ...entry, label: foodTypeLabel(entry.food_type) }))} dataKey="revenue" nameKey="label" innerRadius={56} outerRadius={92} paddingAngle={2} label={pieLabel}>
                  {data.food_type_sales.map((entry, index) => <Cell key={entry.food_type} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Order Status Breakdown" description="Every order state in the selected period">
          {data.status_breakdown.length === 0 ? <EmptyChart message="No order status data" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.status_breakdown.map((entry) => ({ ...entry, label: statusLabel(entry.status) }))} dataKey="order_count" nameKey="label" innerRadius={56} outerRadius={92} paddingAngle={2} label={pieLabel}>
                  {data.status_breakdown.map((entry, index) => <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Hourly Rush Analysis" description="Orders by hour across the selected period">
          {hourlyData.length === 0 ? <EmptyChart message="No hourly demand data" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#ecece7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="order_count" name="Orders" fill="#214c37" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <Card className="rounded-[8px] border-[#cad5cd] bg-[#f4f7f5]">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-[#214c37]" aria-hidden="true" />
          <h3 className="font-bold text-text">Business Insights</h3>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {insights.map((insight) => (
            <p key={insight} className="border-t border-[#d5dfd8] pt-3 text-sm leading-6 text-[#474c48]">
              {insight}
            </p>
          ))}
        </div>
      </Card>

      <Card className="rounded-[8px] p-0">
        <div className="flex flex-col justify-between gap-4 border-b border-border p-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-bold text-text">Detailed Data</h3>
            <p className="mt-1 text-sm text-text-secondary">Sorted server summaries for the selected period.</p>
          </div>
          <div className="flex overflow-x-auto" role="tablist" aria-label="Report data tables">
            {(["items", "tables", "orders"] as DetailView[]).map((view) => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={detailView === view}
                onClick={() => setDetailView(view)}
                className={`border-b-2 px-4 py-2 text-sm font-semibold capitalize whitespace-nowrap ${detailView === view ? "border-[#214c37] text-[#214c37]" : "border-transparent text-text-secondary"}`}
              >
                {view === "items" ? "Top Items" : view === "tables" ? "Tables" : "Orders"}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto p-5">
          {detailView === "items" && <TopItemsTable data={data.top_items} />}
          {detailView === "tables" && <TablesTable data={data.table_performance} />}
          {detailView === "orders" && <OrdersTable data={data.orders} />}
        </div>
      </Card>

      <TableBillPanel restaurant={restaurant} />

      {loading && (
        <div className="fixed bottom-5 right-5 flex items-center gap-2 rounded-[6px] border border-border bg-white px-4 py-3 text-sm font-semibold shadow-lg">
          <Clock3 className="h-4 w-4 animate-spin text-[#214c37]" /> Updating report
        </div>
      )}
    </div>
  );
};

const TaxValue: React.FC<{ label: string; value: number; strong?: boolean }> = ({ label, value, strong }) => (
  <div>
    <p className="text-xs font-semibold text-[#5f6b63]">{label}</p>
    <p className={`mt-1 text-lg ${strong ? "font-bold text-[#214c37]" : "font-semibold text-text"}`}>{formatCurrency(value)}</p>
  </div>
);

const TableEmpty: React.FC<{ columns: number; message: string }> = ({ columns, message }) => (
  <tr><td colSpan={columns} className="py-10 text-center text-sm text-text-secondary">{message}</td></tr>
);

const TopItemsTable: React.FC<{ data: ReportsAnalytics["top_items"] }> = ({ data }) => (
  <table className="w-full min-w-[760px] text-left text-sm">
    <thead className="border-b border-border text-xs uppercase text-text-secondary"><tr><th className="pb-3 pr-4">Item</th><th className="pb-3 pr-4">Category</th><th className="pb-3 pr-4">Food type</th><th className="pb-3 pr-4">Quantity</th><th className="pb-3 pr-4">Revenue</th><th className="pb-3">Average price</th></tr></thead>
    <tbody className="divide-y divide-border">{data.length === 0 ? <TableEmpty columns={6} message="No item sales in this period" /> : data.map((item) => <tr key={`${item.item_name}-${item.food_type}`}><td className="py-3 pr-4 font-semibold">{item.item_name}</td><td className="py-3 pr-4 text-text-secondary">{item.category_name}</td><td className="py-3 pr-4">{foodTypeLabel(item.food_type)}</td><td className="py-3 pr-4">{item.quantity_sold}</td><td className="py-3 pr-4 font-semibold text-[#214c37]">{formatCurrency(item.revenue)}</td><td className="py-3">{formatCurrency(item.average_price)}</td></tr>)}</tbody>
  </table>
);

const TablesTable: React.FC<{ data: ReportsAnalytics["table_performance"] }> = ({ data }) => (
  <table className="w-full min-w-[700px] text-left text-sm">
    <thead className="border-b border-border text-xs uppercase text-text-secondary"><tr><th className="pb-3 pr-4">Table</th><th className="pb-3 pr-4">Orders</th><th className="pb-3 pr-4">Revenue</th><th className="pb-3 pr-4">Average order</th><th className="pb-3">Last order</th></tr></thead>
    <tbody className="divide-y divide-border">{data.length === 0 ? <TableEmpty columns={5} message="No table activity in this period" /> : data.map((table) => <tr key={table.table_number}><td className="py-3 pr-4 font-semibold">{table.table_number === "Counter" ? "Counter" : `Table ${table.table_number}`}</td><td className="py-3 pr-4">{table.order_count}</td><td className="py-3 pr-4 font-semibold text-[#214c37]">{formatCurrency(table.revenue)}</td><td className="py-3 pr-4">{formatCurrency(table.average_order_value)}</td><td className="py-3 text-text-secondary">{formatDateTime(table.last_order_time)}</td></tr>)}</tbody>
  </table>
);

const OrdersTable: React.FC<{ data: ReportsAnalytics["orders"] }> = ({ data }) => (
  <div>
    <div className="mb-3 flex items-center gap-2 text-xs text-text-secondary"><CalendarDays className="h-4 w-4" />Latest 100 orders in this range</div>
    <table className="w-full min-w-[760px] text-left text-sm">
      <thead className="border-b border-border text-xs uppercase text-text-secondary"><tr><th className="pb-3 pr-4">Order</th><th className="pb-3 pr-4">Table</th><th className="pb-3 pr-4">Time</th><th className="pb-3 pr-4">Status</th><th className="pb-3 pr-4">Items</th><th className="pb-3">Before GST</th></tr></thead>
      <tbody className="divide-y divide-border">{data.length === 0 ? <TableEmpty columns={6} message="No orders in this period" /> : data.map((order) => <tr key={order.id}><td className="py-3 pr-4 font-semibold">#{order.order_number}</td><td className="py-3 pr-4">{order.table_number === "Counter" ? "Counter" : `Table ${order.table_number}`}</td><td className="py-3 pr-4 text-text-secondary">{formatDateTime(order.created_at)}</td><td className="py-3 pr-4"><span className="rounded-[4px] bg-bg-subtle px-2 py-1 text-xs font-semibold">{statusLabel(order.status)}</span></td><td className="py-3 pr-4">{order.items_count}</td><td className="py-3 font-semibold text-[#214c37]">{formatCurrency(order.subtotal)}</td></tr>)}</tbody>
    </table>
  </div>
);

export default Reports;
