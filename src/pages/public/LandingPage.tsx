import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  ChefHat,
  Check,
  CreditCard,
  History,
  Image,
  LayoutDashboard,
  Menu as MenuIcon,
  Palette,
  Printer,
  QrCode,
  ReceiptText,
  Salad,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  Trophy,
  UtensilsCrossed,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { APP_CONFIG } from "../../config/config";

const navLinks = [
  { label: "Home", href: "#top" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];

const steps = [
  {
    icon: LayoutDashboard,
    number: "01",
    title: "Create your menu and tables",
    description: "Add dishes, prices, photos, tax settings, and dining tables.",
  },
  {
    icon: QrCode,
    number: "02",
    title: "Generate table QR codes",
    description: "Each active table gets its own secure ordering link and QR code.",
  },
  {
    icon: ScanLine,
    number: "03",
    title: "Customers scan and order",
    description: "Guests browse, customize dishes, and order without an app download.",
  },
  {
    icon: ChefHat,
    number: "04",
    title: "Prepare, serve, and track",
    description: "The counter receives orders, prints KOTs, bills tables, and tracks sales.",
  },
];

const features = [
  { icon: QrCode, title: "Table-wise QR ordering", description: "A secure ordering link for every dining table." },
  { icon: Wifi, title: "Live counter orders", description: "New orders arrive at the counter in real time." },
  { icon: Printer, title: "KOT print", description: "Print kitchen order tickets directly from live orders." },
  { icon: ReceiptText, title: "GST bill summary", description: "Create table bills with configurable CGST and SGST." },
  { icon: Image, title: "Menu image upload", description: "Show customers clear dish and restaurant images." },
  { icon: Salad, title: "Food preference filters", description: "Veg, Non-Veg, Egg, and Jain menu filtering." },
  { icon: BadgeCheck, title: "Menu highlights", description: "Mark best sellers, recommendations, and dish tags." },
  { icon: BarChart3, title: "Daily sales analytics", description: "Review orders, revenue before GST, and performance." },
  { icon: Trophy, title: "Top selling items", description: "See the dishes leading sales across report periods." },
  { icon: History, title: "Table order history", description: "Review table-wise orders and bill activity." },
  { icon: Palette, title: "Restaurant branding", description: "Customize the customer menu with your own identity." },
  { icon: CreditCard, title: "Monthly billing", description: "Manage the Restaurant Plan through Stripe Checkout." },
];

const trustPoints = [
  { icon: Smartphone, text: "No customer app download" },
  { icon: Zap, text: "Faster table ordering" },
  { icon: UtensilsCrossed, text: "Less waiter dependency" },
  { icon: ReceiptText, text: "Clear table-wise billing" },
  { icon: ShieldCheck, text: "Restaurant data stays scoped" },
  { icon: CreditCard, text: "No expensive hardware" },
];

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
}

const SectionHeading: React.FC<SectionHeadingProps> = ({
  eyebrow,
  title,
  description,
  align = "center",
}) => (
  <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
    <p className="mb-3 text-sm font-bold uppercase text-[#9a6a1f]">{eyebrow}</p>
    <h2 className="text-3xl font-bold leading-tight text-[#1d1b18] sm:text-4xl">
      {title}
    </h2>
    <p className="mt-4 text-base leading-7 text-[#69645d] sm:text-lg">{description}</p>
  </div>
);

const HeroProductPreview: React.FC = () => (
  <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 sm:pb-5 lg:mx-0 lg:overflow-visible lg:px-0">
    <div className="grid min-w-0 auto-cols-[78%] grid-flow-col gap-3 snap-x snap-mandatory lg:grid-flow-row lg:grid-cols-4 lg:auto-cols-auto lg:gap-4">
      <div className="min-h-[168px] snap-start rounded-[8px] border border-white/15 bg-[#fbfaf7] p-4 text-[#1d1b18] shadow-2xl sm:min-h-[188px] lg:-translate-y-2">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#9a6a1f]">Customer menu</p>
            <p className="font-bold">Saffron Table</p>
          </div>
          <span className="rounded-full bg-[#e4f1e9] px-2 py-1 text-xs font-semibold text-[#1f6b4a]">Table 08</span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 border-b border-[#e6e0d7] pb-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[6px] bg-[#efc777] text-sm font-bold">PB</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Paneer Bowl</p>
              <p className="text-xs text-[#756f66]">Veg · Best seller</p>
            </div>
            <span className="text-sm font-bold text-[#1f6b4a]">{APP_CONFIG.defaultCurrency}289</span>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>Medium spice</span>
            <span className="rounded-[6px] bg-[#1f6b4a] px-3 py-1.5 text-white">Add</span>
          </div>
        </div>
      </div>

      <div className="min-h-[168px] snap-start rounded-[8px] border border-white/15 bg-white p-4 text-[#1d1b18] shadow-2xl sm:min-h-[188px] lg:translate-y-3">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#d35d43]" />
            <p className="font-bold">New live order</p>
          </div>
          <span className="text-xs text-[#756f66]">2 min</span>
        </div>
        <div className="flex items-end justify-between border-b border-[#e6e0d7] pb-4">
          <div>
            <p className="text-xs text-[#756f66]">TABLE</p>
            <p className="mt-1 text-2xl font-bold">12</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#756f66]">ORDER</p>
            <p className="mt-1 font-bold">#A104</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-semibold">3 items</span>
          <span className="rounded-[6px] bg-[#1d1b18] px-3 py-2 text-xs font-bold text-white">Accept order</span>
        </div>
      </div>

      <div className="min-h-[168px] snap-start rounded-[8px] border border-white/15 bg-[#f3ede3] p-4 text-[#1d1b18] shadow-2xl sm:min-h-[188px] lg:-translate-y-1">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#9a6a1f]">Sales before GST</p>
            <p className="mt-1 text-2xl font-bold">{APP_CONFIG.defaultCurrency}18,420</p>
          </div>
          <BarChart3 className="h-6 w-6 text-[#1f6b4a]" aria-hidden="true" />
        </div>
        <div className="mt-6 flex h-16 items-end gap-2" aria-hidden="true">
          {[35, 54, 42, 72, 63, 88, 76].map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-t-[3px] bg-[#d39b38]"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-[#756f66]">
          <span>Last 7 days</span>
          <span className="font-bold text-[#1f6b4a]">42 orders today</span>
        </div>
      </div>

      <div className="min-h-[168px] snap-start rounded-[8px] border border-white/15 bg-[#fff7e6] p-4 text-[#1d1b18] shadow-2xl sm:min-h-[188px] lg:translate-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-[#9a6a1f]">Table ordering</p>
            <p className="font-bold">Scan. Choose. Order.</p>
          </div>
          <QrCode className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="mx-auto my-4 flex h-20 w-20 items-center justify-center rounded-[6px] bg-white shadow-sm">
          <QrCode className="h-16 w-16 text-[#1d1b18]" aria-label="Table QR code preview" />
        </div>
        <div className="flex items-center justify-between text-xs font-semibold">
          <span>Table 06</span>
          <span className="text-[#9a6a1f]">No app needed</span>
        </div>
      </div>
    </div>
  </div>
);

const CustomerPreview: React.FC = () => (
  <div className="mx-auto w-full max-w-[350px] rounded-[28px] border-[7px] border-[#1d1b18] bg-[#fbfaf7] p-3 shadow-2xl">
    <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-[#1d1b18]" />
    <div className="rounded-[8px] bg-[#f2c96f] p-4">
      <p className="text-xs font-semibold text-[#65440e]">TABLE 04</p>
      <h3 className="mt-1 text-xl font-bold text-[#1d1b18]">The Curry Room</h3>
      <p className="mt-1 text-xs text-[#65440e]">Fresh food, made for your table.</p>
    </div>
    <div className="mt-3 flex items-center gap-2 rounded-[8px] border border-[#ddd5ca] bg-white px-3 py-2 text-xs text-[#817a70]">
      <ScanLine className="h-4 w-4" aria-hidden="true" />
      Search dishes
    </div>
    <div className="mt-3 flex gap-2 overflow-hidden text-xs font-semibold">
      <span className="rounded-full bg-[#1d1b18] px-3 py-1.5 text-white">All</span>
      <span className="rounded-full border border-[#ddd5ca] px-3 py-1.5">Veg</span>
      <span className="rounded-full border border-[#ddd5ca] px-3 py-1.5">Non-Veg</span>
    </div>
    <div className="mt-3 space-y-2">
      {[
        { name: "Smoky Paneer Bowl", detail: "Veg · Contains dairy", price: "289", color: "bg-[#e8a151]" },
        { name: "Tandoori Chicken", detail: "Non-Veg · Best seller", price: "349", color: "bg-[#b95f43]" },
      ].map((item) => (
        <div key={item.name} className="flex items-center gap-3 border-b border-[#e5ded3] py-2.5 last:border-0">
          <div className={`flex h-14 w-14 items-center justify-center rounded-[6px] ${item.color} text-xs font-bold text-white`}>
            {item.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[#1d1b18]">{item.name}</p>
            <p className="mt-1 truncate text-xs text-[#756f66]">{item.detail}</p>
            <p className="mt-1 text-sm font-bold text-[#1f6b4a]">{APP_CONFIG.defaultCurrency}{item.price}</p>
          </div>
          <button type="button" className="rounded-[6px] border border-[#1f6b4a] px-3 py-1.5 text-xs font-bold text-[#1f6b4a]">
            ADD
          </button>
        </div>
      ))}
    </div>
    <p className="mt-3 text-center text-[11px] text-[#817a70]">Prices shown exclude GST. Tax may be added to the final bill.</p>
  </div>
);

const DashboardPreview: React.FC = () => (
  <div className="overflow-hidden rounded-[8px] border border-[#ddd6cc] bg-white shadow-xl">
    <div className="flex items-center justify-between border-b border-[#e6e0d7] px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5" aria-hidden="true" />
        <span className="font-bold">The Curry Room</span>
      </div>
      <span className="flex items-center gap-2 text-xs font-semibold text-[#1f6b4a]">
        <span className="h-2 w-2 rounded-full bg-[#2a9d67]" /> Live
      </span>
    </div>
    <div className="grid min-h-[420px] md:grid-cols-[190px_1fr]">
      <aside className="hidden border-r border-[#e6e0d7] bg-[#f7f4ee] p-4 md:block">
        {[
          [ShoppingBag, "Live Orders"],
          [UtensilsCrossed, "Menu"],
          [QrCode, "Tables & QR"],
          [BarChart3, "Reports"],
        ].map(([Icon, label], index) => {
          const NavIcon = Icon as React.ElementType;
          return (
            <div key={label as string} className={`mb-2 flex items-center gap-2 rounded-[6px] px-3 py-2.5 text-sm font-semibold ${index === 0 ? "bg-[#1d1b18] text-white" : "text-[#665f56]"}`}>
              <NavIcon className="h-4 w-4" aria-hidden="true" />
              {label as string}
            </div>
          );
        })}
      </aside>
      <div className="p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-3 border-b border-[#e6e0d7] pb-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#9a6a1f]">Counter workspace</p>
            <h3 className="mt-1 text-2xl font-bold">Live Orders</h3>
          </div>
          <div className="flex gap-2 text-xs font-bold">
            <span className="rounded-[6px] bg-[#1d1b18] px-3 py-2 text-white">New 2</span>
            <span className="rounded-[6px] border border-[#ddd6cc] px-3 py-2">Preparing 3</span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {[
            { table: "Table 04", order: "#A104", time: "2 min ago", items: ["2 × Paneer Tikka", "1 × Masala Soda"], tone: "border-[#d35d43]" },
            { table: "Table 09", order: "#A103", time: "6 min ago", items: ["1 × Chicken Biryani", "2 × Butter Naan"], tone: "border-[#d39b38]" },
          ].map((order) => (
            <article key={order.order} className={`rounded-[8px] border border-l-4 ${order.tone} bg-white p-4 shadow-sm`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold">{order.table}</p>
                  <p className="text-xs text-[#756f66]">{order.order} · {order.time}</p>
                </div>
                <span className="rounded-full bg-[#fff0ec] px-2 py-1 text-xs font-bold text-[#a84632]">NEW</span>
              </div>
              <div className="my-4 space-y-2 border-y border-[#eee8df] py-3 text-sm">
                {order.items.map((item) => <p key={item}>{item}</p>)}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="flex items-center justify-center gap-2 rounded-[6px] border border-[#1d1b18] px-3 py-2 text-xs font-bold">
                  <Printer className="h-3.5 w-3.5" aria-hidden="true" /> KOT
                </button>
                <button type="button" className="rounded-[6px] bg-[#1d1b18] px-3 py-2 text-xs font-bold text-white">Accept</button>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {["KOT Print", "Table-wise Bill", "Menu Management"].map((label) => (
            <div key={label} className="rounded-[6px] bg-[#f7f4ee] px-3 py-2 text-center text-xs font-semibold text-[#5f584f]">{label}</div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const AnalyticsPreview: React.FC = () => (
  <div className="mt-10">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: "Today's Orders", value: "42", note: "8 currently open", color: "text-[#365b8c]" },
        { label: "Revenue Before GST", value: `${APP_CONFIG.defaultCurrency}18,420`, note: "Today", color: "text-[#1f6b4a]" },
        { label: "Top Selling Item", value: "Paneer Bowl", note: "18 sold", color: "text-[#9a6a1f]" },
        { label: "Most Active Table", value: "Table 08", note: "7 orders", color: "text-[#a84632]" },
      ].map((metric) => (
        <div key={metric.label} className="rounded-[8px] border border-[#ddd6cc] bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-semibold text-[#756f66]">{metric.label}</p>
          <p className={`mt-2 text-xl font-bold sm:text-2xl ${metric.color}`}>{metric.value}</p>
          <p className="mt-1 text-xs text-[#8c857b]">{metric.note}</p>
        </div>
      ))}
    </div>
    <div className="mt-3 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
      <div className="rounded-[8px] border border-[#ddd6cc] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold">Order trend</p>
            <p className="text-xs text-[#756f66]">Last 7 days</p>
          </div>
          <span className="rounded-[6px] bg-[#edf4f0] px-2 py-1 text-xs font-bold text-[#1f6b4a]">7 / 30 days</span>
        </div>
        <div className="mt-6 flex h-32 items-end gap-3" aria-hidden="true">
          {[42, 64, 53, 78, 70, 92, 82].map((height, index) => (
            <div key={index} className="flex flex-1 flex-col items-center gap-2">
              <span className="w-full max-w-10 rounded-t-[4px] bg-[#365b8c]" style={{ height: `${height}%` }} />
              <span className="text-[10px] text-[#8c857b]">{["M", "T", "W", "T", "F", "S", "S"][index]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[8px] border border-[#ddd6cc] bg-[#1d1b18] p-5 text-white shadow-sm">
        <p className="text-sm font-bold">Operational snapshot</p>
        <div className="mt-5 space-y-4">
          {["Live order acceptance", "KOTs printed", "Tables billed"].map((label, index) => (
            <div key={label}>
              <div className="mb-1.5 flex justify-between text-xs">
                <span className="text-white/70">{label}</span>
                <span className="font-bold">{[92, 78, 86][index]}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#f1c66b]" style={{ width: `${[92, 78, 86][index]}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const LandingPage: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <div id="top" className="min-h-screen bg-[#fbfaf7] text-[#1d1b18]">
      <header className="sticky top-0 z-40 border-b border-[#e3ddd4] bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label={`${APP_CONFIG.appName} home`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#1d1b18] text-white">
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold">{APP_CONFIG.appName}</span>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex" aria-label="Main navigation">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm font-semibold text-[#655f57] transition-colors hover:text-[#1d1b18]">
                {link.label}
              </a>
            ))}
            <Link to="/login" className="text-sm font-semibold text-[#655f57] transition-colors hover:text-[#1d1b18]">Login</Link>
            <Link to="/register" className="text-sm font-semibold text-[#655f57] transition-colors hover:text-[#1d1b18]">Register restaurant</Link>
            <Link to="/register" className="rounded-[8px] bg-[#1d1b18] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#35312b]">
              Start Free Demo
            </Link>
          </nav>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#d8d1c7] text-[#1d1b18] lg:hidden"
            aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileMenuOpen}
            title={mobileMenuOpen ? "Close navigation" : "Open navigation"}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav className="border-t border-[#e3ddd4] bg-[#fbfaf7] px-4 py-4 lg:hidden" aria-label="Mobile navigation">
            <div className="mx-auto grid max-w-7xl gap-1">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)} className="rounded-[6px] px-3 py-2.5 text-sm font-semibold hover:bg-[#f0ebe3]">
                  {link.label}
                </a>
              ))}
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="rounded-[6px] px-3 py-2.5 text-sm font-semibold hover:bg-[#f0ebe3]">Restaurant Login</Link>
              <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="mt-2 rounded-[8px] bg-[#1d1b18] px-4 py-3 text-center text-sm font-bold text-white">Register Restaurant</Link>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="overflow-hidden bg-[#171512] text-white">
          <div className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 sm:pb-10 sm:pt-16 lg:px-8 lg:pt-20">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[#f1d49a]">
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                Built for Indian restaurant operations
              </div>
              <h1 className="mt-4 text-[38px] font-bold leading-[1.05] text-white sm:mt-5 sm:text-5xl sm:leading-[1.06] lg:text-6xl">
                QR Ordering System for Modern Restaurants
              </h1>
              <p className="mx-auto mt-4 max-w-3xl text-base leading-6 text-white/70 sm:mt-5 sm:text-lg sm:leading-7">
                Let customers scan, order from their table, and send orders directly to your counter with KOT print, billing, analytics, and menu management.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:mt-7 sm:flex-row">
                <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[#f1c66b] px-6 py-3 font-bold text-[#1d1b18] transition-colors hover:bg-[#f6d68d] sm:py-3.5">
                  Register Your Restaurant <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link to="/login" className="inline-flex items-center justify-center rounded-[8px] border border-white/30 px-6 py-3 font-bold text-white transition-colors hover:bg-white/10 sm:py-3.5">
                  Restaurant Login
                </Link>
              </div>
              <div className="mt-5 hidden flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-white/60 sm:flex">
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#f1c66b]" /> No app download</span>
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#f1c66b]" /> Start with a free demo</span>
                <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#f1c66b]" /> Works on any phone</span>
              </div>
            </div>
            <div className="mt-8 sm:mt-10 lg:mt-14">
              <HeroProductPreview />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 border-b border-[#e3ddd4] bg-[#fbfaf7] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="How it works" title="From table QR to kitchen in four clear steps" description="Set up once, then give customers a faster path from deciding what to eat to sending a confirmed order." />
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => (
                <article key={step.number} className="rounded-[8px] border border-[#ddd6cc] bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f3ead9] text-[#9a6a1f]">
                      <step.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-bold text-[#b1a99d]">{step.number}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#716a61]">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f3eee6] py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <CustomerPreview />
            <div>
              <SectionHeading align="left" eyebrow="Customer experience" title="A menu guests understand immediately" description="Customers scan the table QR, search the menu, filter food preferences, open dish details, add requests, and order from the same mobile flow." />
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {[
                  "Restaurant and table identity",
                  "Veg, Non-Veg, Egg, and Jain filters",
                  "Dish details and special requests",
                  "Clear GST exclusion note",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 border-b border-[#d8d0c5] py-3 text-sm font-semibold">
                    <Check className="mt-0.5 h-4 w-4 flex-none text-[#1f6b4a]" aria-hidden="true" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#fbfaf7] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Restaurant dashboard" title="Keep the counter focused on live service" description="The first dashboard view prioritizes live orders, while billing, menu tools, tables, and reports stay one click away." />
            <div className="mt-10"><DashboardPreview /></div>
          </div>
        </section>

        <section className="border-y border-[#e3ddd4] bg-[#f3eee6] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Analytics preview" title="See what is selling and where service is busiest" description="Use today, 7-day, and 30-day views to track sales before GST, popular dishes, active tables, and order volume." />
            <AnalyticsPreview />
          </div>
        </section>

        <section id="features" className="scroll-mt-24 bg-[#fbfaf7] py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Features" title="The operational essentials, in one focused system" description="A practical toolkit for dine-in ordering, kitchen handoff, table billing, menu control, and daily reporting." />
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {features.map((feature) => (
                <article key={feature.title} className="rounded-[8px] border border-[#ddd6cc] bg-white p-5 transition-transform duration-200 hover:-translate-y-1 hover:shadow-md">
                  <feature.icon className="h-6 w-6 text-[#9a6a1f]" aria-hidden="true" />
                  <h3 className="mt-4 font-bold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#716a61]">{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 bg-[#1d1b18] py-16 text-white sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-bold uppercase text-[#f1c66b]">Pricing</p>
              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Start free. Upgrade when the restaurant is ready.</h2>
              <p className="mt-4 text-base leading-7 text-white/65 sm:text-lg">Two plans only, with a clear path from testing the workflow to running daily service.</p>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
              {Object.entries(APP_CONFIG.plans).map(([key, plan]) => {
                const paid = key === "restaurant_plan";
                return (
                  <article key={key} className={`rounded-[8px] border p-6 sm:p-8 ${paid ? "border-[#f1c66b] bg-[#292621]" : "border-white/15 bg-white/5"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-bold">{plan.name}</p>
                        <p className="mt-1 text-sm text-white/55">{plan.duration}</p>
                      </div>
                      {paid && <span className="rounded-full bg-[#f1c66b] px-3 py-1 text-xs font-bold text-[#1d1b18]">For daily service</span>}
                    </div>
                    <div className="mt-6 flex items-end gap-1">
                      <span className="text-4xl font-bold">{APP_CONFIG.defaultCurrency}{plan.price.toLocaleString("en-IN")}</span>
                      {paid && <span className="pb-1 text-sm text-white/55">/month</span>}
                    </div>
                    <ul className="mt-6 space-y-3">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 text-sm text-white/75">
                          <Check className="mt-0.5 h-4 w-4 flex-none text-[#f1c66b]" aria-hidden="true" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Link to="/register" className={`mt-7 inline-flex w-full items-center justify-center rounded-[8px] px-5 py-3 font-bold transition-colors ${paid ? "bg-[#f1c66b] text-[#1d1b18] hover:bg-[#f6d68d]" : "border border-white/25 text-white hover:bg-white/10"}`}>
                      {paid ? "Register for Restaurant Plan" : "Start Free Demo"}
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#fbfaf7] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Why restaurants use it" title="Less friction at the table and the counter" description="A browser-based workflow that works with the phones and printers restaurants already use." />
            <div className="mt-10 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {trustPoints.map((point) => (
                <div key={point.text} className="flex items-center gap-3 border-b border-[#e3ddd4] py-4">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[8px] bg-[#edf4f0] text-[#1f6b4a]">
                    <point.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="font-semibold">{point.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#dca748] py-14 sm:py-16">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-7 px-4 text-center sm:px-6 lg:flex-row lg:text-left">
            <div>
              <p className="text-sm font-bold uppercase text-[#57400f]">Ready when you are</p>
              <h2 className="mt-2 text-3xl font-bold text-[#1d1b18] sm:text-4xl">Ready to digitize your restaurant ordering?</h2>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link to="/register" className="rounded-[8px] bg-[#1d1b18] px-6 py-3.5 text-center font-bold text-white hover:bg-[#35312b]">Register Restaurant</Link>
              <Link to="/login" className="rounded-[8px] border border-[#1d1b18] px-6 py-3.5 text-center font-bold text-[#1d1b18] hover:bg-white/20">Login</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#171512] py-10 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
            <div className="max-w-sm">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#f1c66b] text-[#1d1b18]">
                  <Store className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-lg font-bold">{APP_CONFIG.appName}</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/55">QR ordering, live counter operations, KOT print, table billing, and restaurant analytics.</p>
            </div>
            <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-3">
              <a href="#how-it-works" className="text-white/65 hover:text-white">How it works</a>
              <a href="#features" className="text-white/65 hover:text-white">Features</a>
              <a href="#pricing" className="text-white/65 hover:text-white">Pricing</a>
              <Link to="/register" className="text-white/65 hover:text-white">Register</Link>
              <Link to="/login" className="text-white/65 hover:text-white">Restaurant Login</Link>
              <Link to="/admin/login" className="text-white/65 hover:text-white">Admin Login</Link>
            </div>
          </div>
          <div className="mt-8 border-t border-white/10 pt-6 text-xs text-white/40">
            © {new Date().getFullYear()} {APP_CONFIG.appName}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
