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

interface CartItem extends MenuItem {
  quantity: number;
  selectedSize?: { name: string; price: number };
  selectedAddons: { name: string; price: number }[];
  itemTotal: number;
}

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
          contextError?.message ||
            "This table ordering link is invalid or inactive."
        );
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
    selectedAddons: { name: string; price: number }[] = []
  ) => {
    const basePrice = selectedSize ? selectedSize.price : item.base_price;
    const addonsTotal = selectedAddons.reduce(
      (sum, addon) => sum + addon.price,
      0
    );
    const itemTotal = basePrice + addonsTotal;
    const addonKey = selectedAddons.map((addon) => addon.name).sort().join("|");

    setCart((currentCart) => {
      const existingIndex = currentCart.findIndex((cartItem) => {
        const cartAddonKey = cartItem.selectedAddons
          .map((addon) => addon.name)
          .sort()
          .join("|");
        return (
          cartItem.id === item.id &&
          cartItem.selectedSize?.name === selectedSize?.name &&
          cartAddonKey === addonKey
        );
      });

      if (existingIndex >= 0) {
        return currentCart.map((cartItem, index) =>
          index === existingIndex
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }

      return [
        ...currentCart,
        {
          ...item,
          quantity: 1,
          selectedSize,
          selectedAddons,
          itemTotal,
        },
      ];
    });

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
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-screen-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <LazyImage
              src={restaurant.logo_url}
              alt={restaurant.name}
              className="w-12 h-12 rounded-lg flex-shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-bold text-lg text-gray-900 truncate">
                {restaurant.name}
              </h1>
              <p className="text-sm text-gray-500">
                Table {table.table_number}
              </p>
            </div>
          </div>

          {restaurant.welcome_message && (
            <p className="text-sm text-gray-600 mb-3">
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
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>
      </header>

      <div className="bg-white border-b sticky top-[129px] z-30">
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
                    : "bg-gray-100 text-gray-600"
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
                    : "bg-gray-50 text-gray-600 border border-gray-200"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-screen-lg mx-auto px-4 py-4">
        <div className="mb-4 rounded-lg bg-white border border-gray-100 px-3 py-2 text-xs text-gray-600">
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
                  className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm"
                >
                  <div className="flex gap-3 p-3">
                    <LazyImage
                      src={item.image_url}
                      alt={item.name}
                      className="w-24 h-24 rounded-lg flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="min-h-[66px]">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          {item.category && (
                            <span className="text-xs font-medium text-gray-500">
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
                        <h2 className="font-semibold text-gray-900 leading-snug">
                          {item.name}
                        </h2>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.is_best_seller && (
                            <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                              Best Seller
                            </span>
                          )}
                          {item.is_recommended && (
                            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-semibold">
                              Recommended
                            </span>
                          )}
                          {item.tag_label && (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-semibold">
                              {item.tag_label}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-end justify-between gap-3 mt-3">
                        <p className="font-bold text-gray-900">
                          {item.sizes?.length
                            ? `From ${formatCurrency(
                                Math.min(...item.sizes.map((s) => s.price))
                              )}`
                            : formatCurrency(item.base_price)}
                        </p>

                        {quantity === 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              hasOptions ? setSelectedItem(item) : addToCart(item)
                            }
                            style={{ borderColor: themeColor, color: themeColor }}
                            className="px-4 py-2 border-2 font-bold text-xs rounded-md"
                          >
                            ADD
                          </button>
                        ) : (
                          <div
                            className="flex items-center text-white rounded-md"
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
        isOpen={Boolean(selectedItem)}
        item={selectedItem}
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
        <div
          className="fixed bottom-0 left-0 right-0 text-white shadow-[0_-2px_20px_rgba(0,0,0,0.15)] z-40"
          style={{ backgroundColor: themeColor }}
        >
          <button
            type="button"
            onClick={() => setShowCart(true)}
            className="max-w-screen-lg mx-auto w-full px-4 py-3.5 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white text-accent font-bold text-sm w-7 h-7 rounded flex items-center justify-center">
                {cartCount}
              </div>
              <span className="font-bold text-base">
                {formatCurrency(cartSubtotal)}
              </span>
            </div>
            <div className="flex items-center gap-2 font-semibold text-sm">
              <ShoppingCart className="w-4 h-4" />
              <span>View Cart</span>
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
  onClose: () => void;
  onAdd: (
    item: MenuItem,
    selectedSize?: { name: string; price: number },
    selectedAddons?: { name: string; price: number }[]
  ) => void;
}

const ItemCustomizationModal: React.FC<ItemCustomizationModalProps> = ({
  isOpen,
  item,
  onClose,
  onAdd,
}) => {
  const [selectedSize, setSelectedSize] = useState<
    { name: string; price: number } | undefined
  >();
  const [selectedAddons, setSelectedAddons] = useState<
    { name: string; price: number }[]
  >([]);

  useEffect(() => {
    setSelectedSize(item?.sizes?.[0]);
    setSelectedAddons([]);
  }, [item]);

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
    <Modal isOpen={isOpen} onClose={onClose} title={item.name} size="md">
      <div className="space-y-6">
        <LazyImage
          src={item.image_url}
          alt={item.name}
          className="w-full h-48 rounded-lg"
        />

        {item.description && (
          <p className="text-text-secondary">{item.description}</p>
        )}

        {item.sizes && item.sizes.length > 0 && (
          <div>
            <h4 className="font-semibold text-text mb-3">Select Size</h4>
            <div className="space-y-2">
              {item.sizes.map((size) => (
                <button
                  key={size.name}
                  type="button"
                  onClick={() => setSelectedSize(size)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border-2 ${
                    selectedSize?.name === size.name
                      ? "border-accent bg-accent/5"
                      : "border-border"
                  }`}
                >
                  <span className="font-medium text-text">{size.name}</span>
                  <span className="text-accent font-semibold">
                    {formatCurrency(size.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {item.addons && item.addons.length > 0 && (
          <div>
            <h4 className="font-semibold text-text mb-3">Add-ons</h4>
            <div className="space-y-2">
              {item.addons.map((addon) => (
                <button
                  key={addon.name}
                  type="button"
                  onClick={() => toggleAddon(addon)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border-2 ${
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

        <div className="border-t border-border pt-4">
          <div className="flex justify-between text-xl font-bold text-text mb-4">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <Button
            onClick={() => onAdd(item, selectedSize, selectedAddons)}
            fullWidth
            size="lg"
          >
            Add to Cart
          </Button>
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

    setLoading(true);
    const { error: orderError } = await createCustomerOrder({
      restaurant_slug: restaurantSlug,
      table_token: tableToken,
      customer_name: customerName.trim() || undefined,
      customer_phone: customerPhone.trim() || undefined,
      customer_notes: notes.trim() || undefined,
      items: cart.map((item) => ({
        menu_item_id: item.id,
        quantity: item.quantity,
        selected_size_name: item.selectedSize?.name,
        selected_addon_names: item.selectedAddons.map((addon) => addon.name),
      })),
    });
    setLoading(false);

    if (orderError) {
      setError(orderError.message || "Failed to place order.");
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
