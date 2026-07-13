import React, { useEffect, useState } from "react";
import {
  Calendar,
  DollarSign,
  Download,
  Package,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { Button, Card, Loading } from "../../components/ui";
import { formatCurrency } from "../../utils/helpers";
import {
  getRestaurantOrdersForRange,
  getTopSellingItems,
} from "../../services/restaurantService";
import { logErrorForDev } from "../../utils/security";

interface ReportData {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  topItems: { name: string; count: number; revenue: number }[];
  dailyRevenue: { date: string; revenue: number; orders: number }[];
  orderTypeDistribution: { type: string; count: number }[];
}

const Reports: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [dateRange, setDateRange] = useState<"1" | "7" | "30">("30");

  useEffect(() => {
    fetchReportData();
  }, [dateRange]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (!user.restaurant_id) {
        setReportData(null);
        return;
      }

      const days = parseInt(dateRange);
      const [{ data: fetchedOrders, error }, { data: rpcTopItems }] =
        await Promise.all([
          getRestaurantOrdersForRange(user.restaurant_id, days),
          getTopSellingItems(user.restaurant_id, days),
        ]);

      if (error) throw error;

      const orders =
        fetchedOrders?.filter(
          (order) => !["cancelled", "rejected"].includes(order.status)
        ) || [];

      const totalRevenue = orders.reduce(
        (sum, order) => sum + (order.total || order.subtotal || 0),
        0
      );
      const totalOrders = orders.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

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
        dailyData[date].revenue += order.total || order.subtotal || 0;
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
        totalRevenue,
        totalOrders,
        avgOrderValue,
        topItems,
        dailyRevenue,
        orderTypeDistribution: Object.entries(typeCounts).map(
          ([type, count]) => ({ type, count })
        ),
      });
    } catch (error) {
      logErrorForDev(error, "fetchReportData");
      setReportData(null);
    } finally {
      setLoading(false);
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

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<DollarSign className="w-6 h-6 text-success" />}
          label="Total Revenue"
          value={formatCurrency(reportData.totalRevenue)}
        />
        <MetricCard
          icon={<ShoppingBag className="w-6 h-6 text-accent" />}
          label="Total Orders"
          value={reportData.totalOrders.toString()}
        />
        <MetricCard
          icon={<TrendingUp className="w-6 h-6 text-accent-secondary" />}
          label="Avg Order Value"
          value={formatCurrency(reportData.avgOrderValue)}
        />
        <MetricCard
          icon={<Calendar className="w-6 h-6 text-warning" />}
          label="Report Period"
          value={dateRange === "1" ? "Today" : `${dateRange} Days`}
        />
      </div>

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
