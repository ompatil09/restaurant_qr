import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  Clock,
  MessageSquare,
  Package,
  Phone,
  Printer,
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
  markOrderPrinted,
  subscribeToOrders,
  updateOrderStatus,
} from "../../services/restaurantService";
import type { Order, OrderItem, Restaurant } from "../../config/supabase";
import { supabase } from "../../config/supabase";
import {
  escapeHtml,
  formatCurrency,
  formatDateTime,
  playSound,
  printHtml,
} from "../../utils/helpers";
import { getSafeErrorMessage } from "../../utils/security";

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

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("new");
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [statusError, setStatusError] = useState("");
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
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
          maxLength={300}
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
