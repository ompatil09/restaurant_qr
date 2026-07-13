import React, { useEffect, useState } from "react";
import {
  useNavigate,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import {
  Store as StoreIcon,
  LogOut,
  ShoppingBag,
  UtensilsCrossed,
  QrCode,
  Settings,
  BarChart3,
} from "lucide-react";
import Orders from "./Orders";
import Menu from "./Menu";
import Tables from "./Tables";
import RestaurantSettings from "./RestaurantSettings";
import Reports from "./Reports";
import { Alert, Card } from "../../components/ui";
import { supabase } from "../../config/supabase";
import { getRestaurantAccessStatus } from "../../services/subscriptionService";

const RestaurantDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [restaurant, setRestaurant] = useState<any>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
    } else {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      if (parsedUser.restaurant_id) {
        supabase
          .from("restaurants")
          .select("*")
          .eq("id", parsedUser.restaurant_id)
          .single()
          .then(({ data }) => setRestaurant(data));
      }
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  const access = getRestaurantAccessStatus(restaurant);
  const isSettingsRoute = location.pathname === "/restaurant/settings";

  const navItems = [
    { path: "/restaurant", icon: ShoppingBag, label: "Live Orders" },
    { path: "/restaurant/menu", icon: UtensilsCrossed, label: "Menu Management" },
    { path: "/restaurant/tables", icon: QrCode, label: "Tables & QR Codes" },
    { path: "/restaurant/reports", icon: BarChart3, label: "Reports" },
    { path: "/restaurant/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-bg-subtle">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-border sticky top-0 z-40">
        <div className="container-custom">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <StoreIcon className="w-8 h-8 text-accent" />
              <div>
                <h1 className="text-lg font-bold text-text">
                  {restaurant?.name || "Restaurant"}
                </h1>
                <p className="text-xs text-text-secondary">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 text-text-secondary hover:text-error transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Secondary Navigation */}
      <div className="bg-white border-b border-border">
        <div className="container-custom">
          <div className="flex space-x-1 overflow-x-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? "border-accent text-accent font-medium"
                      : "border-transparent text-text-secondary hover:text-text"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container-custom py-8">
        {access.state === "grace" && access.message && (
          <Alert type="warning" message={access.message} className="mb-6" />
        )}

        {access.state === "locked" && !isSettingsRoute ? (
          <Card className="max-w-2xl mx-auto text-center py-12">
            <h2 className="text-2xl font-bold text-text mb-3">
              Payment Required
            </h2>
            <p className="text-text-secondary mb-6">
              Your restaurant data is safe. Renew your ₹1000/month plan to
              restore orders, menu management, QR ordering, and reports.
            </p>
            <Link
              to="/restaurant/settings"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 font-semibold text-white hover:bg-accent/90"
            >
              Go to Billing
            </Link>
          </Card>
        ) : (
          <Routes>
            <Route index element={<Orders />} />
            <Route path="orders" element={<Orders />} />
            <Route path="menu" element={<Menu />} />
            <Route path="tables" element={<Tables />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<RestaurantSettings />} />
          </Routes>
        )}
      </div>
    </div>
  );
};

export default RestaurantDashboard;
