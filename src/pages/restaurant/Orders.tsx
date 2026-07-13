import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle,
  Clock,
  FileText,
  MessageSquare,
  Package,
  Phone,
  Printer,
  ReceiptText,
  Trophy,
  User,
  XCircle,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Loading,
  Modal,
  Textarea,
} from "../../components/ui";
import {
  getDailySalesSummary,
  getTopSellingItems,
  markOrderPrinted,
  subscribeToOrders,
  updateOrderStatus,
} from "../../services/restaurantService";
import type { TopSellingItem } from "../../services/restaurantService";
import type { Order, OrderItem, Restaurant } from "../../config/supabase";
import { supabase } from "../../config/supabase";
import { formatCurrency, formatDateTime, playSound } from "../../utils/helpers";
import { getSafeErrorMessage } from "../../utils/security";

const NON_REVENUE_STATUSES = ["cancelled", "rejected"];

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const getTimeSince = (dateString: string) => {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
};

const getItemTotal = (item: OrderItem) =>
  item.item_total ?? (item.unit_price ?? item.base_price ?? 0) * item.quantity;

const getOrderSubtotal = (order: Order) => order.subtotal || order.total || 0;

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const printHtml = (title: string, body: string) => {
  const printWindow = window.open("", "_blank", "width=420,height=640");
  if (!printWindow) {
    alert("Please allow popups to print.");
    return false;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { width: 80mm; margin: 0 auto; padding: 12px; font-family: Arial, sans-serif; color: #111827; }
          h1, h2, h3, p { margin: 0; }
          .center { text-align: center; }
          .muted { color: #6b7280; font-size: 12px; }
          .line { border-top: 1px dashed #9ca3af; margin: 10px 0; }
          .row { display: flex; justify-content: space-between; gap: 10px; margin: 6px 0; }
          .strong { font-weight: 700; }
          .item { margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { padding: 4px 0; text-align: left; vertical-align: top; }
          td:last-child, th:last-child { text-align: right; }
          @media print { body { width: 80mm; } button { display: none; } }
        </style>
      </head>
      <body>
        ${body}
        <script>
          window.onload = () => {
            window.print();
            setTimeout(() => window.close(), 400);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
  return true;
};

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("new");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState("");
  const [topItemsRange, setTopItemsRange] = useState("today");
  const [statusError, setStatusError] = useState("");
  const [topItems, setTopItems] = useState<TopSellingItem[]>([]);
  const [dailySummary, setDailySummary] = useState({
    orderCount: 0,
    revenue: 0,
    pendingCount: 0,
    servedCount: 0,
    topItem: "No sales yet",
    busiestTable: "No table yet",
  });
  const knownNewOrderIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user.restaurant_id) return;

    supabase
      .from("restaurants")
      .select("*")
      .eq("id", user.restaurant_id)
      .single()
      .then(({ data }) => setRestaurant(data as Restaurant | null));

    const refreshDailySummary = () => getDailySalesSummary(user.restaurant_id).then(({ data }) => {
      if (!data) return;
      setDailySummary({
        orderCount: data.total_orders || 0,
        revenue: data.total_revenue || 0,
        pendingCount: data.new_orders || 0,
        servedCount: data.served_orders || 0,
        topItem: data.top_item_name || "No sales yet",
        busiestTable: data.most_active_table
          ? `Table ${data.most_active_table}`
          : "No table yet",
      });
    });
    refreshDailySummary();

    const subscription = subscribeToOrders(user.restaurant_id, (data) => {
      const newOrderIds = new Set(
        data
          .filter((order) => ["new", "pending"].includes(order.status))
          .map((order) => order.id)
      );
      const arrivedOrderIds = [...newOrderIds].filter(
        (orderId) => !knownNewOrderIdsRef.current.has(orderId)
      );

      if (hasLoadedRef.current && arrivedOrderIds.length > 0) {
        arrivedOrderIds.forEach(() => playSound("notification"));
      }

      knownNewOrderIdsRef.current = newOrderIds;
      hasLoadedRef.current = true;
      setOrders(data);
      refreshDailySummary();
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user.restaurant_id) return;

    const days = topItemsRange === "30d" ? 30 : topItemsRange === "7d" ? 7 : 1;
    getTopSellingItems(user.restaurant_id, days).then(({ data }) =>
      setTopItems(data || [])
    );
  }, [topItemsRange]);

  const todayOrders = useMemo(() => {
    const today = startOfToday();
    return orders.filter((order) => new Date(order.created_at) >= today);
  }, [orders]);

  const revenueOrdersToday = useMemo(
    () =>
      todayOrders.filter(
        (order) => !NON_REVENUE_STATUSES.includes(order.status)
      ),
    [todayOrders]
  );

  const tableOptions = useMemo(() => {
    const tableSet = new Set(
      revenueOrdersToday
        .map((order) => order.table_number)
        .filter((tableNumber): tableNumber is string => Boolean(tableNumber))
    );
    return [...tableSet].sort((a, b) => a.localeCompare(b, undefined, {
      numeric: true,
    }));
  }, [revenueOrdersToday]);

  const activeTableNumber = selectedTableNumber || tableOptions[0] || "";

  const tableOrders = useMemo(
    () =>
      revenueOrdersToday
        .filter((order) => order.table_number === activeTableNumber)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [activeTableNumber, revenueOrdersToday]
  );

  const tableSubtotal = tableOrders.reduce(
    (sum, order) => sum + getOrderSubtotal(order),
    0
  );

  const filteredOrders = orders
    .filter((order) => order.status === statusFilter)
    .sort((a, b) => {
      const newestFirst =
        ["new", "pending"].includes(a.status) ||
        ["new", "pending"].includes(b.status);
      const direction = newestFirst ? -1 : 1;
      return (
        direction *
        (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      );
    });

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setStatusError("");
    const result = await updateOrderStatus(orderId, newStatus);
    if (!result.success) {
      setStatusError(
        getSafeErrorMessage(result.error, "Failed to update order status.")
      );
      return;
    }
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, status: newStatus as Order["status"] } : order
      )
    );
  };

  const handleViewDetails = (order: Order) => {
    setSelectedOrder(order);
    setShowDetailsModal(true);
  };

  const handlePrintKot = async (order: Order) => {
    const html = `
      <div class="center">
        <h2>${escapeHtml(restaurant?.name || "Restaurant")}</h2>
        <p class="muted">Kitchen Order Ticket</p>
      </div>
      <div class="line"></div>
      <div class="row"><span>Order</span><span class="strong">#${
        escapeHtml(order.order_number)
      }</span></div>
      <div class="row"><span>Table</span><span class="strong">${
        escapeHtml(order.table_number || "Counter")
      }</span></div>
      <div class="row"><span>Time</span><span>${escapeHtml(
        formatDateTime(order.created_at)
      )}</span></div>
      <div class="line"></div>
      ${order.items
        ?.map(
          (item) => `
            <div class="item">
              <p class="strong">${item.quantity} x ${escapeHtml(item.name)}</p>
              ${
                item.selected_size
                  ? `<p class="muted">Size: ${escapeHtml(
                      item.selected_size.name
                    )}</p>`
                  : ""
              }
              ${
                item.selected_addons?.length
                  ? `<p class="muted">Add-ons: ${escapeHtml(
                      item.selected_addons.map((addon) => addon.name).join(", ")
                    )}</p>`
                  : ""
              }
              ${
                item.special_instructions
                  ? `<p class="muted">Note: ${escapeHtml(
                      item.special_instructions
                    )}</p>`
                  : ""
              }
            </div>
          `
        )
        .join("")}
      ${
        order.customer_notes
          ? `<div class="line"></div><p class="strong">Customer notes</p><p>${escapeHtml(
              order.customer_notes
            )}</p>`
          : ""
      }
      <div class="line"></div>
      <p class="center muted">Send to kitchen</p>
    `;

    if (printHtml(`KOT ${order.order_number}`, html)) {
      await markOrderPrinted(order.id, "kot");
    }
  };

  const handlePrintBill = async () => {
    if (tableOrders.length === 0) return;

    const subtotal = tableOrders.reduce(
      (sum, order) => sum + getOrderSubtotal(order),
      0
    );
    const cgstRate = restaurant?.gst_enabled ? restaurant?.cgst_rate || 0 : 0;
    const sgstRate = restaurant?.gst_enabled ? restaurant?.sgst_rate || 0 : 0;
    const cgst = (subtotal * cgstRate) / 100;
    const sgst = (subtotal * sgstRate) / 100;
    const total = subtotal + cgst + sgst;
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
                        item.unit_price ?? item.base_price ?? getItemTotal(item) / item.quantity
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
        formatCurrency(subtotal)
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
      await Promise.all(tableOrders.map((order) => markOrderPrinted(order.id, "bill")));
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "success" | "error" | "warning" | "neutral" | "accent-secondary"
    > = {
      pending: "warning",
      new: "warning",
      accepted: "accent-secondary",
      preparing: "accent-secondary",
      ready: "success",
      served: "success",
      completed: "success",
      cancelled: "neutral",
      rejected: "error",
    };
    return <Badge variant={variants[status] || "neutral"}>{status}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
      case "new":
        return <Clock className="w-5 h-5 text-warning" />;
      case "accepted":
      case "preparing":
        return <Package className="w-5 h-5 text-accent-secondary" />;
      case "ready":
      case "served":
      case "completed":
        return <CheckCircle className="w-5 h-5 text-success" />;
      case "cancelled":
      case "rejected":
        return <XCircle className="w-5 h-5 text-error" />;
      default:
        return <Clock className="w-5 h-5 text-text-secondary" />;
    }
  };

  if (loading) {
    return <Loading text="Loading orders..." />;
  }

  const newCount = orders.filter((order) =>
    ["new", "pending"].includes(order.status)
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text mb-2">Live Orders</h2>
          <p className="text-text-secondary">
            Accept, prepare, print KOTs, and settle table bills from one counter
            screen.
          </p>
        </div>
        {newCount > 0 && (
          <Badge variant="warning" className="text-lg px-4 py-2 animate-pulse">
            {newCount} New
          </Badge>
        )}
      </div>

      <div className="flex items-center space-x-2 text-sm text-success">
        <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
        <span>Live order updates - sound notifications enabled</span>
      </div>
      {statusError && <Alert type="error" message={statusError} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          icon={<ReceiptText className="w-5 h-5" />}
          label="Today's Orders"
          value={dailySummary.orderCount.toString()}
        />
        <SummaryCard
          icon={<BarChart3 className="w-5 h-5" />}
          label="Sales Before GST"
          value={formatCurrency(dailySummary.revenue)}
        />
        <SummaryCard
          icon={<Clock className="w-5 h-5" />}
          label="Open Orders"
          value={dailySummary.pendingCount.toString()}
        />
        <SummaryCard
          icon={<CheckCircle className="w-5 h-5" />}
          label="Served Today"
          value={dailySummary.servedCount.toString()}
        />
        <SummaryCard
          icon={<Trophy className="w-5 h-5" />}
          label="Top Item Today"
          value={dailySummary.topItem}
        />
        <SummaryCard
          icon={<Package className="w-5 h-5" />}
          label="Most Active Table"
          value={dailySummary.busiestTable}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
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
            <div className="space-y-3">
              {tableOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-lg border border-border bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-text">
                        Order #{order.order_number}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {formatDateTime(order.created_at)}
                      </p>
                    </div>
                    {getStatusBadge(order.status)}
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

        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-text">Top Selling Items</h3>
              <p className="text-sm text-text-secondary">
                {dailySummary.topItem} leads today. {dailySummary.busiestTable}
                .
              </p>
            </div>
            <Trophy className="w-5 h-5 text-warning" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["today", "Today"],
              ["7d", "7 Days"],
              ["30d", "30 Days"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTopItemsRange(value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  topItemsRange === value
                    ? "bg-accent text-white"
                    : "bg-bg-subtle text-text-secondary hover:bg-border"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {topItems.slice(0, 6).map((item, index) => (
              <div
                key={item.item_name}
                className="flex items-center justify-between rounded-lg bg-bg-subtle p-3"
              >
                <div>
                  <p className="font-semibold text-text">
                    {index + 1}. {item.item_name}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {item.quantity_sold} sold
                  </p>
                </div>
                <span className="font-bold text-text">
                  {formatCurrency(item.revenue)}
                </span>
              </div>
            ))}
            {topItems.length === 0 && (
              <p className="rounded-lg bg-bg-subtle p-4 text-sm text-text-secondary">
                No item sales in this range.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {["new", "accepted", "preparing", "ready", "served", "cancelled"].map(
          (status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === status
                  ? "bg-accent text-white"
                  : "bg-bg-subtle text-text-secondary hover:bg-border"
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {status === "new" && ` (${newCount})`}
            </button>
          )
        )}
      </div>

      {filteredOrders.length === 0 ? (
        <Card className="text-center py-12">
          <Package className="w-16 h-16 text-text-secondary mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold text-text mb-2">
            No Orders Found
          </h3>
          <p className="text-text-secondary">
            No {statusFilter} orders at the moment.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredOrders.map((order) => (
            <Card
              key={order.id}
              className={`hover:shadow-lg transition-shadow ${
                ["new", "pending"].includes(order.status)
                  ? "border-l-4 border-l-warning"
                  : ""
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(order.status)}
                      <div>
                        <h3 className="text-lg font-bold text-text">
                          Order #{order.order_number}
                        </h3>
                        <p className="text-sm text-text-secondary">
                          {formatDateTime(order.created_at)} -{" "}
                          {getTimeSince(order.created_at)}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center space-x-2">
                      <Package className="w-4 h-4 text-accent" />
                      <span className="font-semibold text-text">
                        {order.table_number
                          ? `Table ${order.table_number}`
                          : "Counter"}
                      </span>
                    </div>
                    {order.customer_phone && (
                      <div className="flex items-center space-x-2 text-text-secondary">
                        <Phone className="w-4 h-4" />
                        <a
                          href={`tel:${order.customer_phone}`}
                          className="text-accent hover:underline"
                        >
                          {order.customer_phone}
                        </a>
                      </div>
                    )}
                    {order.customer_name && (
                      <div className="flex items-center space-x-2 text-text-secondary">
                        <User className="w-4 h-4" />
                        <span>{order.customer_name}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-2 text-text-secondary">
                      <span className="font-semibold text-text">
                        {order.items?.length || 0} items
                      </span>
                      <span>-</span>
                      <span className="font-bold text-text text-lg">
                        {formatCurrency(getOrderSubtotal(order))}
                      </span>
                      <span className="text-xs">(before GST)</span>
                    </div>
                  </div>

                  {order.customer_notes && (
                    <div className="flex items-start space-x-2 text-sm bg-warning/10 border border-warning/20 rounded-lg p-3">
                      <MessageSquare className="w-4 h-4 text-warning mt-0.5" />
                      <div>
                        <p className="font-medium text-text">Customer Notes:</p>
                        <p className="text-text-secondary">
                          {order.customer_notes}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-border overflow-hidden">
                    {order.items?.map((item, index) => (
                      <div
                        key={`${order.id}-${index}`}
                        className="flex items-start justify-between gap-3 px-3 py-2 bg-white border-b border-border last:border-b-0"
                      >
                        <div>
                          <p className="font-semibold text-text">
                            {item.quantity}x {item.name}
                          </p>
                          {item.selected_size && (
                            <p className="text-xs text-text-secondary">
                              Size: {item.selected_size.name}
                            </p>
                          )}
                          {(item.selected_addons?.length ?? 0) > 0 && (
                            <p className="text-xs text-text-secondary">
                              Add-ons:{" "}
                              {item.selected_addons!
                                .map((addon) => addon.name)
                                .join(", ")}
                            </p>
                          )}
                        </div>
                        <span className="font-semibold text-text">
                          {formatCurrency(getItemTotal(item))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:min-w-[170px]">
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={() => handlePrintKot(order)}
                    icon={<Printer className="w-4 h-4" />}
                  >
                    Print KOT
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={() => handleViewDetails(order)}
                  >
                    Details
                  </Button>

                  {["new", "pending"].includes(order.status) && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        fullWidth
                        onClick={() => handleStatusUpdate(order.id, "accepted")}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        fullWidth
                        onClick={() => {
                          setSelectedOrder(order);
                          setShowRejectModal(true);
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}

                  {order.status === "accepted" && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        fullWidth
                        onClick={() =>
                          handleStatusUpdate(order.id, "preparing")
                        }
                      >
                        Preparing
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        fullWidth
                        onClick={() => {
                          setSelectedOrder(order);
                          setShowRejectModal(true);
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}

                  {order.status === "preparing" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onClick={() => handleStatusUpdate(order.id, "ready")}
                    >
                      Ready
                    </Button>
                  )}

                  {order.status === "ready" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      onClick={() => handleStatusUpdate(order.id, "served")}
                    >
                      Served
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <OrderDetailsModal
        isOpen={showDetailsModal}
        order={selectedOrder}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedOrder(null);
        }}
      />

      <RejectOrderModal
        isOpen={showRejectModal}
        order={selectedOrder}
        onClose={() => {
          setShowRejectModal(false);
          setSelectedOrder(null);
        }}
        onReject={handleStatusUpdate}
      />
    </div>
  );
};

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ icon, label, value }) => (
  <Card className="flex items-center gap-3">
    <div className="rounded-lg bg-accent/10 p-3 text-accent">{icon}</div>
    <div>
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="text-xl font-bold text-text">{value}</p>
    </div>
  </Card>
);

interface OrderDetailsModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
}

const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  isOpen,
  order,
  onClose,
}) => {
  if (!order) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Order #${order.order_number}`}
      size="lg"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 bg-bg-subtle rounded-lg">
          <span className="font-medium text-text">Status</span>
          <Badge
            variant={
              ["ready", "served"].includes(order.status)
                ? "success"
                : ["new", "pending"].includes(order.status)
                ? "warning"
                : "neutral"
            }
          >
            {order.status}
          </Badge>
        </div>

        <div>
          <h4 className="font-semibold text-text mb-3">Customer Information</h4>
          <div className="space-y-2 text-sm">
            {order.customer_name && (
              <p className="text-text-secondary">
                <strong className="text-text">Name:</strong>{" "}
                {order.customer_name}
              </p>
            )}
            {order.customer_phone && (
              <p className="text-text-secondary">
                <strong className="text-text">Phone:</strong>{" "}
                {order.customer_phone}
              </p>
            )}
            <p className="text-text-secondary">
              <strong className="text-text">Order Type:</strong>{" "}
              {order.order_type}
            </p>
            {order.table_number && (
              <p className="text-text-secondary">
                <strong className="text-text">Table:</strong>{" "}
                {order.table_number}
              </p>
            )}
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-text mb-3">Order Items</h4>
          <div className="space-y-3">
            {order.items?.map((item, index) => (
              <div
                key={index}
                className="flex items-start justify-between p-3 bg-bg-subtle rounded-lg"
              >
                <div className="flex-1">
                  <p className="font-medium text-text">
                    {item.quantity}x {item.name}
                  </p>
                  {item.selected_size && (
                    <p className="text-sm text-text-secondary">
                      Size: {item.selected_size.name}
                    </p>
                  )}
                  {(item.selected_addons?.length ?? 0) > 0 && (
                    <p className="text-sm text-text-secondary">
                      Add-ons:{" "}
                      {item.selected_addons!
                        .map((addon) => addon.name)
                        .join(", ")}
                    </p>
                  )}
                </div>
                <p className="font-semibold text-text">
                  {formatCurrency(getItemTotal(item))}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex justify-between text-text-secondary">
            <span>Subtotal</span>
            <span>{formatCurrency(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-text-secondary">
            <span>Tax</span>
            <span>{formatCurrency(order.tax)}</span>
          </div>
          {order.discount && order.discount > 0 && (
            <div className="flex justify-between text-success">
              <span>Discount</span>
              <span>-{formatCurrency(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-text pt-2 border-t border-border">
            <span>Total</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
        </div>

        {order.customer_notes && (
          <div className="bg-accent-secondary/10 border border-accent-secondary/20 rounded-lg p-4">
            <h4 className="font-semibold text-text mb-2">Customer Notes</h4>
            <p className="text-text-secondary text-sm">
              {order.customer_notes}
            </p>
          </div>
        )}

        <Button onClick={onClose} fullWidth>
          Close
        </Button>
      </div>
    </Modal>
  );
};

interface RejectOrderModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onReject: (orderId: string, status: string, notes?: string) => void;
}

const RejectOrderModal: React.FC<RejectOrderModalProps> = ({
  isOpen,
  order,
  onClose,
  onReject,
}) => {
  const [reason, setReason] = useState("");

  const handleCancel = () => {
    if (!order) return;
    onReject(order.id, "cancelled", reason);
    onClose();
    setReason("");
  };

  if (!order) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cancel Order" size="md">
      <div className="space-y-4">
        <Alert
          type="warning"
          message="Are you sure you want to cancel this order? This action cannot be undone."
        />

        <Textarea
          label="Reason for Cancellation (Optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="E.g., Out of stock, kitchen closed, customer requested, etc."
          rows={3}
        />

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} fullWidth>
            Back
          </Button>
          <Button variant="danger" onClick={handleCancel} fullWidth>
            Cancel Order
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default Orders;
