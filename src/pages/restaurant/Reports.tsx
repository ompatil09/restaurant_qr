import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Clock,
  DollarSign,
  Download,
  FileText,
  Package,
  Printer,
  ShoppingBag,
  Trophy,
} from "lucide-react";
import { Button, Card, Loading } from "../../components/ui";
import {
  escapeHtml,
  formatCurrency,
  formatDateTime,
  printHtml,
} from "../../utils/helpers";
import {
  getRestaurantOrdersForRange,
  getTopSellingItems,
  markOrderPrinted,
} from "../../services/restaurantService";
import { logErrorForDev } from "../../utils/security";
import { supabase } from "../../config/supabase";
import type { Order, OrderItem, Restaurant } from "../../config/supabase";

interface ReportData {
  orders: Order[];
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  openOrders: number;
  servedOrders: number;
  mostActiveTable: string;
  topItems: { name: string; count: number; revenue: number }[];
  dailyRevenue: { date: string; revenue: number; orders: number }[];
  orderTypeDistribution: { type: string; count: number }[];
}

const getItemTotal = (item: OrderItem) =>
  item.item_total ?? (item.unit_price ?? item.base_price ?? 0) * item.quantity;

const getOrderSubtotal = (order: Order) => order.subtotal || order.total || 0;

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [dateRange, setDateRange] = useState<"1" | "7" | "30">("30");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState("");

  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (!user.restaurant_id) {
        setReportData(null);
        return;
      }

      const days = parseInt(dateRange);
      const [
        { data: fetchedOrders, error },
        { data: rpcTopItems },
        { data: restaurantData },
      ] =
        await Promise.all([
          getRestaurantOrdersForRange(user.restaurant_id, days),
          getTopSellingItems(user.restaurant_id, days),
          supabase
            .from("restaurants")
            .select("*")
            .eq("id", user.restaurant_id)
            .single(),
        ]);

      if (error) throw error;

      const orders =
        fetchedOrders?.filter(
          (order) => !["cancelled", "rejected"].includes(order.status)
        ) || [];

      const totalRevenue = orders.reduce(
        (sum, order) => sum + (order.subtotal || order.total || 0),
        0
      );
      const totalOrders = orders.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const openOrders = orders.filter((order) =>
        ["new", "pending", "accepted", "preparing", "ready"].includes(
          order.status
        )
      ).length;
      const servedOrders = orders.filter((order) =>
        ["served", "completed"].includes(order.status)
      ).length;
      const tableCounts = orders.reduce<Record<string, number>>((counts, order) => {
        if (order.table_number) {
          counts[order.table_number] = (counts[order.table_number] || 0) + 1;
        }
        return counts;
      }, {});
      const busiestTable = Object.entries(tableCounts).sort(
        ([, a], [, b]) => b - a
      )[0]?.[0];

      const topItems = (rpcTopItems || [])
        .map((item) => ({
          name: item.item_name,
          count: item.quantity_sold,
          revenue: item.revenue,
        }))
        .slice(0, 5);

      const dailyData: Record<string, { revenue: number; orders: number }> = {};
      orders.forEach((order) => {
        const date = new Date(order.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        if (!dailyData[date]) {
          dailyData[date] = { revenue: 0, orders: 0 };
        }
        dailyData[date].revenue += order.subtotal || order.total || 0;
        dailyData[date].orders += 1;
      });

      const dailyRevenue = Object.entries(dailyData)
        .map(([date, data]) => ({ date, ...data }))
        .slice(-14);

      const typeCounts: Record<string, number> = {};
      orders.forEach((order) => {
        const type = order.order_type || "unknown";
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });

      setReportData({
        orders,
        totalRevenue,
        totalOrders,
        avgOrderValue,
        openOrders,
        servedOrders,
        mostActiveTable: busiestTable ? `Table ${busiestTable}` : "No table yet",
        topItems,
        dailyRevenue,
        orderTypeDistribution: Object.entries(typeCounts).map(
          ([type, count]) => ({ type, count })
        ),
      });
      setRestaurant(restaurantData as Restaurant | null);
    } catch (error) {
      logErrorForDev(error, "fetchReportData");
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const tableOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return [
      ...new Set(
        (reportData?.orders || [])
          .filter((order) => new Date(order.created_at) >= today)
          .map((order) => order.table_number)
          .filter((tableNumber): tableNumber is string => Boolean(tableNumber))
      ),
    ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [reportData]);

  const activeTableNumber = tableOptions.includes(selectedTableNumber)
    ? selectedTableNumber
    : tableOptions[0] || "";
  const tableOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (reportData?.orders || [])
      .filter(
        (order) =>
          new Date(order.created_at) >= today &&
          order.table_number === activeTableNumber
      )
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [activeTableNumber, reportData]);

  const tableSubtotal = tableOrders.reduce(
    (sum, order) => sum + getOrderSubtotal(order),
    0
  );

  const handlePrintBill = async () => {
    if (tableOrders.length === 0) return;

    const cgstRate = restaurant?.gst_enabled ? restaurant.cgst_rate || 0 : 0;
    const sgstRate = restaurant?.gst_enabled ? restaurant.sgst_rate || 0 : 0;
    const cgst = (tableSubtotal * cgstRate) / 100;
    const sgst = (tableSubtotal * sgstRate) / 100;
    const total = tableSubtotal + cgst + sgst;
    const billNumber = `BILL-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${activeTableNumber}`;
    const html = `
      <div class="center">
        <h2>${escapeHtml(restaurant?.name || "Restaurant")}</h2>
        <p class="muted">Bill Summary</p>
      </div>
      <div class="line"></div>
      <div class="row"><span>Bill</span><span class="strong">${escapeHtml(
        billNumber
      )}</span></div>
      <div class="row"><span>Table</span><span class="strong">${escapeHtml(
        activeTableNumber
      )}</span></div>
      <div class="row"><span>Date</span><span>${escapeHtml(
        formatDateTime(new Date().toISOString())
      )}</span></div>
      <div class="line"></div>
      <table>
        <thead>
          <tr><th>Item</th><th>Qty</th><th>Price</th><th>Amt</th></tr>
        </thead>
        <tbody>
          ${tableOrders
            .flatMap((order) =>
              order.items.map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td>${item.quantity}</td>
                    <td>${escapeHtml(
                      formatCurrency(
                        item.unit_price ??
                          item.base_price ??
                          getItemTotal(item) / item.quantity
                      )
                    )}</td>
                    <td>${escapeHtml(formatCurrency(getItemTotal(item)))}</td>
                  </tr>
                `
              )
            )
            .join("")}
        </tbody>
      </table>
      <div class="line"></div>
      <div class="row"><span>Subtotal</span><span>${escapeHtml(
        formatCurrency(tableSubtotal)
      )}</span></div>
      ${
        restaurant?.gst_enabled
          ? `
            <div class="row"><span>CGST ${cgstRate}%</span><span>${escapeHtml(
              formatCurrency(cgst)
            )}</span></div>
            <div class="row"><span>SGST ${sgstRate}%</span><span>${escapeHtml(
              formatCurrency(sgst)
            )}</span></div>
          `
          : ""
      }
      <div class="row strong"><span>Total</span><span>${escapeHtml(
        formatCurrency(total)
      )}</span></div>
      <div class="line"></div>
      <p class="center muted">Please pay using the UPI QR placed on your table or at the counter.</p>
    `;

    if (printHtml(`Bill Table ${activeTableNumber}`, html)) {
      await Promise.all(
        tableOrders.map((order) => markOrderPrinted(order.id, "bill"))
      );
    }
  };

  const exportReport = () => {
    if (!reportData) return;

    const csvContent = [
      ["Metric", "Value"],
      ["Total Revenue", formatCurrency(reportData.totalRevenue)],
      ["Total Orders", reportData.totalOrders.toString()],
      ["Average Order Value", formatCurrency(reportData.avgOrderValue)],
      [""],
      ["Top Items", "Quantity", "Revenue"],
      ...reportData.topItems.map((item) => [
        item.name,
        item.count.toString(),
        formatCurrency(item.revenue),
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report-${dateRange}-days.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return <Loading text="Loading reports..." />;
  }

  if (!reportData) {
    return (
      <div className="text-center text-text-secondary">No data available</div>
    );
  }

  const maxDailyRevenue = Math.max(
    ...reportData.dailyRevenue.map((day) => day.revenue),
    1
  );
  const maxDailyOrders = Math.max(
    ...reportData.dailyRevenue.map((day) => day.orders),
    1
  );
  const maxOrderTypeCount = Math.max(
    ...reportData.orderTypeDistribution.map((entry) => entry.count),
    1
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text mb-2">
            Reports & Analytics
          </h2>
          <p className="text-text-secondary">
            Lightweight range-based sales summaries.
          </p>
        </div>
        <div className="flex gap-3">
          <select
            value={dateRange}
            onChange={(event) =>
              setDateRange(event.target.value as "1" | "7" | "30")
            }
            className="input"
          >
            <option value="1">Today</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
          </select>
          <Button
            icon={<Download className="w-5 h-5" />}
            onClick={exportReport}
            variant="outline"
          >
            Export
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <MetricCard
          icon={<ShoppingBag className="w-6 h-6 text-accent" />}
          label={dateRange === "1" ? "Today's Orders" : "Orders in Period"}
          value={reportData.totalOrders.toString()}
        />
        <MetricCard
          icon={<DollarSign className="w-6 h-6 text-success" />}
          label="Sales Before GST"
          value={formatCurrency(reportData.totalRevenue)}
        />
        <MetricCard
          icon={<Clock className="w-6 h-6 text-warning" />}
          label="Open Orders"
          value={reportData.openOrders.toString()}
        />
        <MetricCard
          icon={<CheckCircle className="w-6 h-6 text-success" />}
          label={dateRange === "1" ? "Served Today" : "Served in Period"}
          value={reportData.servedOrders.toString()}
        />
        <MetricCard
          icon={<Trophy className="w-6 h-6 text-warning" />}
          label="Top Item"
          value={reportData.topItems[0]?.name || "No sales yet"}
        />
        <MetricCard
          icon={<Package className="w-6 h-6 text-accent-secondary" />}
          label="Most Active Table"
          value={reportData.mostActiveTable}
        />
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-text">Table Bill Summary</h3>
            <p className="text-sm text-text-secondary">
              View today's table-wise orders and print a GST bill summary.
            </p>
          </div>
          <FileText className="w-5 h-5 text-accent" />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={activeTableNumber}
            onChange={(event) => setSelectedTableNumber(event.target.value)}
            className="w-full sm:max-w-xs px-4 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
            disabled={tableOptions.length === 0}
          >
            {tableOptions.length === 0 ? (
              <option value="">No active tables today</option>
            ) : (
              tableOptions.map((tableNumber) => (
                <option key={tableNumber} value={tableNumber}>
                  Table {tableNumber}
                </option>
              ))
            )}
          </select>
          <Button
            variant="outline"
            icon={<Printer className="w-4 h-4" />}
            onClick={handlePrintBill}
            disabled={tableOrders.length === 0}
          >
            Print Bill
          </Button>
          {tableOrders.length > 0 && (
            <span className="text-sm font-semibold text-text">
              Total before GST: {formatCurrency(tableSubtotal)}
            </span>
          )}
        </div>

        {tableOrders.length === 0 ? (
          <div className="rounded-lg bg-bg-subtle p-4 text-sm text-text-secondary">
            No orders for the selected table today.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {tableOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-lg border border-border bg-white p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-text">
                      Order #{order.order_number}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {formatDateTime(order.created_at)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold capitalize text-text-secondary">
                    {order.status}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  {order.items.map((item) => (
                    <div
                      key={`${order.id}-${item.menu_item_id}-${item.name}`}
                      className="flex justify-between gap-3"
                    >
                      <span>
                        {item.quantity}x {item.name}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(getItemTotal(item))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-bold text-text mb-4">Revenue Trend</h3>
          {reportData.dailyRevenue.length === 0 ? (
            <p className="text-text-secondary text-center py-12">
              No revenue in this period
            </p>
          ) : (
            <div className="space-y-3">
              {reportData.dailyRevenue.map((day) => (
                <BarRow
                  key={day.date}
                  label={day.date}
                  value={formatCurrency(day.revenue)}
                  percent={(day.revenue / maxDailyRevenue) * 100}
                  colorClassName="bg-success"
                />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-bold text-text mb-4">
            Order Type Distribution
          </h3>
          {reportData.orderTypeDistribution.length === 0 ? (
            <p className="text-text-secondary text-center py-12">
              No orders in this period
            </p>
          ) : (
            <div className="space-y-3">
              {reportData.orderTypeDistribution.map((entry) => (
                <BarRow
                  key={entry.type}
                  label={entry.type}
                  value={`${entry.count} orders`}
                  percent={(entry.count / maxOrderTypeCount) * 100}
                  colorClassName="bg-accent-secondary"
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text">Top Selling Items</h3>
          <Package className="w-5 h-5 text-accent" />
        </div>

        {reportData.topItems.length === 0 ? (
          <p className="text-text-secondary text-center py-8">
            No items sold yet
          </p>
        ) : (
          <div className="space-y-3">
            {reportData.topItems.map((item, index) => (
              <div
                key={item.name}
                className="flex items-center justify-between p-4 bg-bg-subtle rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center justify-center w-10 h-10 bg-accent rounded-full text-white font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-semibold text-text">{item.name}</div>
                    <div className="text-sm text-text-secondary">
                      {item.count} sold
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-success">
                    {formatCurrency(item.revenue)}
                  </div>
                  <div className="text-xs text-text-secondary">Revenue</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-lg font-bold text-text mb-4">Daily Orders</h3>
        {reportData.dailyRevenue.length === 0 ? (
          <p className="text-text-secondary text-center py-12">
            No orders in this period
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {reportData.dailyRevenue.map((day) => (
              <div key={day.date} className="rounded-lg bg-bg-subtle p-3">
                <div className="h-28 flex items-end justify-center mb-2">
                  <div
                    className="w-full rounded-t bg-accent"
                    style={{
                      height: `${Math.max(
                        8,
                        (day.orders / maxDailyOrders) * 100
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-text-secondary text-center">
                  {day.date}
                </p>
                <p className="font-bold text-text text-center">{day.orders}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value }) => (
  <Card>
    <div className="flex items-center justify-between mb-3">
      <div className="p-3 bg-bg-subtle rounded-lg">{icon}</div>
    </div>
    <div className="text-2xl font-bold text-text mb-1">{value}</div>
    <p className="text-text-secondary text-sm">{label}</p>
  </Card>
);

interface BarRowProps {
  label: string;
  value: string;
  percent: number;
  colorClassName: string;
}

const BarRow: React.FC<BarRowProps> = ({
  label,
  value,
  percent,
  colorClassName,
}) => (
  <div>
    <div className="flex justify-between text-sm mb-1">
      <span className="font-medium text-text capitalize">{label}</span>
      <span className="text-text-secondary">{value}</span>
    </div>
    <div className="h-3 rounded-full bg-bg-subtle overflow-hidden">
      <div
        className={`h-full rounded-full ${colorClassName}`}
        style={{ width: `${Math.max(6, percent)}%` }}
      />
    </div>
  </div>
);

export default Reports;
