import { supabase } from "../config/supabase";
import type {
  CustomerOrderContext,
  CustomerOrderInput,
  Order,
  MenuItem,
  Restaurant,
} from "../config/supabase";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  getSafeErrorMessage,
  logErrorForDev,
  validateImageBasic,
  validateImageFile,
} from "../utils/security";

const getStoredRestaurantUser = () =>
  JSON.parse(localStorage.getItem("user") || "{}");

export const MAX_RESTAURANT_IMAGE_BYTES = MAX_IMAGE_BYTES;
export const ALLOWED_RESTAURANT_IMAGE_TYPES = ALLOWED_IMAGE_TYPES;

export interface DailySalesSummary {
  total_orders: number;
  total_revenue: number;
  new_orders: number;
  served_orders: number;
  top_item_name: string | null;
  top_item_quantity: number;
  most_active_table: string | null;
  most_active_table_orders: number;
}

export interface TopSellingItem {
  item_name: string;
  quantity_sold: number;
  revenue: number;
}

export const validateRestaurantImage = (file: File) => {
  return validateImageBasic(file);
};

const getStartOfTodayIso = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
};

/**
 * Restaurant API Service
 * All restaurant dashboard operations with real-time support
 */

// Subscribe to restaurant's orders with real-time updates
export const subscribeToOrders = (
  restaurantId: string,
  callback: (orders: Order[]) => void
) => {
  const user = getStoredRestaurantUser();
  const fetchOrders = async () => {
    const fromDate = getStartOfTodayIso();
    const { data, error } =
      user?.id && user?.restaurant_id
        ? await supabase.rpc("restaurant_list_orders_range", {
            p_user_id: user.id,
            p_restaurant_id: user.restaurant_id,
            p_from: fromDate,
            p_to: null,
          })
        : await supabase
            .from("orders")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .gte("created_at", fromDate)
            .order("created_at", { ascending: false });

    if (!error && data) {
      callback(data as Order[]);
    }
  };

  fetchOrders();

  const subscription = supabase
    .channel(`restaurant-orders-${restaurantId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      () => {
        fetchOrders();
      }
    )
    .subscribe();

  return subscription;
};

// Update order status
export const updateOrderStatus = async (
  orderId: string,
  status: string
) => {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (user?.id && user?.restaurant_id) {
    const { error } = await supabase.rpc("restaurant_update_order_status", {
      p_user_id: user.id,
      p_restaurant_id: user.restaurant_id,
      p_order_id: orderId,
      p_status: status,
    });

    return { success: !error, error };
  }

  return { success: false, error: new Error("Restaurant session not found") };
};

// Subscribe to menu items with real-time updates
export const subscribeToMenuItems = (
  restaurantId: string,
  callback: (items: MenuItem[]) => void
) => {
  const fetchItems = async () => {
    const user = getStoredRestaurantUser();
    const { data, error } =
      user?.id && user?.restaurant_id === restaurantId
        ? await supabase.rpc("restaurant_list_menu_items", {
            p_user_id: user.id,
            p_restaurant_id: restaurantId,
          })
        : await supabase
            .from("menu_items")
            .select("*")
            .eq("restaurant_id", restaurantId)
            .order("created_at", { ascending: false });

    if (!error && data) {
      callback(data as MenuItem[]);
    }
  };

  fetchItems();

  const subscription = supabase
    .channel(`restaurant-menu-${restaurantId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "menu_items",
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      () => {
        fetchItems();
      }
    )
    .subscribe();

  return subscription;
};

// Validate a customer QR token and load the public ordering context.
export const getCustomerOrderContext = async (
  restaurantSlug: string,
  tableToken: string
) => {
  const { data, error } = await supabase.rpc("get_customer_order_context", {
    p_restaurant_slug: restaurantSlug,
    p_table_token: tableToken,
  });

  return {
    data: data as CustomerOrderContext | null,
    error,
  };
};

// Create menu item
export const createMenuItem = async (item: Partial<MenuItem>) => {
  const user = getStoredRestaurantUser();
  if (user?.id && user?.restaurant_id) {
    const { error } = await supabase.rpc("restaurant_upsert_menu_item", {
      p_user_id: user.id,
      p_restaurant_id: user.restaurant_id,
      p_item_id: null,
      p_item: item,
    });

    return !error;
  }

  const { error } = await supabase
    .from("menu_items")
    .insert([item])
    .select()
    .single();

  return !error;
};

// Update menu item
export const updateMenuItem = async (
  itemId: string,
  updates: Partial<MenuItem>
) => {
  const user = getStoredRestaurantUser();
  if (user?.id && user?.restaurant_id) {
    const { error } = await supabase.rpc("restaurant_upsert_menu_item", {
      p_user_id: user.id,
      p_restaurant_id: user.restaurant_id,
      p_item_id: itemId,
      p_item: updates,
    });

    return !error;
  }

  const { error } = await supabase
    .from("menu_items")
    .update(updates)
    .eq("id", itemId);

  return !error;
};

// Toggle menu item availability (triggers real-time update for customers)
export const toggleMenuItemAvailability = async (
  itemId: string,
  isAvailable: boolean
) => {
  const user = getStoredRestaurantUser();
  if (user?.id && user?.restaurant_id) {
    const { error } = await supabase.rpc("restaurant_upsert_menu_item", {
      p_user_id: user.id,
      p_restaurant_id: user.restaurant_id,
      p_item_id: itemId,
      p_item: { is_available: isAvailable },
    });

    return !error;
  }

  const { error } = await supabase
    .from("menu_items")
    .update({ is_available: isAvailable })
    .eq("id", itemId);

  return !error;
};

// Delete menu item
export const deleteMenuItem = async (itemId: string) => {
  const user = getStoredRestaurantUser();
  if (user?.id && user?.restaurant_id) {
    const { error } = await supabase.rpc("restaurant_delete_menu_item", {
      p_user_id: user.id,
      p_restaurant_id: user.restaurant_id,
      p_item_id: itemId,
    });

    return !error;
  }

  const { error } = await supabase.from("menu_items").delete().eq("id", itemId);

  return !error;
};

// Create order (manual or from customer)
export const createOrder = async (order: Partial<Order>) => {
  const { data, error } = await supabase
    .from("orders")
    .insert([order])
    .select()
    .single();

  return { data, error };
};

export const uploadRestaurantImage = async (
  file: File,
  folder: "menu" | "branding" = "menu"
) => {
  const validationMessage = await validateImageFile(file);
  if (validationMessage) {
    return { url: null, error: new Error(validationMessage) };
  }

  const user = getStoredRestaurantUser();
  if (!user?.session_token) {
    return { url: null, error: new Error("Please sign in again before uploading.") };
  }

  const prepareResponse = await fetch("/.netlify/functions/create-image-upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.session_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ folder, mime: file.type, size: file.size }),
  });
  const upload = await prepareResponse.json().catch(() => ({}));
  if (!prepareResponse.ok || !upload?.path || !upload?.token) {
    if (prepareResponse.status === 500 && user?.restaurant_id) {
      // ponytail: remove this compatibility path after Part 8 and the
      // server-only Supabase key are both configured in Netlify.
      const extension = file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
      const path = `${folder}/${user.restaurant_id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("menu-images").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (!error) {
        const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
        return { url: data.publicUrl, error: null };
      }
    }
    return {
      url: null,
      error: new Error(upload?.error || "Image upload is temporarily unavailable."),
    };
  }

  const { error } = await supabase.storage
    .from("menu-images")
    .uploadToSignedUrl(upload.path, upload.token, file, {
      cacheControl: "3600",
      contentType: file.type,
    });

  if (error) {
    return { url: null, error: new Error(getSafeErrorMessage(error, "Image upload failed. Please try another image.")) };
  }

  const { data } = supabase.storage.from("menu-images").getPublicUrl(upload.path);
  return { url: data.publicUrl, error: null };
};

export const updateRestaurantBranding = async (
  restaurantId: string,
  updates: Partial<
    Pick<
      Restaurant,
      "logo_url" | "theme_color" | "welcome_message" | "upi_qr_url"
    >
    & Pick<
      Restaurant,
      "cgst_rate" | "sgst_rate" | "gst_enabled" | "admin_pin_hash"
    >
  >
) => {
  const user = getStoredRestaurantUser();
  if (user?.id && user?.restaurant_id) {
    const { data, error } = await supabase.rpc("restaurant_update_branding", {
      p_user_id: user.id,
      p_restaurant_id: user.restaurant_id,
      p_branding: updates,
    });

    return { data: data as Restaurant | null, error };
  }

  const { data, error } = await supabase
    .from("restaurants")
    .update(updates)
    .eq("id", restaurantId)
    .select()
    .single();

  return { data: data as Restaurant | null, error };
};

export const markOrderPrinted = async (
  orderId: string,
  printType: "kot" | "bill"
) => {
  const user = getStoredRestaurantUser();
  if (!user?.id || !user?.restaurant_id) {
    return false;
  }

  const { error } = await supabase.rpc("restaurant_mark_order_printed", {
    p_user_id: user.id,
    p_restaurant_id: user.restaurant_id,
    p_order_id: orderId,
    p_print_type: printType,
  });

  return !error;
};

export const changeRestaurantPassword = async ({
  currentPasswordHash,
  newPasswordHash,
  requireCurrentPassword,
}: {
  currentPasswordHash?: string;
  newPasswordHash: string;
  requireCurrentPassword: boolean;
}) => {
  const user = getStoredRestaurantUser();
  if (!user?.id || !user?.restaurant_id) {
    return { success: false, error: new Error("User session not found") };
  }

  const { data, error } = await supabase.rpc("restaurant_change_password", {
    p_user_id: user.id,
    p_restaurant_id: user.restaurant_id,
    p_current_password_hash: currentPasswordHash || null,
    p_new_password_hash: newPasswordHash,
    p_require_current_password: requireCurrentPassword,
  });

  if (error) return { success: false, error };

  localStorage.setItem(
    "user",
    JSON.stringify({
      ...user,
      temp_password: false,
    })
  );

  return { success: Boolean(data), error: null };
};

export const getDailySalesSummary = async (
  restaurantId: string,
  date = new Date()
) => {
  const { data, error } = await supabase.rpc("get_daily_sales_summary", {
    p_restaurant_id: restaurantId,
    p_date: date.toISOString().slice(0, 10),
  });

  if (error) return { data: null, error };

  const firstRow = Array.isArray(data) ? data[0] : data;
  return { data: firstRow as DailySalesSummary | null, error: null };
};

export const getTopSellingItems = async (restaurantId: string, days: number) => {
  const { data, error } = await supabase.rpc("get_top_selling_items", {
    p_restaurant_id: restaurantId,
    p_days: days,
  });

  return {
    data: (data || []) as TopSellingItem[],
    error,
  };
};

export const getRestaurantOrdersForRange = async (
  restaurantId: string,
  days: number
) => {
  const user = getStoredRestaurantUser();
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (days - 1));

  const { data, error } =
    user?.id && user?.restaurant_id
      ? await supabase.rpc("restaurant_list_orders_range", {
          p_user_id: user.id,
          p_restaurant_id: user.restaurant_id,
          p_from: startDate.toISOString(),
          p_to: null,
        })
      : await supabase
          .from("orders")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .gte("created_at", startDate.toISOString())
          .order("created_at", { ascending: false });

  return {
    data: (data || []) as Order[],
    error,
  };
};

// Public customer order creation. The database function validates the
// restaurant/table token and recalculates prices before inserting.
export const createCustomerOrder = async (order: CustomerOrderInput) => {
  const { data, error } = await supabase.rpc("create_customer_order", {
    p_restaurant_slug: order.restaurant_slug,
    p_table_token: order.table_token,
    p_items: order.items,
    p_customer_name: order.customer_name || null,
    p_customer_phone: order.customer_phone || null,
    p_customer_notes: order.customer_notes || null,
  });

  return { data, error };
};

// Get restaurant stats
export const getRestaurantStats = async (restaurantId: string) => {
  try {
    const [{ data: summary }, { count: totalMenuItems }, { data: recentOrders }] =
      await Promise.all([
        getDailySalesSummary(restaurantId),
        supabase
          .from("menu_items")
          .select("*", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId),
        getRestaurantOrdersForRange(restaurantId, 1),
      ]);

    return {
      pendingOrders: summary?.new_orders || 0,
      completedToday: summary?.served_orders || 0,
      revenueToday: summary?.total_revenue || 0,
      todayOrders: summary?.total_orders || 0,
      todayRevenue: summary?.total_revenue || 0,
      totalMenuItems: totalMenuItems || 0,
      recentOrders: recentOrders?.slice(0, 5) || [],
    };
  } catch (error) {
    logErrorForDev(error, "getRestaurantStats");
    return {
      pendingOrders: 0,
      completedToday: 0,
      revenueToday: 0,
      todayOrders: 0,
      todayRevenue: 0,
      totalMenuItems: 0,
      recentOrders: [],
    };
  }
};
