import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CheckCircle,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  Input,
  LazyImage,
  Loading,
  Modal,
} from "../../components/ui";
import {
  createCustomerOrder,
  getCustomerOrderContext,
  subscribeToMenuItems,
} from "../../services/restaurantService";
import type { MenuItem } from "../../config/supabase";
import { formatCurrency, isValidPhone } from "../../utils/helpers";
import {
  cleanText,
  getSafeErrorMessage,
  validateTextLength,
} from "../../utils/security";
import { getRestaurantAccessStatus } from "../../services/subscriptionService";
import { mergeCartItem, type CartItem } from "../../utils/cart";

interface TableContext {
  id: string;
  table_number: string;
  is_active: boolean;
}

interface RestaurantContext {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  theme_color?: string;
  welcome_message?: string;
  subscription_status?: "trialing" | "active" | "past_due" | "unpaid" | "cancelled" | "inactive";
  current_period_end?: string;
  grace_until?: string;
  is_active: boolean;
}

const foodFilters = [
  { value: "all", label: "All" },
  { value: "veg", label: "Veg" },
  { value: "non_veg", label: "Non-Veg" },
  { value: "egg", label: "Egg" },
  { value: "jain", label: "Jain" },
];

const getFoodTypeLabel = (foodType?: string) =>
  foodFilters.find((filter) => filter.value === foodType)?.label || "Veg";

const getFoodTypeClassName = (foodType?: string) => {
  const classes: Record<string, string> = {
    veg: "border-emerald-500 text-emerald-700 bg-emerald-50",
    non_veg: "border-red-500 text-red-700 bg-red-50",
    egg: "border-amber-500 text-amber-700 bg-amber-50",
    jain: "border-lime-500 text-lime-700 bg-lime-50",
  };
  return classes[foodType || "veg"] || classes.veg;
};

const CustomerMenu: React.FC = () => {
  const { restaurantSlug, tableToken } = useParams<{
    restaurantSlug: string;
    tableToken: string;
  }>();
  const [restaurant, setRestaurant] = useState<RestaurantContext | null>(null);
  const [table, setTable] = useState<TableContext | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [foodTypeFilter, setFoodTypeFilter] = useState("all");
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  useEffect(() => {
    const loadContext = async () => {
      if (!restaurantSlug || !tableToken) {
        setError("Invalid ordering link.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const { data, error: contextError } = await getCustomerOrderContext(
        restaurantSlug,
        tableToken
      );

      if (contextError || !data) {
        setError(
          getSafeErrorMessage(
            contextError,
            "This table ordering link is invalid or inactive."
          )
        );
        setLoading(false);
        return;
      }

      const access = getRestaurantAccessStatus(data.restaurant);
      if (!access.canUseOrdering) {
        setError("Ordering is currently unavailable for this restaurant.");
        setRestaurant(data.restaurant);
        setTable(data.table);
        setMenuItems([]);
        setLoading(false);
        return;
      }

      setRestaurant(data.restaurant);
      setTable(data.table);
      setMenuItems(data.menu_items || []);
      setLoading(false);
    };

    loadContext();
  }, [restaurantSlug, tableToken]);

  useEffect(() => {
    if (!restaurant?.id) return;

    const subscription = subscribeToMenuItems(restaurant.id, (items) => {
      setMenuItems(items);
      setCart((currentCart) =>
        currentCart.filter((cartItem) =>
          items.some(
            (item) => item.id === cartItem.id && item.is_available === true
          )
        )
      );
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [restaurant?.id]);

  const availableItems = useMemo(
    () => menuItems.filter((item) => item.is_available),
    [menuItems]
  );

  const categories = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(availableItems.map((item) => item.category).filter(Boolean))
      ),
    ],
    [availableItems]
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return availableItems.filter((item) => {
      const searchable = [
        item.name,
        item.description || "",
        item.category || "",
        getFoodTypeLabel(item.food_type),
        item.food_type || "",
        item.is_best_seller ? "best seller popular" : "",
        item.is_recommended ? "recommended chef special" : "",
        item.tag_label || "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !normalizedSearch || searchable.includes(normalizedSearch);
      const matchesCategory =
        categoryFilter === "all" || item.category === categoryFilter;
      const matchesFoodType =
        foodTypeFilter === "all" || item.food_type === foodTypeFilter;

      return matchesSearch && matchesCategory && matchesFoodType;
    });
  }, [availableItems, categoryFilter, foodTypeFilter, searchTerm]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce(
    (sum, item) => sum + item.itemTotal * item.quantity,
    0
  );
  const themeColor = restaurant?.theme_color || "#111827";

  const addToCart = (
    item: MenuItem,
    selectedSize?: { name: string; price: number },
    selectedAddons: { name: string; price: number }[] = [],
    quantity = 1,
    specialInstructions = ""
  ) => {
    setCart((currentCart) =>
      mergeCartItem(
        currentCart,
        item,
        quantity,
        selectedSize,
        selectedAddons,
        specialInstructions
      )
    );

    setSelectedItem(null);
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart((currentCart) =>
      currentCart
        .map((item, itemIndex) =>
          itemIndex === index
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (index: number) => {
    setCart((currentCart) =>
      currentCart.filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const decrementSimpleItem = (itemId: string) => {
    const index = cart.findIndex((cartItem) => cartItem.id === itemId);
    if (index >= 0) updateQuantity(index, -1);
  };

  const getItemQuantity = (itemId: string) =>
    cart.reduce(
      (sum, cartItem) =>
        cartItem.id === itemId ? sum + cartItem.quantity : sum,
      0
    );

  if (loading) {
    return <Loading text="Loading menu..." />;
  }

  if (error || !restaurant || !table) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-md text-center p-8">
          <Package className="w-14 h-14 text-text-secondary mx-auto mb-4 opacity-50" />
          <h2 className="text-2xl font-bold text-text mb-2">
            Ordering Link Unavailable
          </h2>
          <p className="text-text-secondary">
            {error || "This restaurant or table is not available right now."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f3ed] pb-28 text-[#261b14]">
      <header className="bg-[#fffaf4]/95 backdrop-blur border-b border-[#eadfD2] sticky top-0 z-40 shadow-sm">
        <div className="max-w-screen-lg mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <LazyImage
              src={restaurant.logo_url}
              alt={restaurant.name}
              className="w-12 h-12 rounded-lg flex-shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-bold text-xl text-[#231811] truncate">
                {restaurant.name}
              </h1>
              <p className="text-sm font-medium text-[#7a5c46]">
                Table {table.table_number}
              </p>
            </div>
          </div>

          {restaurant.welcome_message && (
            <p className="text-sm text-[#6d5543] mb-3 leading-relaxed">
              {restaurant.welcome_message}
            </p>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search dishes, descriptions, categories"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-10 pr-4 py-3.5 border border-[#e5d8ca] bg-white rounded-xl text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-[#8b5e34]/20"
            />
          </div>
        </div>
      </header>

      <div className="bg-[#fffaf4]/95 backdrop-blur border-b border-[#eadfd2] sticky top-[145px] z-30">
        <div className="max-w-screen-lg mx-auto px-4">
          <div className="flex gap-2 overflow-x-auto py-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setCategoryFilter(category || "all")}
                style={
                  categoryFilter === category
                    ? { backgroundColor: themeColor, color: "white" }
                    : undefined
                }
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
                  categoryFilter === category
                    ? ""
                    : "bg-white text-[#755c49] border border-[#eadfd2]"
                }`}
              >
                {category === "all" ? "All" : category}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {foodFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setFoodTypeFilter(filter.value)}
                style={
                  foodTypeFilter === filter.value
                    ? { backgroundColor: themeColor, color: "white" }
                    : undefined
                }
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                  foodTypeFilter === filter.value
                    ? ""
                    : "bg-white text-[#755c49] border border-[#eadfd2]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-screen-lg mx-auto px-4 py-4">
        <div className="mb-4 rounded-xl bg-[#fffaf4] border border-[#eadfd2] px-4 py-3 text-xs font-medium text-[#7a5c46] shadow-sm">
          Prices shown are excluding GST. CGST/SGST may be added in final bill.
        </div>

        {filteredItems.length === 0 ? (
          <Card className="text-center py-12">
            <Package className="w-14 h-14 text-text-secondary mx-auto mb-4 opacity-50" />
            <h2 className="text-lg font-semibold text-text mb-1">
              No items found
            </h2>
            <p className="text-sm text-text-secondary">
              Try another search or category.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredItems.map((item) => {
              const quantity = getItemQuantity(item.id);
              const hasOptions =
                Boolean(item.sizes?.length) || Boolean(item.addons?.length);

              return (
                <article
                  key={item.id}
                  className="relative bg-[#fffaf4] rounded-2xl border border-[#eadfd2] overflow-hidden shadow-sm transition-shadow hover:shadow-md"
                >
                  <button
                    type="button"
                    aria-label={`View details for ${item.name}`}
                    onClick={() => setSelectedItem(item)}
                    className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#8b5e34]/30"
                  />
                  <div className="pointer-events-none relative z-10 flex gap-3 p-3">
                    <LazyImage
                      src={item.image_url}
                      alt={item.name}
                      className="w-24 h-24 rounded-lg flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="min-h-[66px]">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          {item.category && (
                            <span className="text-xs font-semibold uppercase tracking-wide text-[#947258]">
                              {item.category}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${getFoodTypeClassName(
                              item.food_type
                            )}`}
                          >
                            {getFoodTypeLabel(item.food_type)}
                          </span>
                        </div>
                        <h2 className="font-bold text-[#261b14] leading-snug">
                          {item.name}
                        </h2>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.is_best_seller && (
                            <span className="text-[10px] bg-[#fff1cf] text-[#9a6200] px-1.5 py-0.5 rounded font-semibold">
                              Best Seller
                            </span>
                          )}
                          {item.is_recommended && (
                            <span className="text-[10px] bg-[#efe7dc] text-[#6a4b31] px-1.5 py-0.5 rounded font-semibold">
                              Recommended
                            </span>
                          )}
                          {item.tag_label && (
                            <span className="text-[10px] bg-white text-[#755c49] px-1.5 py-0.5 rounded font-semibold border border-[#eadfd2]">
                              {item.tag_label}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-[#7a6656] line-clamp-2 mt-1 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-end justify-between gap-3 mt-3">
                        <p className="font-bold text-[#261b14]">
                          {item.sizes?.length
                            ? `From ${formatCurrency(
                                Math.min(...item.sizes.map((s) => s.price))
                              )}`
                            : formatCurrency(item.base_price)}
                        </p>

                        {quantity === 0 ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (hasOptions) {
                                setSelectedItem(item);
                              } else {
                                addToCart(item);
                              }
                            }}
                            style={{ borderColor: themeColor, color: themeColor }}
                            className="pointer-events-auto px-4 py-2 border-2 font-bold text-xs rounded-lg bg-white shadow-sm"
                          >
                            ADD
                          </button>
                        ) : (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            className="pointer-events-auto flex items-center text-white rounded-md"
                            style={{ backgroundColor: themeColor }}
                          >
                            <button
                              type="button"
                              onClick={() => decrementSimpleItem(item.id)}
                              className="p-2"
                              aria-label={`Remove ${item.name}`}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center font-bold text-sm">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                hasOptions
                                  ? setSelectedItem(item)
                                  : addToCart(item)
                              }
                              className="p-2"
                              aria-label={`Add ${item.name}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <CartModal
        isOpen={showCart}
        cart={cart}
        subtotal={cartSubtotal}
        onClose={() => setShowCart(false)}
        onUpdateQuantity={updateQuantity}
        onRemove={removeFromCart}
        onCheckout={() => {
          setShowCart(false);
          setShowCheckout(true);
        }}
      />

      <ItemCustomizationModal
        key={selectedItem?.id || "closed"}
        isOpen={Boolean(selectedItem)}
        item={selectedItem}
        themeColor={themeColor}
        onClose={() => setSelectedItem(null)}
        onAdd={addToCart}
      />

      <CheckoutModal
        isOpen={showCheckout}
        cart={cart}
        restaurantSlug={restaurantSlug || ""}
        tableToken={tableToken || ""}
        tableNumber={table.table_number}
        onClose={() => setShowCheckout(false)}
        onSuccess={() => {
          setCart([]);
        }}
      />

      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3">
          <button
            type="button"
            onClick={() => setShowCart(true)}
            style={{ backgroundColor: themeColor }}
            className="max-w-screen-lg mx-auto w-full px-4 py-4 flex items-center justify-between text-white rounded-2xl shadow-[0_-8px_30px_rgba(38,27,20,0.2)]"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/95 text-[#261b14] font-bold text-sm w-9 h-9 rounded-xl flex items-center justify-center">
                {cartCount}
              </div>
              <div className="text-left">
                <p className="text-xs text-white/80">Cart subtotal</p>
                <span className="font-bold text-base">
                  {formatCurrency(cartSubtotal)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 font-semibold text-sm">
              <ShoppingCart className="w-4 h-4" />
              <span>Review Order</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

interface CartModalProps {
  isOpen: boolean;
  cart: CartItem[];
  subtotal: number;
  onClose: () => void;
  onUpdateQuantity: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onCheckout: () => void;
}

const CartModal: React.FC<CartModalProps> = ({
  isOpen,
  cart,
  subtotal,
  onClose,
  onUpdateQuantity,
  onRemove,
  onCheckout,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Your Cart" size="lg">
    <div className="space-y-6">
      {cart.length === 0 ? (
        <div className="text-center py-8">
          <ShoppingCart className="w-16 h-16 text-text-secondary mx-auto mb-4 opacity-50" />
          <p className="text-text-secondary">Your cart is empty</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {cart.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="flex items-start gap-3 p-3 bg-bg-subtle rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-text">{item.name}</h4>
                  {item.selectedSize && (
                    <p className="text-sm text-text-secondary">
                      Size: {item.selectedSize.name}
                    </p>
                  )}
                  {item.selectedAddons.length > 0 && (
                    <p className="text-sm text-text-secondary">
                      Add-ons:{" "}
                      {item.selectedAddons.map((addon) => addon.name).join(", ")}
                    </p>
                  )}
                  {item.specialInstructions && (
                    <p className="text-sm text-text-secondary">
                      Request: {item.specialInstructions}
                    </p>
                  )}
                  <p className="text-accent font-semibold mt-1">
                    {formatCurrency(item.itemTotal)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(index, -1)}
                    className="p-1 rounded-full bg-border"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-7 text-center font-semibold">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateQuantity(index, 1)}
                    className="p-1 rounded-full bg-border"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="p-1 text-error rounded"
                  aria-label={`Remove ${item.name}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs text-text-secondary mb-3">
              Prices shown are excluding GST. CGST/SGST may be added in final
              bill.
            </p>
            <div className="flex justify-between text-xl font-bold text-text mb-4">
              <span>Estimated subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <Button onClick={onCheckout} fullWidth size="lg">
              Place Order
            </Button>
          </div>
        </>
      )}
    </div>
  </Modal>
);

interface ItemCustomizationModalProps {
  isOpen: boolean;
  item: MenuItem | null;
  themeColor: string;
  onClose: () => void;
  onAdd: (
    item: MenuItem,
    selectedSize?: { name: string; price: number },
    selectedAddons?: { name: string; price: number }[],
    quantity?: number,
    specialInstructions?: string
  ) => void;
}

const ItemCustomizationModal: React.FC<ItemCustomizationModalProps> = ({
  isOpen,
  item,
  themeColor,
  onClose,
  onAdd,
}) => {
  const [selectedSize, setSelectedSize] = useState<
    { name: string; price: number } | undefined
  >(item?.sizes?.[0]);
  const [selectedAddons, setSelectedAddons] = useState<
    { name: string; price: number }[]
  >([]);
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState("");

  if (!item) return null;

  const toggleAddon = (addon: { name: string; price: number }) => {
    setSelectedAddons((currentAddons) =>
      currentAddons.some((currentAddon) => currentAddon.name === addon.name)
        ? currentAddons.filter((currentAddon) => currentAddon.name !== addon.name)
        : [...currentAddons, addon]
    );
  };

  const total =
    (selectedSize ? selectedSize.price : item.base_price) +
    selectedAddons.reduce((sum, addon) => sum + addon.price, 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dish details" size="md">
      <div className="space-y-3 sm:space-y-5">
        <LazyImage
          src={item.image_url}
          alt={item.name}
          className="w-full h-40 rounded-lg sm:h-56"
        />

        <div>
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-xl font-bold text-text">{item.name}</h3>
            <span className="text-lg font-bold text-emerald-800">
              {formatCurrency(total)}
            </span>
          </div>
          {item.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary sm:mt-2">
              {item.description}
            </p>
          )}
        </div>

        <div
          className={`rounded-lg border px-3 py-2 text-sm font-semibold sm:py-3 ${getFoodTypeClassName(
            item.food_type
          )}`}
        >
          {getFoodTypeLabel(item.food_type)}
          {item.tag_label ? ` · ${item.tag_label}` : ""}
        </div>

        {item.sizes && item.sizes.length > 0 && (
          <div>
            <h4 className="mb-2 font-semibold text-text sm:mb-3">Choose size</h4>
            <div className="flex flex-wrap gap-2">
              {item.sizes.map((size) => (
                <button
                  key={size.name}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  style={
                    selectedSize?.name === size.name
                      ? { backgroundColor: themeColor, borderColor: themeColor }
                      : undefined
                  }
                  className={`px-4 py-2 rounded-full border text-sm font-semibold ${
                    selectedSize?.name === size.name
                      ? "text-white"
                      : "border-border bg-white text-text"
                  }`}
                >
                  {size.name} · {formatCurrency(size.price)}
                </button>
              ))}
            </div>
          </div>
        )}

        {item.addons && item.addons.length > 0 && (
          <div>
            <h4 className="mb-2 font-semibold text-text sm:mb-3">Add extras</h4>
            <div className="space-y-2">
              {item.addons.map((addon) => (
                <button
                  key={addon.name}
                  type="button"
                  onClick={() => toggleAddon(addon)}
                  className={`w-full flex items-center justify-between rounded-lg border-2 p-2.5 sm:p-3 ${
                    selectedAddons.some(
                      (selectedAddon) => selectedAddon.name === addon.name
                    )
                      ? "border-accent bg-accent/5"
                      : "border-border"
                  }`}
                >
                  <span className="font-medium text-text">{addon.name}</span>
                  <span className="text-accent font-semibold">
                    +{formatCurrency(addon.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor="dish-special-request"
            className="mb-1.5 block font-semibold text-text sm:mb-2"
          >
            Special request
          </label>
          <textarea
            id="dish-special-request"
            value={specialInstructions}
            onChange={(event) => setSpecialInstructions(event.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Example: no onions"
            className="input-field resize-none"
          />
        </div>

        <div className="flex gap-3 border-t border-border pt-3 sm:pt-4">
          <div className="flex h-11 items-center rounded-lg border border-border bg-white sm:h-12">
            <button
              type="button"
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              className="flex h-11 w-10 items-center justify-center sm:h-12 sm:w-11"
              aria-label="Decrease quantity"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center font-bold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((current) => Math.min(20, current + 1))}
              className="flex h-11 w-10 items-center justify-center sm:h-12 sm:w-11"
              aria-label="Increase quantity"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              onAdd(
                item,
                selectedSize,
                selectedAddons,
                quantity,
                specialInstructions
              )
            }
            style={{ backgroundColor: themeColor }}
            className="min-w-0 flex-1 rounded-lg px-4 text-sm font-bold text-white"
          >
            Add to cart · {formatCurrency(total * quantity)}
          </button>
        </div>
      </div>
    </Modal>
  );
};

interface CheckoutModalProps {
  isOpen: boolean;
  cart: CartItem[];
  restaurantSlug: string;
  tableToken: string;
  tableNumber: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  cart,
  restaurantSlug,
  tableToken,
  tableNumber,
  onClose,
  onSuccess,
}) => {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const estimatedSubtotal = cart.reduce(
    (sum, item) => sum + item.itemTotal * item.quantity,
    0
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (cart.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    if (customerPhone.trim() && !isValidPhone(customerPhone)) {
      setError("Please enter a valid 10-digit phone number or leave it blank.");
      return;
    }

    const nameError = validateTextLength(
      customerName,
      "Customer name",
      0,
      100,
      false
    );
    const notesError = validateTextLength(notes, "Customer notes", 0, 300, false);
    if (nameError || notesError) {
      setError(nameError || notesError);
      return;
    }

    setLoading(true);
    const { error: orderError } = await createCustomerOrder({
      restaurant_slug: restaurantSlug,
      table_token: tableToken,
      customer_name: cleanText(customerName, 100) || undefined,
      customer_phone: customerPhone.trim() || undefined,
      customer_notes: cleanText(notes, 300) || undefined,
      items: cart.map((item) => ({
        menu_item_id: item.id,
        quantity: item.quantity,
        selected_size_name: item.selectedSize?.name,
        selected_addon_names: item.selectedAddons.map((addon) => addon.name),
        special_instructions: item.specialInstructions,
      })),
    });
    setLoading(false);

    if (orderError) {
      setError(
        getSafeErrorMessage(
          orderError,
          "Unable to place order. Please call the waiter."
        )
      );
      return;
    }

    setSuccess(true);
    onSuccess();
  };

  const closeModal = () => {
    onClose();
    if (success) {
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      setSuccess(false);
    }
    setError("");
  };

  if (success) {
    return (
      <Modal isOpen={isOpen} onClose={closeModal} title="Order Placed" size="md">
        <div className="text-center py-8">
          <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-text mb-2">
            Order placed successfully.
          </h3>
          <p className="text-text-secondary mb-6">
            Your order has been sent to the counter.
          </p>
          <Button onClick={closeModal} fullWidth>
            Add More Items
          </Button>
          <div className="mt-3">
          <Button onClick={closeModal} fullWidth>
            Close
          </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Place Order" size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <Alert type="error" message={error} />}

        <div className="rounded-lg bg-bg-subtle p-4">
          <p className="text-sm text-text-secondary">Dine in table</p>
          <p className="text-2xl font-bold text-text">Table {tableNumber}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Your Name (Optional)"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Name"
          />
          <Input
            label="Phone Number (Optional)"
            type="tel"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            placeholder="10-digit mobile number"
          />
        </div>

        <div>
          <label className="label mb-2">Notes (Optional)</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Any special requests for the counter..."
            rows={3}
            className="input-field"
          />
        </div>

        <div className="bg-bg-subtle rounded-lg p-4 space-y-2">
          <h4 className="font-semibold text-text mb-3">Order Summary</h4>
          {cart.map((item, index) => (
            <div key={`${item.id}-${index}`} className="flex justify-between gap-3 text-sm">
              <span className="text-text-secondary">
                {item.quantity}x {item.name}
                {item.selectedSize && ` (${item.selectedSize.name})`}
              </span>
              <span className="text-text">
                {formatCurrency(item.itemTotal * item.quantity)}
              </span>
            </div>
          ))}
          <div className="flex justify-between text-lg font-bold text-text pt-3 border-t border-border">
            <span>Estimated subtotal</span>
            <span>{formatCurrency(estimatedSubtotal)}</span>
          </div>
          <p className="text-xs text-text-secondary">
            Prices shown are excluding GST. CGST/SGST may be added in final
            bill.
          </p>
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={closeModal} fullWidth>
            Back
          </Button>
          <Button type="submit" loading={loading} fullWidth>
            Send Order
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CustomerMenu;
