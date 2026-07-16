// Supabase Configuration
// Replace these with your actual Supabase project credentials
// Get them from: https://app.supabase.com/project/_/settings/api

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "YOUR_SUPABASE_URL";
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

// Application Configuration
export const APP_CONFIG = {
  appName: "Rasivo",
  defaultCurrency: "₹",
  taxRate: 0.05, // 5% GST
  orderPrefix: "ORD",

  // Public pricing plans shown on the homepage.
  plans: {
    free: {
      name: "Free",
      price: 0,
      duration: "Free Trial / Demo",
      features: [
        "Try QR ordering",
        "Test menu setup",
        "Basic demo access",
        "Limited usage for testing",
      ],
    },
    restaurant_plan: {
      name: "Restaurant Plan",
      price: 1000,
      duration: "per month",
      features: [
        "Unlimited table QR codes",
        "Customer self-ordering",
        "Live counter/kitchen dashboard",
        "Menu management",
        "KOT print",
        "Bill summary",
        "Image upload",
        "Daily sales summary",
        "Table-wise order history",
        "Restaurant branding",
        "Support",
      ],
    },
  },

  // Restaurant types
  restaurantTypes: [
    "Restaurant",
    "Food Truck",
    "Cafe",
    "Bakery",
    "Cloud Kitchen",
    "Fine Dining",
    "Quick Service",
    "Other",
  ],

  // Menu categories
  menuCategories: [
    "Starters",
    "Main Course",
    "Breakfast",
    "Lunch",
    "Dinner",
    "Beverages",
    "Desserts",
    "Snacks",
    "Other",
  ],

  foodTypes: [
    { value: "veg", label: "Veg" },
    { value: "non_veg", label: "Non-Veg" },
    { value: "egg", label: "Egg" },
    { value: "jain", label: "Jain" },
  ],

  // Order statuses
  orderStatuses: {
    new: { label: "New", color: "warning" },
    pending: { label: "Pending", color: "warning" },
    accepted: { label: "Accepted", color: "accent-secondary" },
    preparing: { label: "Preparing", color: "accent-secondary" },
    ready: { label: "Ready", color: "success" },
    served: { label: "Served", color: "success" },
    completed: { label: "Completed", color: "success" },
    cancelled: { label: "Cancelled", color: "error" },
    rejected: { label: "Rejected", color: "error" },
  },

  // Payment methods
  paymentMethods: ["Cash", "UPI", "Card", "Other"],

  // Registration sources
  heardFromOptions: [
    "Google Search",
    "Social Media",
    "Friend/Referral",
    "Advertisement",
    "Other",
  ],
};
