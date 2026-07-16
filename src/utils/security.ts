import { isValidEmail, isValidPhone } from "./helpers";

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const GENERIC_ERROR = "Something went wrong. Please try again.";
const RAW_ERROR_PATTERNS = [
  "duplicate key",
  "violates",
  "constraint",
  "relation",
  "schema cache",
  "jwt",
  "rpc",
  "postgres",
  "permission denied",
  "row-level security",
  "stack",
  "syntax",
];

export const cleanText = (value: unknown, maxLength: number) =>
  String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);

export const normalizeEmail = (email: string) =>
  cleanText(email, 254).toLowerCase();

export const normalizePhone = (phone: string) =>
  String(phone ?? "").replace(/[^\d+]/g, "").slice(0, 15);

export const validateEmail = (email: string, required = true) => {
  const normalized = normalizeEmail(email);
  if (!normalized && !required) return "";
  if (!normalized) return "Email is required.";
  if (normalized.length > 254 || !isValidEmail(normalized)) {
    return "Enter a valid email address.";
  }
  return "";
};

export const validatePhone = (phone: string, required = true) => {
  const normalized = normalizePhone(phone);
  if (!normalized && !required) return "";
  if (!normalized) return "Phone number is required.";
  if (normalized.length > 15 || !isValidPhone(normalized)) {
    return "Enter a valid 10 to 15 digit phone number.";
  }
  return "";
};

export const validatePassword = (password: string, label = "Password") => {
  if (!password) return `${label} is required.`;
  if (password.length < 8) return `${label} must be at least 8 characters.`;
  if (password.length > 128) return `${label} must be 128 characters or less.`;
  return "";
};

export const validateTextLength = (
  value: string,
  label: string,
  min: number,
  max: number,
  required = true
) => {
  const cleaned = cleanText(value, max + 1);
  if (!cleaned && !required) return "";
  if (!cleaned) return `${label} is required.`;
  if (cleaned.length < min) return `${label} must be at least ${min} characters.`;
  if (cleaned.length > max) return `${label} must be ${max} characters or less.`;
  return "";
};

export const validatePrice = (value: number | string, label = "Price") => {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return `${label} must be positive.`;
  if (price > 100000) return `${label} is too high.`;
  return "";
};

export const validateGstRate = (value: number | string) => {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 28) {
    return "GST rate must be between 0 and 28.";
  }
  return "";
};

export const validateAdminPin = (pin: string) => {
  if (!pin) return "";
  return /^\d{4,6}$/.test(pin) ? "" : "Admin PIN must be 4 to 6 digits.";
};

export const validateHttpsUrl = (
  value: string,
  label: string,
  required = false
) => {
  const input = value.trim();
  if (!input && !required) return "";
  if (!input) return `${label} is required.`;
  if (input.length > 2048) return `${label} is too long.`;
  try {
    const url = new URL(input);
    return url.protocol === "https:" ? "" : `${label} must use HTTPS.`;
  } catch {
    return `Enter a valid ${label.toLowerCase()}.`;
  }
};

export const getSafeErrorMessage = (
  error: unknown,
  fallback = GENERIC_ERROR
) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!message) return fallback;

  const lower = message.toLowerCase();
  if (lower.includes("too many attempts")) {
    return "Too many attempts. Please wait and try again.";
  }
  if (lower.includes("invalid email or password")) {
    return "Invalid email or password.";
  }
  if (lower.includes("current password is incorrect")) {
    return "Current password is incorrect.";
  }
  if (RAW_ERROR_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return fallback;
  }

  return message.length <= 140 ? message : fallback;
};

export const logErrorForDev = (error: unknown, context: string) => {
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, error);
  }
};

export const validateImageBasic = (file: File) => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Only JPG, PNG, or WebP images are allowed.";
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be less than 3 MB.";
  }

  if (/\.svg$/i.test(file.name)) {
    return "SVG images are not allowed.";
  }

  return "";
};

export const validateImageMagicBytes = async (file: File) => {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (
    (file.type === "image/jpeg" && isJpeg) ||
    (file.type === "image/png" && isPng) ||
    (file.type === "image/webp" && isWebp)
  ) {
    return "";
  }

  return "The selected file is not a valid JPG, PNG, or WebP image.";
};

export const validateImageFile = async (file: File) => {
  const basicError = validateImageBasic(file);
  if (basicError) return basicError;
  return validateImageMagicBytes(file);
};
