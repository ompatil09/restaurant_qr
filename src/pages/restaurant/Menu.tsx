import React, { useEffect, useState } from "react";
import { Plus, Edit, Trash2, Eye, EyeOff, Search, Package } from "lucide-react";
import {
  Card,
  Button,
  Input,
  Select,
  Badge,
  Modal,
  Loading,
  Alert,
  Textarea,
} from "../../components/ui";
import {
  subscribeToMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  uploadRestaurantImage,
  validateRestaurantImage,
} from "../../services/restaurantService";
import type { MenuItem } from "../../config/supabase";
import { supabase } from "../../config/supabase";
import { APP_CONFIG } from "../../config/config";
import PinModal from "../../components/security/PinModal";
import { formatCurrency } from "../../utils/helpers";
import {
  cleanText,
  getSafeErrorMessage,
  validatePrice,
  validateTextLength,
} from "../../utils/security";

const Menu: React.FC = () => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [adminPinHash, setAdminPinHash] = useState<string | undefined>();
  const [pendingProtectedAction, setPendingProtectedAction] = useState<
    { type: "unavailable" | "delete"; item: MenuItem } | null
  >(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user.restaurant_id) return;

    supabase
      .from("restaurants")
      .select("admin_pin_hash")
      .eq("id", user.restaurant_id)
      .single()
      .then(({ data }) => {
        setAdminPinHash(data?.admin_pin_hash || undefined);
      });

    const subscription = subscribeToMenuItems(user.restaurant_id, (data) => {
      setMenuItems(data);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const categories = [
    "all",
    ...new Set(menuItems.map((item) => item.category).filter(Boolean)),
  ];

  const filteredItems = menuItems.filter((item) => {
    const normalizedSearch = searchTerm.toLowerCase();
    const matchesSearch = [
      item.name,
      item.description || "",
      item.category || "",
      item.food_type || "",
      item.is_best_seller ? "best seller" : "",
      item.is_recommended ? "recommended" : "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
    const matchesCategory =
      categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleToggleAvailability = async (item: MenuItem) => {
    if (item.is_available && adminPinHash) {
      setPendingProtectedAction({ type: "unavailable", item });
      return;
    }

    await toggleMenuItemAvailability(item.id, !item.is_available);
  };

  const handleEdit = (item: MenuItem) => {
    setSelectedItem(item);
    setShowEditModal(true);
  };

  const handleDelete = (item: MenuItem) => {
    setSelectedItem(item);
    setShowDeleteModal(true);
  };

  const runProtectedAction = async () => {
    if (!pendingProtectedAction) return;

    if (pendingProtectedAction.type === "unavailable") {
      await toggleMenuItemAvailability(pendingProtectedAction.item.id, false);
    }

    if (pendingProtectedAction.type === "delete") {
      await deleteMenuItem(pendingProtectedAction.item.id);
      setShowDeleteModal(false);
      setSelectedItem(null);
    }

    setPendingProtectedAction(null);
  };

  if (loading) {
    return <Loading text="Loading menu..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text mb-2">Menu Management</h2>
          <p className="text-text-secondary">
            Manage your menu items and availability
          </p>
        </div>
        <Button
          icon={<Plus className="w-5 h-5" />}
          onClick={() => setShowAddModal(true)}
        >
          Add Item
        </Button>
      </div>

      {/* Real-time indicator */}
      <div className="flex items-center space-x-2 text-sm text-success">
        <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
        <span>
          Live updates • Availability changes update customers in real-time
        </span>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search menu items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={<Search className="w-5 h-5" />}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setCategoryFilter(category || "all")}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                categoryFilter === category
                  ? "bg-accent text-white"
                  : "bg-white border border-border text-text-secondary hover:bg-bg-subtle"
              }`}
            >
              {category === "all" ? "All Items" : category}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Items */}
      {filteredItems.length === 0 ? (
        <Card className="text-center py-12">
          <Package className="w-16 h-16 text-text-secondary mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold text-text mb-2">
            No Menu Items Found
          </h3>
          <p className="text-text-secondary mb-4">
            {searchTerm || categoryFilter !== "all"
              ? "Try adjusting your filters"
              : "Start by adding your first menu item"}
          </p>
          <Button
            icon={<Plus className="w-5 h-5" />}
            onClick={() => setShowAddModal(true)}
          >
            Add First Item
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              className={`hover:shadow-lg transition-shadow ${
                !item.is_available ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-col lg:flex-row gap-4">
                {/* Image */}
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full lg:w-32 h-32 object-cover rounded-lg"
                  />
                )}

                {/* Details */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="text-lg font-bold text-text">
                          {item.name}
                        </h3>
                        <Badge
                          variant={item.is_available ? "success" : "neutral"}
                        >
                          {item.is_available ? "Available" : "Unavailable"}
                        </Badge>
                      </div>
                      {item.category && (
                        <Badge variant="neutral" className="text-xs">
                          {item.category}
                        </Badge>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="neutral" className="text-xs">
                          {getFoodTypeLabel(item.food_type)}
                        </Badge>
                        {item.is_best_seller && (
                          <Badge variant="warning" className="text-xs">
                            Best Seller
                          </Badge>
                        )}
                        {item.is_recommended && (
                          <Badge variant="accent-secondary" className="text-xs">
                            Recommended
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.description && (
                    <p className="text-text-secondary text-sm">
                      {item.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div>
                      <span className="text-text-secondary">Base Price: </span>
                      <span className="text-accent font-semibold text-lg">
                        {formatCurrency(item.base_price)}
                      </span>
                    </div>

                    {item.sizes && item.sizes.length > 0 && (
                      <div>
                        <span className="text-text-secondary">Sizes: </span>
                        <span className="text-text">
                          {item.sizes.map((s) => s.name).join(", ")}
                        </span>
                      </div>
                    )}

                    {item.addons && item.addons.length > 0 && (
                      <div>
                        <span className="text-text-secondary">Add-ons: </span>
                        <span className="text-text">
                          {item.addons.length} available
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex lg:flex-col gap-2 lg:min-w-[140px]">
                  <Button
                    size="sm"
                    variant={item.is_available ? "outline" : "secondary"}
                    icon={
                      item.is_available ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )
                    }
                    onClick={() => handleToggleAvailability(item)}
                    fullWidth
                  >
                    {item.is_available ? "Mark Unavailable" : "Mark Available"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Edit className="w-4 h-4" />}
                    onClick={() => handleEdit(item)}
                    fullWidth
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Trash2 className="w-4 h-4" />}
                    onClick={() => handleDelete(item)}
                    fullWidth
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Modals */}
      <MenuItemModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        mode="add"
      />

      <MenuItemModal
        isOpen={showEditModal}
        item={selectedItem}
        onClose={() => {
          setShowEditModal(false);
          setSelectedItem(null);
        }}
        mode="edit"
      />

      {/* Delete Modal */}
      <DeleteModal
        isOpen={showDeleteModal}
        item={selectedItem}
        adminPinHash={adminPinHash}
        onProtectedDelete={(item) =>
          setPendingProtectedAction({ type: "delete", item })
        }
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedItem(null);
        }}
      />

      <PinModal
        isOpen={Boolean(pendingProtectedAction)}
        title={
          pendingProtectedAction?.type === "delete"
            ? "Confirm Delete"
            : "Confirm Mark Unavailable"
        }
        expectedHash={adminPinHash}
        onClose={() => setPendingProtectedAction(null)}
        onVerified={runProtectedAction}
      />
    </div>
  );
};

const getFoodTypeLabel = (foodType?: string) =>
  APP_CONFIG.foodTypes.find((type) => type.value === foodType)?.label || "Veg";

// Menu Item Modal (Add/Edit)
interface MenuItemModalProps {
  isOpen: boolean;
  item?: MenuItem | null;
  onClose: () => void;
  mode: "add" | "edit";
}

const MenuItemModal: React.FC<MenuItemModalProps> = ({
  isOpen,
  item,
  onClose,
  mode,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    base_price: "",
    image_url: "",
    food_type: "veg",
    is_best_seller: false,
    is_recommended: false,
    tag_label: "",
    is_available: true,
    sizes: [] as { name: string; price: number }[],
    addons: [] as { name: string; price: number }[],
  });

  const [newSize, setNewSize] = useState({ name: "", price: "" });
  const [newAddon, setNewAddon] = useState({ name: "", price: "" });
  const [imageFile, setImageFile] = useState<File | null>(null);

  const handleImageFileChange = (file?: File) => {
    setError("");
    if (!file) {
      setImageFile(null);
      return;
    }

    const validationMessage = validateRestaurantImage(file);
    if (validationMessage) {
      setImageFile(null);
      setError(validationMessage);
      return;
    }

    setImageFile(file);
  };

  useEffect(() => {
    if (mode === "edit" && item) {
      setFormData({
        name: item.name,
        description: item.description || "",
        category: item.category || "",
        base_price: item.base_price.toString(),
        image_url: item.image_url || "",
        food_type: item.food_type || "veg",
        is_best_seller: item.is_best_seller || false,
        is_recommended: item.is_recommended || false,
        tag_label: item.tag_label || "",
        is_available: item.is_available,
        sizes: item.sizes || [],
        addons: item.addons || [],
      });
    } else {
      setFormData({
        name: "",
        description: "",
        category: "",
        base_price: "",
        image_url: "",
        food_type: "veg",
        is_best_seller: false,
        is_recommended: false,
        tag_label: "",
        is_available: true,
        sizes: [],
        addons: [],
      });
    }
    setImageFile(null);
  }, [mode, item, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const nameError = validateTextLength(formData.name, "Item name", 2, 100);
    const descriptionError = validateTextLength(
      formData.description,
      "Description",
      0,
      500,
      false
    );
    const priceError = validatePrice(formData.base_price, "Base price");
    const allowedFoodTypes = ["veg", "non_veg", "egg", "jain"];

    if (nameError || descriptionError || priceError) {
      setError(nameError || descriptionError || priceError);
      return;
    }

    if (!allowedFoodTypes.includes(formData.food_type)) {
      setError("Select a valid food type.");
      return;
    }

    const optionError = [...formData.sizes, ...formData.addons].find(
      (option) =>
        validateTextLength(option.name, "Option name", 1, 50) ||
        validatePrice(option.price, "Option price")
    );
    if (optionError) {
      setError("Sizes and add-ons need a valid name and positive price.");
      return;
    }

    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user.restaurant_id) {
      setError("Restaurant ID not found");
      return;
    }

    setLoading(true);

    let imageUrl = formData.image_url || undefined;
    if (imageFile) {
      const { url, error: uploadError } = await uploadRestaurantImage(
        imageFile,
        "menu"
      );
      if (uploadError || !url) {
        setLoading(false);
        setError(
          getSafeErrorMessage(
            uploadError,
            "Image upload failed. Please try another image."
          )
        );
        return;
      }
      imageUrl = url;
    }

    const menuItemData = {
      restaurant_id: user.restaurant_id,
      name: cleanText(formData.name, 100),
      description: cleanText(formData.description, 500) || undefined,
      category: cleanText(formData.category, 80) || undefined,
      base_price: parseFloat(formData.base_price),
      image_url: imageUrl,
      food_type: formData.food_type as MenuItem["food_type"],
      is_best_seller: formData.is_best_seller,
      is_recommended: formData.is_recommended,
      tag_label: cleanText(formData.tag_label, 40) || undefined,
      is_available: formData.is_available,
      sizes: formData.sizes.length > 0 ? formData.sizes : undefined,
      addons: formData.addons.length > 0 ? formData.addons : undefined,
    };

    let success = false;
    if (mode === "add") {
      success = await createMenuItem(menuItemData);
    } else if (item) {
      success = await updateMenuItem(item.id, menuItemData);
    }

    setLoading(false);

    if (success) {
      onClose();
    } else {
      setError(`Failed to ${mode} menu item`);
    }
  };

  const addSize = () => {
    if (newSize.name && newSize.price) {
      setFormData({
        ...formData,
        sizes: [
          ...formData.sizes,
          { name: newSize.name, price: parseFloat(newSize.price) },
        ],
      });
      setNewSize({ name: "", price: "" });
    }
  };

  const removeSize = (index: number) => {
    setFormData({
      ...formData,
      sizes: formData.sizes.filter((_, i) => i !== index),
    });
  };

  const addAddon = () => {
    if (newAddon.name && newAddon.price) {
      setFormData({
        ...formData,
        addons: [
          ...formData.addons,
          { name: newAddon.name, price: parseFloat(newAddon.price) },
        ],
      });
      setNewAddon({ name: "", price: "" });
    }
  };

  const removeAddon = (index: number) => {
    setFormData({
      ...formData,
      addons: formData.addons.filter((_, i) => i !== index),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "add" ? "Add Menu Item" : "Edit Menu Item"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <Alert type="error" message={error} />}

        <Input
          label="Item Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Margherita Pizza"
          required
        />

        <Textarea
          label="Description (Optional)"
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          placeholder="Describe your item..."
          rows={2}
        />

        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Category"
            value={formData.category}
            onChange={(e) =>
              setFormData({ ...formData, category: e.target.value })
            }
            placeholder="e.g., Pizza, Burgers"
          />

          <Input
            label="Base Price"
            type="number"
            step="0.01"
            value={formData.base_price}
            onChange={(e) =>
              setFormData({ ...formData, base_price: e.target.value })
            }
            placeholder="0.00"
            required
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Select
            label="Food Type"
            value={formData.food_type}
            onChange={(e) =>
              setFormData({ ...formData, food_type: e.target.value })
            }
            options={APP_CONFIG.foodTypes}
          />

          <Input
            label="Custom Tag (Optional)"
            value={formData.tag_label}
            onChange={(e) =>
              setFormData({ ...formData, tag_label: e.target.value })
            }
            placeholder="e.g., Chef Special"
          />
        </div>

        <Input
          label="Image URL (Optional)"
          value={formData.image_url}
          onChange={(e) =>
            setFormData({ ...formData, image_url: e.target.value })
          }
          placeholder="https://example.com/image.jpg"
        />

        <div>
          <label className="label mb-2">Upload Image (Optional)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handleImageFileChange(e.target.files?.[0])}
            className="input"
          />
          <p className="mt-1 text-sm text-text-secondary">
            JPG, PNG, or WebP only. Maximum size: 3 MB.
          </p>
        </div>

        {/* Sizes */}
        <div>
          <label className="label mb-3">Sizes (Optional)</label>
          <div className="space-y-2 mb-3">
            {formData.sizes.map((size, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-bg-subtle rounded-lg"
              >
                <span className="text-text">
                  {size.name} - {formatCurrency(size.price)}
                </span>
                <button
                  type="button"
                  onClick={() => removeSize(index)}
                  className="text-error hover:bg-error/10 p-1 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Size name"
              value={newSize.name}
              onChange={(e) => setNewSize({ ...newSize, name: e.target.value })}
            />
            <Input
              placeholder="Price"
              type="number"
              step="0.01"
              value={newSize.price}
              onChange={(e) =>
                setNewSize({ ...newSize, price: e.target.value })
              }
            />
            <Button type="button" onClick={addSize} variant="outline">
              Add
            </Button>
          </div>
        </div>

        {/* Add-ons */}
        <div>
          <label className="label mb-3">Add-ons (Optional)</label>
          <div className="space-y-2 mb-3">
            {formData.addons.map((addon, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-bg-subtle rounded-lg"
              >
                <span className="text-text">
                  {addon.name} - +{formatCurrency(addon.price)}
                </span>
                <button
                  type="button"
                  onClick={() => removeAddon(index)}
                  className="text-error hover:bg-error/10 p-1 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add-on name"
              value={newAddon.name}
              onChange={(e) =>
                setNewAddon({ ...newAddon, name: e.target.value })
              }
            />
            <Input
              placeholder="Price"
              type="number"
              step="0.01"
              value={newAddon.price}
              onChange={(e) =>
                setNewAddon({ ...newAddon, price: e.target.value })
              }
            />
            <Button type="button" onClick={addAddon} variant="outline">
              Add
            </Button>
          </div>
        </div>

        {/* Availability */}
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.is_available}
            onChange={(e) =>
              setFormData({ ...formData, is_available: e.target.checked })
            }
            className="rounded border-border"
          />
          <span className="text-text">Available for ordering</span>
        </label>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_best_seller}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  is_best_seller: e.target.checked,
                })
              }
              className="rounded border-border"
            />
            <span className="text-text">Best Seller</span>
          </label>

          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_recommended}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  is_recommended: e.target.checked,
                })
              }
              className="rounded border-border"
            />
            <span className="text-text">Recommended</span>
          </label>
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button type="submit" loading={loading} fullWidth>
            {mode === "add" ? "Add Item" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// Delete Modal
interface DeleteModalProps {
  isOpen: boolean;
  item: MenuItem | null;
  adminPinHash?: string;
  onProtectedDelete: (item: MenuItem) => void;
  onClose: () => void;
}

const DeleteModal: React.FC<DeleteModalProps> = ({
  isOpen,
  item,
  adminPinHash,
  onProtectedDelete,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!item) return;

    if (adminPinHash) {
      onProtectedDelete(item);
      return;
    }

    setLoading(true);
    const success = await deleteMenuItem(item.id);
    setLoading(false);

    if (success) {
      onClose();
    }
  };

  if (!item) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Menu Item" size="md">
      <div className="space-y-4">
        <Alert
          type="warning"
          message={`Are you sure you want to delete "${item.name}"? This action cannot be undone.`}
        />

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            loading={loading}
            fullWidth
          >
            Delete Item
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default Menu;
