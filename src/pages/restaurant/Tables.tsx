import React, { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Download,
  Edit,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Alert, Badge, Button, Card, Input, Loading, Modal } from "../../components/ui";
import type { Restaurant, RestaurantTable } from "../../config/supabase";
import { supabase } from "../../config/supabase";
import {
  createRestaurantTable,
  regenerateRestaurantTableToken,
  subscribeToTables,
  updateRestaurantTable,
  type TableActionContext,
} from "../../services/tableService";
import { copyToClipboard } from "../../utils/helpers";

const getCurrentOrigin = () => window.location.origin;

const buildQrUrl = (restaurantSlug: string, tableToken: string) =>
  `${getCurrentOrigin()}/order/${restaurantSlug}/${tableToken}`;

const Tables: React.FC = () => {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [busyTableId, setBusyTableId] = useState<string | null>(null);

  const user = useMemo(
    () => JSON.parse(localStorage.getItem("user") || "{}"),
    []
  );

  const actionContext: TableActionContext | null =
    user?.id && user?.restaurant_id
      ? { userId: user.id, restaurantId: user.restaurant_id }
      : null;

  useEffect(() => {
    if (!user?.id || !user?.restaurant_id) {
      setError("Restaurant user not found");
      setLoading(false);
      return;
    }

    const loadRestaurant = async () => {
      const { data, error: restaurantError } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", user.restaurant_id)
        .single();

      if (restaurantError || !data) {
        setError("Failed to load restaurant details");
        setLoading(false);
        return;
      }

      setRestaurant(data);
    };

    loadRestaurant();

    const tableContext = { userId: user.id, restaurantId: user.restaurant_id };
    const subscription = subscribeToTables(tableContext, user.restaurant_id, (data) => {
      setTables(data);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.restaurant_id]);

  const activeTables = tables.filter((table) => table.is_active);
  const disabledTables = tables.filter((table) => !table.is_active);

  const handleDisable = async (table: RestaurantTable) => {
    if (!actionContext) return;
    setBusyTableId(table.id);
    const { error: updateError } = await updateRestaurantTable(actionContext, table.id, {
      isActive: false,
    });
    if (updateError) setError(updateError.message);
    setBusyTableId(null);
  };

  const handleRegenerate = async (table: RestaurantTable) => {
    if (!actionContext) return;
    setBusyTableId(table.id);
    const { error: regenerateError } = await regenerateRestaurantTableToken(
      actionContext,
      table.id
    );
    if (regenerateError) setError(regenerateError.message);
    setBusyTableId(null);
  };

  const downloadQRCode = (table: RestaurantTable) => {
    if (!restaurant) return;

    const svg = document.getElementById(`table-qr-${table.id}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const image = new Image();

    image.onload = () => {
      canvas.width = image.width;
      canvas.height = image.height;
      context?.drawImage(image, 0, 0);
      const downloadLink = document.createElement("a");
      downloadLink.download = `${restaurant.slug}-table-${table.table_number}-qr.png`;
      downloadLink.href = canvas.toDataURL("image/png");
      downloadLink.click();
    };

    image.src = `data:image/svg+xml;base64,${window.btoa(svgData)}`;
  };

  const printAllQRCodes = () => {
    window.print();
  };

  if (loading) {
    return <Loading text="Loading tables..." />;
  }

  if (error && !restaurant) {
    return <Alert type="error" message={error} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text mb-2">
            Tables & QR Codes
          </h2>
          <p className="text-text-secondary">
            Create secure table QR codes for dine-in ordering.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            icon={<Printer className="w-5 h-5" />}
            onClick={printAllQRCodes}
            disabled={activeTables.length === 0}
          >
            Print All
          </Button>
          <Button
            icon={<Plus className="w-5 h-5" />}
            onClick={() => setShowAddModal(true)}
          >
            Add Table
          </Button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <p className="text-sm text-text-secondary">Active Tables</p>
          <p className="text-3xl font-bold text-text">{activeTables.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-text-secondary">Disabled Tables</p>
          <p className="text-3xl font-bold text-text">{disabledTables.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-text-secondary">QR Route</p>
          <p className="text-sm font-semibold text-text break-all">
            /order/{restaurant?.slug || "restaurant"}/tbl_token
          </p>
        </Card>
      </div>

      {activeTables.length === 0 ? (
        <Card className="text-center py-12">
          <QrCode className="w-16 h-16 text-text-secondary mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold text-text mb-2">
            No Active Tables
          </h3>
          <p className="text-text-secondary mb-4">
            Add your first table to generate a secure QR code.
          </p>
          <Button icon={<Plus className="w-5 h-5" />} onClick={() => setShowAddModal(true)}>
            Add Table
          </Button>
        </Card>
      ) : (
        <div className="print:grid print:grid-cols-2 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeTables.map((table) => (
            <TableQrCard
              key={table.id}
              table={table}
              restaurantSlug={restaurant?.slug || ""}
              busy={busyTableId === table.id}
              onCopy={() => copyToClipboard(buildQrUrl(restaurant?.slug || "", table.table_token))}
              onDownload={() => downloadQRCode(table)}
              onEdit={() => setEditingTable(table)}
              onRegenerate={() => handleRegenerate(table)}
              onDisable={() => handleDisable(table)}
            />
          ))}
        </div>
      )}

      {disabledTables.length > 0 && (
        <Card className="print:hidden">
          <h3 className="text-lg font-bold text-text mb-4">Disabled Tables</h3>
          <div className="grid gap-3">
            {disabledTables.map((table) => (
              <div
                key={table.id}
                className="flex items-center justify-between gap-3 p-3 bg-bg-subtle rounded-lg"
              >
                <div>
                  <p className="font-semibold text-text">Table {table.table_number}</p>
                  <p className="text-xs text-text-secondary break-all">
                    Old token disabled: {table.table_token}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyTableId === table.id}
                  onClick={() => {
                    if (!actionContext) return;
                    setBusyTableId(table.id);
                    updateRestaurantTable(actionContext, table.id, {
                      isActive: true,
                    }).then(({ error: updateError }) => {
                      if (updateError) setError(updateError.message);
                      setBusyTableId(null);
                    });
                  }}
                >
                  Enable
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <TableModal
        isOpen={showAddModal}
        title="Add Table"
        onClose={() => setShowAddModal(false)}
        onSubmit={async (tableNumber) => {
          if (!actionContext) return "Restaurant user not found";
          const { error: createError } = await createRestaurantTable(
            actionContext,
            tableNumber
          );
          if (createError) return createError.message;
          setShowAddModal(false);
          return null;
        }}
      />

      <TableModal
        isOpen={Boolean(editingTable)}
        title="Rename Table"
        initialValue={editingTable?.table_number || ""}
        onClose={() => setEditingTable(null)}
        onSubmit={async (tableNumber) => {
          if (!actionContext || !editingTable) return "Restaurant user not found";
          const { error: updateError } = await updateRestaurantTable(
            actionContext,
            editingTable.id,
            { tableNumber }
          );
          if (updateError) return updateError.message;
          setEditingTable(null);
          return null;
        }}
      />
    </div>
  );
};

interface TableQrCardProps {
  table: RestaurantTable;
  restaurantSlug: string;
  busy: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onDisable: () => void;
}

const TableQrCard: React.FC<TableQrCardProps> = ({
  table,
  restaurantSlug,
  busy,
  onCopy,
  onDownload,
  onEdit,
  onRegenerate,
  onDisable,
}) => {
  const qrUrl = buildQrUrl(restaurantSlug, table.table_token);

  return (
    <Card className="break-inside-avoid">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-text">
              Table {table.table_number}
            </h3>
            <Badge variant="success">Active</Badge>
          </div>
          <p className="text-xs text-text-secondary break-all mt-1">{table.table_token}</p>
        </div>
        <button
          className="print:hidden p-2 rounded-lg hover:bg-bg-subtle text-text-secondary"
          onClick={onEdit}
          aria-label={`Rename table ${table.table_number}`}
        >
          <Edit className="w-5 h-5" />
        </button>
      </div>

      <div className="flex justify-center mb-4">
        <div className="bg-white p-4 rounded-lg border border-border">
          <QRCodeSVG
            id={`table-qr-${table.id}`}
            value={qrUrl}
            size={180}
            level="H"
            includeMargin
          />
        </div>
      </div>

      <div className="p-3 bg-bg-subtle rounded-lg text-xs text-text-secondary break-all mb-4">
        {qrUrl}
      </div>

      <div className="print:hidden grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" icon={<Download className="w-4 h-4" />} onClick={onDownload}>
          Download
        </Button>
        <Button variant="outline" size="sm" icon={<Copy className="w-4 h-4" />} onClick={onCopy}>
          Copy URL
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="w-4 h-4" />}
          onClick={onRegenerate}
          disabled={busy}
        >
          Regenerate
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="w-4 h-4" />}
          onClick={onDisable}
          disabled={busy}
        >
          Disable
        </Button>
      </div>
    </Card>
  );
};

interface TableModalProps {
  isOpen: boolean;
  title: string;
  initialValue?: string;
  onClose: () => void;
  onSubmit: (tableNumber: string) => Promise<string | null>;
}

const TableModal: React.FC<TableModalProps> = ({
  isOpen,
  title,
  initialValue = "",
  onClose,
  onSubmit,
}) => {
  const [tableNumber, setTableNumber] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTableNumber(initialValue);
    setError("");
  }, [initialValue, isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTableNumber = tableNumber.trim();

    if (!trimmedTableNumber) {
      setError("Table number or name is required");
      return;
    }

    setSubmitting(true);
    const submitError = await onSubmit(trimmedTableNumber);
    setSubmitting(false);

    if (submitError) {
      setError(submitError);
      return;
    }

    setTableNumber("");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <Input
          label="Table Number / Name"
          value={tableNumber}
          onChange={(event) => setTableNumber(event.target.value)}
          placeholder="e.g., 07, A1, Family Room"
          required
        />
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} fullWidth>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} fullWidth>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default Tables;
