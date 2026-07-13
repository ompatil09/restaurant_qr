import React, { useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import { Alert, Button, Card } from "../ui";
import type { Restaurant } from "../../config/supabase";
import {
  openBillingPortal,
  startRestaurantCheckout,
} from "../../services/billingService";
import { getRestaurantAccessStatus } from "../../services/subscriptionService";

interface BillingStatusCardProps {
  restaurant: Restaurant;
}

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString() : "Not available";

const BillingStatusCard: React.FC<BillingStatusCardProps> = ({ restaurant }) => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"checkout" | "portal" | "">("");
  const access = getRestaurantAccessStatus(restaurant);
  const status = restaurant.subscription_status || "active";

  const startCheckout = async () => {
    setError("");
    setLoading("checkout");
    const result = await startRestaurantCheckout();
    setLoading("");
    if (!result.success) setError(result.error || "Billing is not configured yet.");
  };

  const openPortal = async () => {
    setError("");
    setLoading("portal");
    const result = await openBillingPortal();
    setLoading("");
    if (!result.success) setError(result.error || "Billing portal is not configured yet.");
  };

  return (
    <Card>
      <div className="flex items-start gap-3 mb-4">
        <CreditCard className="w-6 h-6 text-accent" />
        <div>
          <h3 className="text-xl font-bold text-text">Billing</h3>
          <p className="text-sm text-text-secondary">
            Restaurant Plan: ₹1000/month
          </p>
        </div>
      </div>

      {error && <Alert type="error" message={error} className="mb-4" />}
      {access.message && (
        <Alert
          type={access.state === "locked" ? "error" : "warning"}
          message={access.message}
          className="mb-4"
        />
      )}

      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <div className="rounded-lg bg-bg-subtle p-3">
          <p className="text-xs text-text-secondary">Status</p>
          <p className="font-bold text-text capitalize">{status.replace("_", " ")}</p>
        </div>
        <div className="rounded-lg bg-bg-subtle p-3">
          <p className="text-xs text-text-secondary">Current Period Ends</p>
          <p className="font-bold text-text">{formatDate(restaurant.current_period_end)}</p>
        </div>
        <div className="rounded-lg bg-bg-subtle p-3">
          <p className="text-xs text-text-secondary">Grace Until</p>
          <p className="font-bold text-text">{formatDate(restaurant.grace_until)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={startCheckout}
          loading={loading === "checkout"}
          icon={<CreditCard className="w-4 h-4" />}
        >
          Pay ₹1000/month
        </Button>
        {restaurant.stripe_customer_id && (
          <Button
            variant="outline"
            onClick={openPortal}
            loading={loading === "portal"}
            icon={<ExternalLink className="w-4 h-4" />}
          >
            Manage Billing
          </Button>
        )}
      </div>
    </Card>
  );
};

export default BillingStatusCard;
