import type { MenuItem } from "../config/supabase";

export interface CartItem extends MenuItem {
  quantity: number;
  selectedSize?: { name: string; price: number };
  selectedAddons: { name: string; price: number }[];
  itemTotal: number;
  specialInstructions?: string;
}

export const mergeCartItem = (
  currentCart: CartItem[],
  item: MenuItem,
  quantity = 1,
  selectedSize?: { name: string; price: number },
  selectedAddons: { name: string; price: number }[] = [],
  specialInstructions = ""
) => {
  const itemTotal =
    (selectedSize?.price ?? item.base_price) +
    selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
  const addonKey = selectedAddons.map((addon) => addon.name).sort().join("|");
  const note = specialInstructions.trim().replace(/\s+/g, " ").slice(0, 200);
  const existingIndex = currentCart.findIndex((cartItem) => {
    const cartAddonKey = cartItem.selectedAddons
      .map((addon) => addon.name)
      .sort()
      .join("|");
    return (
      cartItem.id === item.id &&
      cartItem.selectedSize?.name === selectedSize?.name &&
      cartAddonKey === addonKey &&
      (cartItem.specialInstructions || "") === note
    );
  });

  if (existingIndex >= 0) {
    return currentCart.map((cartItem, index) =>
      index === existingIndex
        ? { ...cartItem, quantity: cartItem.quantity + quantity }
        : cartItem
    );
  }

  return [
    ...currentCart,
    {
      ...item,
      quantity,
      selectedSize,
      selectedAddons,
      itemTotal,
      specialInstructions: note || undefined,
    },
  ];
};
