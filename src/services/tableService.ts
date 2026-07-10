import { supabase } from "../config/supabase";
import type { RestaurantTable } from "../config/supabase";

export interface TableActionContext {
  userId: string;
  restaurantId: string;
}

export const subscribeToTables = (
  context: TableActionContext,
  restaurantId: string,
  callback: (tables: RestaurantTable[]) => void
) => {
  const fetchTables = async () => {
    const { data, error } = await supabase.rpc("restaurant_list_tables", {
      p_user_id: context.userId,
      p_restaurant_id: context.restaurantId,
    });

    if (!error && data) {
      callback(data as RestaurantTable[]);
    }
  };

  fetchTables();

  const subscription = supabase
    .channel(`restaurant-tables-${restaurantId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tables",
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      () => {
        fetchTables();
      }
    )
    .subscribe();

  return subscription;
};

export const createRestaurantTable = async (
  context: TableActionContext,
  tableNumber: string
) => {
  const { data, error } = await supabase.rpc("restaurant_create_table", {
    p_user_id: context.userId,
    p_restaurant_id: context.restaurantId,
    p_table_number: tableNumber,
  });

  return { data: data as RestaurantTable | null, error };
};

export const updateRestaurantTable = async (
  context: TableActionContext,
  tableId: string,
  updates: { tableNumber?: string; isActive?: boolean }
) => {
  const { data, error } = await supabase.rpc("restaurant_update_table", {
    p_user_id: context.userId,
    p_restaurant_id: context.restaurantId,
    p_table_id: tableId,
    p_table_number: updates.tableNumber ?? null,
    p_is_active: updates.isActive ?? null,
  });

  return { data: data as RestaurantTable | null, error };
};

export const regenerateRestaurantTableToken = async (
  context: TableActionContext,
  tableId: string
) => {
  const { data, error } = await supabase.rpc("restaurant_regenerate_table_token", {
    p_user_id: context.userId,
    p_restaurant_id: context.restaurantId,
    p_table_id: tableId,
  });

  return { data: data as RestaurantTable | null, error };
};
