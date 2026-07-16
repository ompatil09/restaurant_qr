import React, { useMemo, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { Button, Card } from "../ui";
import type { Order, OrderItem, Restaurant } from "../../config/supabase";
import {
  getRestaurantOrdersForRange,
  markOrderPrinted,
} from "../../services/restaurantService";
import {
  escapeHtml,
  formatCurrency,
  formatDateTime,
  printHtml,
} from "../../utils/helpers";
import { logErrorForDev } from "../../utils/security";

interface TableBillPanelProps {
  restaurant: Restaurant | null;
}

const getItemTotal = (item: OrderItem) =>
  item.item_total ?? (item.unit_price ?? item.base_price ?? 0) * item.quantity;

const getOrderSubtotal = (order: Order) => order.subtotal || order.total || 0;

export const TableBillPanel: React.FC<TableBillPanelProps> = ({ restaurant }) => {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTableNumber, setSelectedTableNumber] = useState("");

  const loadToday = async () => {
    if (!restaurant) return;
    setLoading(true);
    try {
      const { data, error } = await getRestaurantOrdersForRange(restaurant.id, 1);
      if (error) throw error;
      setOrders(
        (data || []).filter(
          (order) => !["cancelled", "rejected"].includes(order.status)
        )
      );
    } catch (error) {
      logErrorForDev(error, "loadTableBills");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const tableOptions = useMemo(
    () =>
      [...new Set((orders || []).map((order) => order.table_number).filter(Boolean))]
        .map(String)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [orders]
  );

  const activeTableNumber = tableOptions.includes(selectedTableNumber)
    ? selectedTableNumber
    : tableOptions[0] || "";
  const tableOrders = (orders || [])
    .filter((order) => order.table_number === activeTableNumber)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  const subtotal = tableOrders.reduce(
    (sum, order) => sum + getOrderSubtotal(order),
    0
  );

  const printBill = async () => {
    if (!restaurant || tableOrders.length === 0) return;

    const cgstRate = restaurant.gst_enabled ? restaurant.cgst_rate || 0 : 0;
    const sgstRate = restaurant.gst_enabled ? restaurant.sgst_rate || 0 : 0;
    const cgst = (subtotal * cgstRate) / 100;
    const sgst = (subtotal * sgstRate) / 100;
    const total = subtotal + cgst + sgst;
    const billNumber = `BILL-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${activeTableNumber}`;
    const rows = tableOrders
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
            </tr>`
        )
      )
      .join("");
    const taxRows = restaurant.gst_enabled
      ? `
        <div class="row"><span>CGST ${cgstRate}%</span><span>${escapeHtml(
          formatCurrency(cgst)
        )}</span></div>
        <div class="row"><span>SGST ${sgstRate}%</span><span>${escapeHtml(
          formatCurrency(sgst)
        )}</span></div>`
      : "";
    const html = `
      <div class="center"><h2>${escapeHtml(
        restaurant.name
      )}</h2><p class="muted">Bill Summary</p></div>
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
      <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amt</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="line"></div>
      <div class="row"><span>Subtotal</span><span>${escapeHtml(
        formatCurrency(subtotal)
      )}</span></div>
      ${taxRows}
      <div class="row strong"><span>Total</span><span>${escapeHtml(
        formatCurrency(total)
      )}</span></div>
      <div class="line"></div>
      <p class="center muted">Please pay using the UPI QR placed on your table or at the counter.</p>`;

    if (printHtml(`Bill Table ${activeTableNumber}`, html)) {
      await Promise.all(
        tableOrders.map((order) => markOrderPrinted(order.id, "bill"))
      );
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-accent" aria-hidden="true" />
            <h3 className="font-bold text-text">Today's table bills</h3>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Orders load only when you open this billing tool.
          </p>
        </div>
        <Button onClick={loadToday} loading={loading} variant="outline" size="sm">
          {orders ? "Refresh tables" : "Load today's tables"}
        </Button>
      </div>

      {orders && (
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
          <select
            value={activeTableNumber}
            onChange={(event) => setSelectedTableNumber(event.target.value)}
            className="input sm:max-w-xs"
            disabled={tableOptions.length === 0}
            aria-label="Table for bill"
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
            icon={<Printer className="h-4 w-4" aria-hidden="true" />}
            onClick={printBill}
            disabled={tableOrders.length === 0}
            size="sm"
          >
            Print Bill
          </Button>
          {tableOrders.length > 0 && (
            <span className="text-sm font-semibold text-text">
              Before GST: {formatCurrency(subtotal)}
            </span>
          )}
        </div>
      )}
    </Card>
  );
};
