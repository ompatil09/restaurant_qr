import { HttpError } from "./billing.ts";

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;
const ALLOWED_RESTAURANT_TYPES = new Set([
  "Restaurant",
  "Food Truck",
  "Cafe",
  "Bakery",
  "Cloud Kitchen",
  "Fine Dining",
  "Quick Service",
  "Other",
]);
const ALLOWED_SOURCES = new Set([
  "Google Search",
  "Social Media",
  "Friend/Referral",
  "Advertisement",
  "Other",
]);

export const cleanText = (value: unknown, max: number) =>
  String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max + 1);

export const normalizeEmail = (value: unknown) =>
  cleanText(value, 254).toLowerCase();

export const normalizePhone = (value: unknown) =>
  String(value ?? "").replace(/[^0-9+]/g, "").slice(0, 16);

const requiredText = (
  value: unknown,
  min: number,
  max: number
) => {
  const text = cleanText(value, max);
  if (text.length < min || text.length > max) {
    throw new HttpError(400, "Invalid request details.");
  }
  return text;
};

const optionalText = (value: unknown, max: number) => {
  const text = cleanText(value, max);
  if (text.length > max) throw new HttpError(400, "Invalid request details.");
  return text || null;
};

export const validatedEmail = (value: unknown) => {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return email;
};

export const validateRegistration = (value: Record<string, unknown>) => {
  const phone = normalizePhone(value.phone);
  if (!PHONE_PATTERN.test(phone)) {
    throw new HttpError(400, "Invalid request details.");
  }
  const restaurantType = requiredText(value.restaurant_type, 2, 80);
  const heardFrom = optionalText(value.heard_from, 80);
  if (!ALLOWED_RESTAURANT_TYPES.has(restaurantType)) {
    throw new HttpError(400, "Invalid request details.");
  }
  if (heardFrom && !ALLOWED_SOURCES.has(heardFrom)) {
    throw new HttpError(400, "Invalid request details.");
  }

  return {
    restaurant_name: requiredText(value.restaurant_name, 2, 100),
    owner_name: requiredText(value.owner_name, 2, 100),
    phone,
    email: validatedEmail(value.email),
    city: requiredText(value.city, 2, 80),
    address: optionalText(value.address, 250),
    restaurant_type: restaurantType,
    heard_from: heardFrom,
    notes: optionalText(value.notes, 500),
  };
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const validateImageRequest = (value: Record<string, unknown>) => {
  const folder = value.folder;
  const mime = value.mime;
  const size = Number(value.size);
  if (
    (folder !== "menu" && folder !== "branding") ||
    typeof mime !== "string" ||
    !IMAGE_TYPES.has(mime) ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 3 * 1024 * 1024
  ) {
    throw new HttpError(400, "Invalid image.");
  }

  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return { folder, mime, size, extension };
};
