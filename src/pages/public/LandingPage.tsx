import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Check,
  Printer,
  QrCode,
  Salad,
  ShoppingBag,
  Store,
} from "lucide-react";
import { PublicFooter, PublicHeader } from "../../components/PublicShell";
import { APP_CONFIG } from "../../config/config";

const capabilities = [
  { icon: QrCode, title: "Table QR ordering", copy: "One secure ordering link for each active table." },
  { icon: ShoppingBag, title: "Live counter queue", copy: "Accept, prepare, and serve orders from one screen." },
  { icon: Printer, title: "KOT and table bills", copy: "Print kitchen tickets and GST-ready bill summaries." },
  { icon: Salad, title: "Menu control", copy: "Manage dishes, images, tags, availability, and food filters." },
  { icon: BarChart3, title: "Restaurant reports", copy: "Track sales before GST, top dishes, and active tables." },
  { icon: Store, title: "Restaurant identity", copy: "Use your own menu branding without customer app installs." },
];

const process = [
  "Build the menu and tables",
  "Place a QR code on each table",
  "Customer scans and sends the order",
  "Counter prints KOT, serves, bills, and reports",
];

const LayeredProductStage: React.FC = () => (
  <div className="product-stage group relative mx-auto h-[470px] max-w-6xl sm:h-[510px]" aria-label="Layered preview of the restaurant ordering system">
    <div className="absolute inset-x-0 top-6 h-[310px] rounded-[8px] border border-[#cbcbc4] bg-[#e8e7e0]" aria-label="Restaurant photo placeholder" />

    <div className="product-plane absolute inset-x-3 top-10 overflow-hidden rounded-[8px] border border-[#c8c8c1] bg-white shadow-[0_28px_60px_rgba(23,25,22,0.18)] sm:inset-x-16 lg:inset-x-28">
      <div className="flex h-12 items-center justify-between border-b border-[#deded8] px-4 sm:px-5">
        <div className="flex items-center gap-2 text-sm font-bold text-[#171916]">
          <Store className="h-4 w-4" aria-hidden="true" /> Counter
        </div>
        <span className="flex items-center gap-2 text-xs font-semibold text-[#214c37]"><span className="h-2 w-2 rounded-full bg-[#214c37]" />Live</span>
      </div>
      <div className="grid h-[245px] grid-cols-[64px_1fr] sm:grid-cols-[150px_1fr]">
        <aside className="border-r border-[#deded8] bg-[#f3f2ec] p-2 sm:p-3">
          {[ShoppingBag, Salad, QrCode, BarChart3].map((Icon, index) => (
            <div key={index} className={`mb-2 flex h-9 items-center gap-2 rounded-[5px] px-2 text-xs font-semibold ${index === 0 ? "bg-[#171916] text-white" : "text-[#686b65]"}`}>
              <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
              <span className="hidden sm:inline">{["Live orders", "Menu", "Tables", "Reports"][index]}</span>
            </div>
          ))}
        </aside>
        <div className="min-w-0 p-3 sm:p-5">
          <div className="flex items-end justify-between border-b border-[#deded8] pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-[#70736d]">Live queue</p>
              <h2 className="mt-1 text-lg font-bold text-[#171916] sm:text-xl">Orders that need action</h2>
            </div>
            <span className="hidden rounded-[5px] border border-[#c8c8c1] px-2 py-1 text-xs font-semibold sm:block">Preparing 3</span>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {["Table 04", "Table 09"].map((table, index) => (
              <div key={table} className="rounded-[6px] border border-[#d8d8d2] bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[#171916]">{table}</p>
                  <span className="text-[10px] font-bold text-[#214c37]">NEW</span>
                </div>
                <p className="mt-2 truncate text-xs text-[#696c66]">{index === 0 ? "2 × Paneer Tikka · 1 × Soda" : "1 × Biryani · 2 × Naan"}</p>
                <div className="mt-3 flex gap-2">
                  <span className="rounded-[4px] border border-[#bdbdb6] px-2 py-1 text-[10px] font-bold">KOT</span>
                  <span className="rounded-[4px] bg-[#214c37] px-2 py-1 text-[10px] font-bold text-white">Accept</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    <div className="product-float absolute bottom-0 left-3 w-[176px] rounded-[24px] border-[5px] border-[#171916] bg-[#f6f5ef] p-2 shadow-[0_26px_50px_rgba(23,25,22,0.24)] sm:left-12 sm:w-[210px] lg:left-24">
      <div className="rounded-[16px] bg-[#214c37] p-3 text-white">
        <p className="text-[9px] font-semibold uppercase text-white/65">Table 04</p>
        <p className="mt-1 text-sm font-bold">Your restaurant</p>
      </div>
      <div className="mt-2 space-y-2">
        {["Paneer bowl", "Masala lemonade"].map((item) => (
          <div key={item} className="flex items-center gap-2 border-b border-[#dadad4] pb-2 last:border-0">
            <div className="h-8 w-8 flex-none rounded-[4px] border border-[#c9c9c2] bg-[#e2e1da]" aria-label="Dish photo placeholder" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-bold text-[#171916]">{item}</p>
              <p className="text-[9px] text-[#6d706a]">Veg · Available</p>
            </div>
            <span className="text-[9px] font-bold text-[#214c37]">ADD</span>
          </div>
        ))}
      </div>
    </div>

    <div className="product-float absolute bottom-6 right-3 w-[155px] rounded-[7px] border border-[#c8c8c1] bg-white p-4 shadow-[0_22px_46px_rgba(23,25,22,0.2)] sm:right-12 sm:w-[190px] lg:right-24">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase text-[#6d706a]">Table code</p>
          <p className="text-sm font-bold text-[#171916]">Table 04</p>
        </div>
        <QrCode className="h-8 w-8 text-[#171916]" aria-hidden="true" />
      </div>
      <div className="mt-4 border-t border-[#deded8] pt-3 text-[10px] font-semibold text-[#214c37]">Scan to open the menu</div>
    </div>
  </div>
);

const LandingPage: React.FC = () => (
  <div className="min-h-screen bg-[#f4f3ed] text-[#171916]">
    <PublicHeader />
    <main>
      <section className="overflow-hidden border-b border-[#d8d7d0]">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 text-center sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
          <p className="text-sm font-bold uppercase text-[#214c37]">No customer app. No new hardware.</p>
          <h1 className="mx-auto mt-5 max-w-4xl text-[42px] font-bold leading-[1.04] sm:text-5xl lg:text-6xl">
            QR ordering, from table to counter.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#60635d] sm:text-lg">
            Customers scan, choose, and order. Your team receives the order, prints the KOT, serves the table, and tracks the sale.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#214c37] px-6 py-3.5 font-bold text-white hover:bg-[#173a29]">
              Register your restaurant <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/how-it-works" className="inline-flex items-center justify-center rounded-[6px] border border-[#aeada6] px-6 py-3.5 font-bold text-[#171916] hover:bg-white">
              See the full demonstration
            </Link>
          </div>
          <div className="mt-10 sm:mt-14"><LayeredProductStage /></div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 border-b border-[#d8d7d0] bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div>
              <p className="text-sm font-bold uppercase text-[#214c37]">The system</p>
              <h2 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">The parts restaurant service actually needs.</h2>
              <p className="mt-4 max-w-md leading-7 text-[#666963]">A focused workflow for dine-in ordering, kitchen handoff, table billing, menu control, and daily reporting.</p>
            </div>
            <div className="grid sm:grid-cols-2">
              {capabilities.map((item) => (
                <article key={item.title} className="border-t border-[#d8d7d0] py-5 sm:pr-8">
                  <item.icon className="h-5 w-5 text-[#214c37]" aria-hidden="true" />
                  <h3 className="mt-3 font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#696c66]">{item.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#d8d7d0] py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase text-[#214c37]">A complete service loop</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Understand the whole flow before you register.</h2>
            <ol className="mt-8 border-t border-[#c9c8c0]">
              {process.map((item, index) => (
                <li key={item} className="flex gap-4 border-b border-[#c9c8c0] py-4">
                  <span className="font-mono text-xs font-bold text-[#214c37]">0{index + 1}</span>
                  <span className="font-semibold">{item}</span>
                </li>
              ))}
            </ol>
            <Link to="/how-it-works" className="mt-7 inline-flex items-center gap-2 font-bold text-[#214c37] hover:underline">
              Open the detailed demonstration <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="h-[360px] rounded-[8px] border border-[#c9c8c0] bg-[#e5e4dd] shadow-[18px_22px_0_#214c37]" aria-label="Restaurant photography placeholder" />
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 bg-[#171916] py-16 text-white sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase text-[#91ad9e]">Two plans. Nothing hidden.</p>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Test the workflow, then run service.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {Object.entries(APP_CONFIG.plans).map(([key, plan]) => {
              const paid = key === "restaurant_plan";
              return (
                <article key={key} className={`rounded-[8px] border p-6 sm:p-8 ${paid ? "border-[#71897c] bg-[#214c37]" : "border-white/15 bg-white/[0.03]"}`}>
                  <p className="text-lg font-bold">{plan.name}</p>
                  <p className="mt-1 text-sm text-white/55">{plan.duration}</p>
                  <p className="mt-6 text-4xl font-bold">{APP_CONFIG.defaultCurrency}{plan.price.toLocaleString("en-IN")}{paid && <span className="text-sm font-medium text-white/55"> / month</span>}</p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-white/75"><Check className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />{feature}</li>
                    ))}
                  </ul>
                  <Link to="/register" className={`mt-7 inline-flex w-full items-center justify-center rounded-[6px] px-5 py-3 font-bold ${paid ? "bg-white text-[#171916]" : "border border-white/25 text-white hover:bg-white/5"}`}>
                    {paid ? "Register for Restaurant Plan" : "Start Free Demo"}
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#f4f3ed] py-14 sm:py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase text-[#214c37]">Ready for your own menu?</p>
            <h2 className="mt-2 text-3xl font-bold">Put your restaurant on the table.</h2>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link to="/register" className="rounded-[6px] bg-[#214c37] px-6 py-3.5 text-center font-bold text-white">Register restaurant</Link>
            <Link to="/login" className="rounded-[6px] border border-[#aeada6] px-6 py-3.5 text-center font-bold">Login</Link>
          </div>
        </div>
      </section>
    </main>
    <PublicFooter />
  </div>
);

export default LandingPage;
