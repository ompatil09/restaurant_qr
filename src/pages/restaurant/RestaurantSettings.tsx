import React, { useEffect, useState } from "react";
import { ExternalLink, Lock, QrCode, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, Button, Card, Input, Loading, Textarea } from "../../components/ui";
import BillingStatusCard from "../../components/billing/BillingStatusCard";
import { supabase } from "../../config/supabase";
import type { Restaurant } from "../../config/supabase";
import {
  changeRestaurantPassword,
  updateRestaurantBranding,
  uploadRestaurantImage,
  validateRestaurantImage,
} from "../../services/restaurantService";
import { hashPassword } from "../../utils/helpers";
import {
  getSafeErrorMessage,
  validateAdminPin,
  validateGstRate,
  validateHttpsUrl,
  validatePassword,
  validateTextLength,
} from "../../utils/security";

const RestaurantSettings: React.FC = () => {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [currentUser, setCurrentUser] = useState<
    (Record<string, unknown> & { restaurant_id?: string; temp_password?: boolean }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [upiFile, setUpiFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    logo_url: "",
    theme_color: "#111827",
    welcome_message: "",
    upi_qr_url: "",
    cgst_rate: "2.5",
    sgst_rate: "2.5",
    gst_enabled: false,
    admin_pin: "",
  });
  const [passwordData, setPasswordData] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  useEffect(() => {
    const fetchRestaurant = async () => {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      setCurrentUser(user);
      if (!user.restaurant_id) {
        setError("Restaurant ID not found");
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", user.restaurant_id)
        .single();

      if (fetchError || !data) {
        setError("Failed to load restaurant details");
        setLoading(false);
        return;
      }

      setRestaurant(data);
      setFormData({
        logo_url: data.logo_url || "",
        theme_color: data.theme_color || "#111827",
        welcome_message: data.welcome_message || "",
        upi_qr_url: data.upi_qr_url || "",
        cgst_rate: (data.cgst_rate ?? 2.5).toString(),
        sgst_rate: (data.sgst_rate ?? 2.5).toString(),
        gst_enabled: data.gst_enabled || false,
        admin_pin: "",
      });
      setLoading(false);
    };

    fetchRestaurant();
  }, []);

  const handleBrandingFileChange = (
    file: File | undefined,
    target: "logo" | "upi"
  ) => {
    setError("");
    if (!file) {
      if (target === "logo") setLogoFile(null);
      else setUpiFile(null);
      return;
    }

    const validationMessage = validateRestaurantImage(file);
    if (validationMessage) {
      if (target === "logo") setLogoFile(null);
      else setUpiFile(null);
      setError(validationMessage);
      return;
    }

    if (target === "logo") setLogoFile(file);
    else setUpiFile(file);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!restaurant) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const validationError =
      validateHttpsUrl(formData.logo_url, "Logo URL") ||
      validateHttpsUrl(formData.upi_qr_url, "UPI QR image URL") ||
      validateTextLength(
        formData.welcome_message,
        "Welcome message",
        0,
        250,
        false
      ) ||
      validateGstRate(formData.cgst_rate || "0") ||
      validateGstRate(formData.sgst_rate || "0") ||
      validateAdminPin(formData.admin_pin.trim());
    if (validationError) {
      setSaving(false);
      setError(validationError);
      return;
    }

    let logoUrl = formData.logo_url || undefined;
    let upiQrUrl = formData.upi_qr_url || undefined;
    let adminPinHash = restaurant.admin_pin_hash;

    if (logoFile) {
      const { url, error: uploadError } = await uploadRestaurantImage(
        logoFile,
        "branding"
      );
      if (uploadError || !url) {
        setSaving(false);
        setError(
          getSafeErrorMessage(uploadError, "Image upload failed. Please try another image.")
        );
        return;
      }
      logoUrl = url;
    }

    if (upiFile) {
      const { url, error: uploadError } = await uploadRestaurantImage(
        upiFile,
        "branding"
      );
      if (uploadError || !url) {
        setSaving(false);
        setError(
          getSafeErrorMessage(uploadError, "Image upload failed. Please try another image.")
        );
        return;
      }
      upiQrUrl = url;
    }

    if (formData.admin_pin.trim()) {
      adminPinHash = await hashPassword(formData.admin_pin.trim());
    }

    const { data, error: updateError } = await updateRestaurantBranding(
      restaurant.id,
      {
        logo_url: logoUrl,
        theme_color: formData.theme_color || "#111827",
        welcome_message: formData.welcome_message || undefined,
        upi_qr_url: upiQrUrl,
        cgst_rate: parseFloat(formData.cgst_rate || "0"),
        sgst_rate: parseFloat(formData.sgst_rate || "0"),
        gst_enabled: formData.gst_enabled,
        admin_pin_hash: adminPinHash || undefined,
      }
    );

    setSaving(false);

    if (updateError || !data) {
      setError(getSafeErrorMessage(updateError, "Failed to save branding."));
      return;
    }

    setRestaurant(data);
    setFormData({
      logo_url: data.logo_url || "",
      theme_color: data.theme_color || "#111827",
      welcome_message: data.welcome_message || "",
      upi_qr_url: data.upi_qr_url || "",
      cgst_rate: (data.cgst_rate ?? 2.5).toString(),
      sgst_rate: (data.sgst_rate ?? 2.5).toString(),
      gst_enabled: data.gst_enabled || false,
      admin_pin: "",
    });
    setLogoFile(null);
    setUpiFile(null);
    setSuccess("Branding saved.");
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    const isTemporaryPassword = Boolean(currentUser?.temp_password);

    if (!isTemporaryPassword && !passwordData.current_password) {
      setPasswordError("Current password is required.");
      return;
    }

    const passwordValidation = validatePassword(
      passwordData.new_password,
      "New password"
    );
    if (passwordValidation) {
      setPasswordError(passwordValidation);
      return;
    }

    if (passwordData.new_password !== passwordData.confirm_password) {
      setPasswordError("Confirm password must match.");
      return;
    }

    setPasswordSaving(true);
    const currentPasswordHash =
      !isTemporaryPassword && passwordData.current_password
        ? await hashPassword(passwordData.current_password)
        : undefined;
    const newPasswordHash = await hashPassword(passwordData.new_password);
    const { success: changed, error: changeError } =
      await changeRestaurantPassword({
        currentPasswordHash,
        newPasswordHash,
        requireCurrentPassword: !isTemporaryPassword,
      });
    setPasswordSaving(false);

    if (changeError || !changed) {
      setPasswordError(
        getSafeErrorMessage(changeError, "Failed to change password.")
      );
      return;
    }

    const updatedUser = { ...currentUser, temp_password: false };
    setCurrentUser(updatedUser);
    setPasswordData({
      current_password: "",
      new_password: "",
      confirm_password: "",
    });
    setPasswordSuccess("Password changed successfully.");
  };

  if (loading) {
    return <Loading text="Loading settings..." />;
  }

  if (error && !restaurant) {
    return <Alert type="error" message={error} />;
  }

  if (!restaurant) {
    return <Alert type="error" message="Restaurant not found" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text mb-2">Settings</h2>
        <p className="text-text-secondary">
          Branding shown on the customer QR menu.
        </p>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}
      {currentUser?.temp_password && (
        <Alert
          type="warning"
          title="Temporary Password"
          message="Please change your temporary password."
        />
      )}

      <BillingStatusCard restaurant={restaurant} />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-start gap-3 mb-4">
            <Store className="w-6 h-6 text-accent" />
            <div>
              <h3 className="text-xl font-bold text-text">Restaurant</h3>
              <p className="text-sm text-text-secondary">
                These details identify your customer ordering links.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label mb-2">Name</label>
              <div className="p-3 bg-bg-subtle rounded-lg text-text font-medium">
                {restaurant.name}
              </div>
            </div>
            <div>
              <label className="label mb-2">Slug</label>
              <div className="p-3 bg-bg-subtle rounded-lg text-text-secondary text-sm">
                {restaurant.slug}
              </div>
            </div>
            <div>
              <label className="label mb-2">Status</label>
              <div className="p-3 bg-bg-subtle rounded-lg text-text-secondary text-sm">
                {restaurant.is_active ? "Active" : "Inactive"}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3 mb-4">
            <QrCode className="w-6 h-6 text-accent" />
            <div>
              <h3 className="text-xl font-bold text-text">Table QR Codes</h3>
              <p className="text-sm text-text-secondary">
                Create one QR code per table using secure table tokens.
              </p>
            </div>
          </div>
          <Link
            to="/restaurant/tables"
            className="inline-flex items-center gap-2 text-accent font-semibold hover:underline"
          >
            Manage Tables & QR Codes
            <ExternalLink className="w-4 h-4" />
          </Link>
        </Card>
      </div>

      <Card>
        <h3 className="text-xl font-bold text-text mb-4">Customer Branding</h3>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid lg:grid-cols-[160px_1fr] gap-4">
            <div className="w-32 h-32 rounded-lg bg-bg-subtle border border-border overflow-hidden flex items-center justify-center">
              {formData.logo_url ? (
                <img
                  src={formData.logo_url}
                  alt={restaurant.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Store className="w-10 h-10 text-text-secondary" />
              )}
            </div>
            <div className="space-y-4">
              <Input
                label="Logo URL"
                value={formData.logo_url}
                onChange={(event) =>
                  setFormData({ ...formData, logo_url: event.target.value })
                }
                placeholder="https://..."
                type="url"
                maxLength={2048}
              />
              <div>
                <label className="label mb-2">Upload Logo</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    handleBrandingFileChange(event.target.files?.[0], "logo")
                  }
                  className="input"
                />
                <p className="mt-1 text-sm text-text-secondary">
                  JPG, PNG, or WebP only. Maximum size: 3 MB.
                </p>
              </div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Theme Color"
              type="color"
              value={formData.theme_color}
              onChange={(event) =>
                setFormData({ ...formData, theme_color: event.target.value })
              }
            />
            <Input
              label="UPI QR Image URL (Optional)"
              value={formData.upi_qr_url}
              onChange={(event) =>
                setFormData({ ...formData, upi_qr_url: event.target.value })
              }
              placeholder="https://..."
              type="url"
              maxLength={2048}
            />
          </div>

          <div>
            <label className="label mb-2">Upload UPI QR Image (Optional)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                handleBrandingFileChange(event.target.files?.[0], "upi")
              }
              className="input"
            />
            <p className="mt-1 text-sm text-text-secondary">
              JPG, PNG, or WebP only. Maximum size: 3 MB.
            </p>
          </div>

          <Textarea
            label="Welcome Message"
            value={formData.welcome_message}
            onChange={(event) =>
              setFormData({
                ...formData,
                welcome_message: event.target.value,
              })
            }
            placeholder="Welcome! Order fresh from your table."
            rows={3}
            maxLength={250}
          />

          <div className="border-t border-border pt-5">
            <h4 className="font-bold text-text mb-3">Bill & GST</h4>
            <label className="flex items-center space-x-2 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={formData.gst_enabled}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    gst_enabled: event.target.checked,
                  })
                }
                className="rounded border-border"
              />
              <span className="text-text">Show CGST/SGST on bill summary</span>
            </label>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="CGST %"
                type="number"
                step="0.01"
                min="0"
                max="28"
                value={formData.cgst_rate}
                onChange={(event) =>
                  setFormData({ ...formData, cgst_rate: event.target.value })
                }
              />
              <Input
                label="SGST %"
                type="number"
                step="0.01"
                min="0"
                max="28"
                value={formData.sgst_rate}
                onChange={(event) =>
                  setFormData({ ...formData, sgst_rate: event.target.value })
                }
              />
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <h4 className="font-bold text-text mb-3">Admin PIN</h4>
            <Input
              label={
                restaurant.admin_pin_hash
                  ? "Change PIN (Optional)"
                  : "Set PIN (Optional)"
              }
              type="password"
              inputMode="numeric"
              value={formData.admin_pin}
              onChange={(event) =>
                setFormData({ ...formData, admin_pin: event.target.value })
              }
              placeholder="4 to 6 digits"
              minLength={4}
              maxLength={6}
              pattern="[0-9]{4,6}"
              helperText="Used only before deleting menu items or marking items unavailable."
            />
          </div>

          <Button type="submit" loading={saving}>
            Save Branding
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex items-start gap-3 mb-4">
          <Lock className="w-6 h-6 text-accent" />
          <div>
            <h3 className="text-xl font-bold text-text">Change Password</h3>
            <p className="text-sm text-text-secondary">
              Set the password used for future restaurant dashboard logins.
            </p>
          </div>
        </div>

        {passwordError && (
          <Alert type="error" message={passwordError} className="mb-4" />
        )}
        {passwordSuccess && (
          <Alert type="success" message={passwordSuccess} className="mb-4" />
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          {!currentUser?.temp_password && (
            <Input
              label="Current Password"
              type="password"
              value={passwordData.current_password}
              onChange={(event) =>
                setPasswordData({
                  ...passwordData,
                  current_password: event.target.value,
                })
              }
              autoComplete="current-password"
              maxLength={128}
              required
            />
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="New Password"
              type="password"
              value={passwordData.new_password}
              onChange={(event) =>
                setPasswordData({
                  ...passwordData,
                  new_password: event.target.value,
                })
              }
              helperText="Minimum 8 characters."
              autoComplete="new-password"
              maxLength={128}
              required
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={passwordData.confirm_password}
              onChange={(event) =>
                setPasswordData({
                  ...passwordData,
                  confirm_password: event.target.value,
                })
              }
              autoComplete="new-password"
              maxLength={128}
              required
            />
          </div>

          <Button type="submit" loading={passwordSaving}>
            Change Password
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default RestaurantSettings;
