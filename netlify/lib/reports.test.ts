import assert from "node:assert/strict";
import test from "node:test";
import { aggregateReports, validateReportRequest } from "./reports.ts";

test("report request validation rejects malformed, future, and oversized ranges", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  assert.deepEqual(
    validateReportRequest(
      {
        start: "2026-07-01T00:00:00.000Z",
        end: "2026-07-17T00:00:00.000Z",
        groupBy: "day",
      },
      now
    ),
    {
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-07-17T00:00:00.000Z",
      groupBy: "day",
    }
  );
  assert.throws(() =>
    validateReportRequest({ start: "bad", end: "bad", groupBy: "day" }, now)
  );
  assert.throws(() =>
    validateReportRequest(
      {
        start: "2024-01-01T00:00:00.000Z",
        end: "2026-01-02T00:00:00.000Z",
        groupBy: "day",
      },
      now
    )
  );
  assert.throws(() =>
    validateReportRequest(
      {
        start: "2026-07-17T00:00:00.000Z",
        end: "2026-07-20T00:00:00.000Z",
        groupBy: "day",
      },
      now
    )
  );
});

test("report fallback excludes cancelled revenue and derives item metrics", () => {
  const result = aggregateReports(
    [
      {
        id: "1",
        order_number: "ORD-1",
        table_number: "4",
        created_at: "2026-07-16T08:30:00.000Z",
        status: "served",
        subtotal: 250,
        items: [{ menu_item_id: "dish-1", name: "Paneer", quantity: 2, item_total: 250 }],
      },
      {
        id: "2",
        order_number: "ORD-2",
        table_number: "5",
        created_at: "2026-07-16T09:30:00.000Z",
        status: "cancelled",
        subtotal: 999,
        items: [{ menu_item_id: "dish-1", name: "Paneer", quantity: 8, item_total: 999 }],
      },
    ],
    [{ id: "dish-1", name: "Paneer", category: "Main Course", food_type: "veg" }],
    { gst_enabled: true, cgst_rate: 2.5, sgst_rate: 2.5 },
    "hour"
  );

  assert.equal(result.overview.total_orders, 2);
  assert.equal(result.overview.total_revenue, 250);
  assert.equal(result.overview.cancelled_orders, 1);
  assert.equal(result.overview.items_sold, 2);
  assert.equal(result.top_items[0].category_name, "Main Course");
  assert.equal(result.gst.grand_total_estimate, 262.5);
});

test("report fallback counts all orders while bounding detail rows", () => {
  const orders = Array.from({ length: 101 }, (_, index) => ({
    id: String(index),
    order_number: `ORD-${index}`,
    table_number: "1",
    created_at: "2026-07-16T08:30:00.000Z",
    status: "served",
    subtotal: 10,
    items: [],
  }));
  const result = aggregateReports(orders, [], {}, "day");

  assert.equal(result.overview.total_orders, 101);
  assert.equal(result.overview.total_revenue, 1010);
  assert.equal(result.orders.length, 100);
});
