import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Minus,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  ScanLine,
  Search,
  Send,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { PublicFooter, PublicHeader } from "../../components/PublicShell";
import { APP_CONFIG } from "../../config/config";

const demoSteps = [
  {
    id: "setup",
    number: "01",
    icon: Settings2,
    label: "Restaurant setup",
    title: "Create the restaurant, menu, and service settings.",
    description: "The owner adds restaurant identity, GST rates, menu categories, dishes, prices, food types, and availability.",
    bullets: ["Restaurant branding and tax settings", "Dish prices, sizes, add-ons, and tags", "Menu images can be added later"],
  },
  {
    id: "qr",
    number: "02",
    icon: QrCode,
    label: "Table QR codes",
    title: "Give every active table its own ordering link.",
    description: "The dashboard generates a secure QR code for each table. Disabling or regenerating a table token invalidates the old link.",
    bullets: ["One QR code per table", "Printable table identifiers", "Links open directly in the browser"],
  },
  {
    id: "scan",
    number: "03",
    icon: ScanLine,
    label: "Customer scans",
    title: "Open the correct restaurant and table automatically.",
    description: "The customer scans the QR code and lands on a mobile menu already connected to the restaurant and table number.",
    bullets: ["No app download", "Search and category filters", "Veg, Non-Veg, Egg, and Jain filters"],
  },
  {
    id: "customize",
    number: "04",
    icon: SlidersHorizontal,
    label: "Dish choices",
    title: "Review a dish before adding it to the order.",
    description: "Customers can open dish details, choose size and extras, set quantity, and leave a short preparation request.",
    bullets: ["Dish details and dietary tags", "Sizes, extras, and quantity", "Special requests stay attached to the item"],
  },
  {
    id: "send",
    number: "05",
    icon: Send,
    label: "Place order",
    title: "Confirm the table order and send it to the counter.",
    description: "The checkout shows the items and subtotal before GST. The customer confirms their details and places the order.",
    bullets: ["Server-validated menu prices", "Table token included automatically", "Clear order confirmation"],
  },
  {
    id: "kot",
    number: "06",
    icon: Printer,
    label: "Counter and KOT",
    title: "Accept the order and send a clean ticket to the kitchen.",
    description: "The live queue prioritizes new orders. Staff can accept, prepare, print the KOT, mark ready, and serve.",
    bullets: ["Live sound-enabled order queue", "Kitchen order ticket printing", "New, preparing, ready, and served states"],
  },
  {
    id: "bill",
    number: "07",
    icon: ReceiptText,
    label: "Serve and bill",
    title: "Settle the table with a GST-aware bill summary.",
    description: "Reports group the day’s orders by table and can print subtotal, CGST, SGST, and total for the selected table.",
    bullets: ["Table-wise order summary", "Configurable CGST and SGST", "Printed bill record"],
  },
  {
    id: "reports",
    number: "08",
    icon: BarChart3,
    label: "Reports",
    title: "Review sales and operating patterns after service.",
    description: "The reports page shows order totals, sales before GST, open and served orders, popular dishes, and the busiest table.",
    bullets: ["Today, 7-day, and 30-day views", "Top selling items", "CSV export and table history"],
  },
] as const;

type StepId = (typeof demoSteps)[number]["id"];

const PhotoPlaceholder: React.FC<{ className?: string; label?: string }> = ({ className = "", label = "Photo placeholder" }) => (
  <div className={`border border-[#c9c9c2] bg-[#e5e4dd] ${className}`} aria-label={label} />
);

const DemoVisual: React.FC<{ step: StepId }> = ({ step }) => {
  if (step === "setup") {
    return (
      <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
        <div>
          <PhotoPlaceholder className="h-40 rounded-[6px]" label="Restaurant logo or cover photo placeholder" />
          <div className="mt-3 rounded-[6px] border border-[#d4d4cd] p-3">
            <p className="text-xs font-bold text-[#214c37]">Restaurant profile</p>
            <p className="mt-2 text-sm font-bold">Your restaurant name</p>
            <p className="mt-1 text-xs text-[#6b6e68]">GST enabled · Branding ready</p>
          </div>
        </div>
        <div className="rounded-[6px] border border-[#d4d4cd] p-4">
          <div className="flex items-center justify-between border-b border-[#deded8] pb-3">
            <p className="font-bold">Menu setup</p><span className="text-xs font-bold text-[#214c37]">Available</span>
          </div>
          {["Smoky paneer bowl", "Chicken biryani", "Masala lemonade"].map((item, index) => (
            <div key={item} className="flex items-center gap-3 border-b border-[#e1e1db] py-3 last:border-0">
              <PhotoPlaceholder className="h-10 w-10 flex-none rounded-[4px]" label={`${item} photo placeholder`} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item}</p><p className="text-xs text-[#6b6e68]">{index === 1 ? "Non-Veg" : "Veg"} · Price configured</p></div>
              <span className="text-xs font-bold">Edit</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === "qr") {
    return (
      <div>
        <div className="flex items-end justify-between border-b border-[#d8d8d2] pb-4">
          <div><p className="text-xs font-bold uppercase text-[#214c37]">Tables</p><h3 className="mt-1 text-xl font-bold">QR codes ready to print</h3></div>
          <span className="rounded-[5px] border border-[#bdbdb6] px-3 py-2 text-xs font-bold">Add table</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {["01", "02", "03", "04", "05", "06"].map((table) => (
            <div key={table} className="rounded-[6px] border border-[#d4d4cd] p-3 text-center">
              <QrCode className="mx-auto h-12 w-12" aria-hidden="true" />
              <p className="mt-2 text-sm font-bold">Table {table}</p>
              <p className="text-[10px] text-[#6b6e68]">Active ordering link</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === "scan") {
    return (
      <div className="mx-auto max-w-[330px] rounded-[26px] border-[6px] border-[#171916] bg-[#f6f5ef] p-3 shadow-xl">
        <div className="rounded-[8px] bg-[#214c37] p-4 text-white"><p className="text-[10px] font-bold uppercase text-white/65">Table 04</p><p className="mt-1 text-lg font-bold">Your restaurant</p></div>
        <div className="mt-3 flex items-center gap-2 rounded-[6px] border border-[#d2d2cb] bg-white px-3 py-2 text-xs text-[#71746e]"><Search className="h-4 w-4" />Search dishes</div>
        <div className="mt-3 flex gap-2 text-[10px] font-bold"><span className="rounded-[4px] bg-[#171916] px-2 py-1 text-white">All</span><span className="rounded-[4px] border border-[#c9c9c2] px-2 py-1">Veg</span><span className="rounded-[4px] border border-[#c9c9c2] px-2 py-1">Non-Veg</span></div>
        <div className="mt-3 space-y-2">
          {["Paneer bowl", "Masala lemonade"].map((item) => (
            <div key={item} className="flex items-center gap-2 border-b border-[#dcdcd6] pb-2">
              <PhotoPlaceholder className="h-12 w-12 flex-none rounded-[4px]" label={`${item} photo placeholder`} />
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{item}</p><p className="text-[10px] text-[#6b6e68]">Veg · Available</p></div>
              <Plus className="h-4 w-4 text-[#214c37]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === "customize") {
    return (
      <div className="mx-auto max-w-lg">
        <PhotoPlaceholder className="h-40 rounded-[6px]" label="Dish photo placeholder" />
        <div className="mt-4 flex items-start justify-between"><div><p className="text-xl font-bold">Smoky paneer bowl</p><p className="mt-1 text-sm text-[#6b6e68]">Veg · Contains dairy</p></div><p className="font-bold text-[#214c37]">{APP_CONFIG.defaultCurrency}289</p></div>
        <div className="mt-5 border-t border-[#d7d7d0] pt-4"><p className="text-xs font-bold uppercase">Choose size</p><div className="mt-2 flex gap-2"><span className="rounded-[5px] bg-[#214c37] px-3 py-2 text-xs font-bold text-white">Regular</span><span className="rounded-[5px] border border-[#c7c7c0] px-3 py-2 text-xs font-bold">Large</span></div></div>
        <div className="mt-4 flex items-center justify-between border-t border-[#d7d7d0] pt-4"><div className="flex items-center gap-4 rounded-[5px] border border-[#c7c7c0] px-3 py-2"><Minus className="h-4 w-4" /><span className="font-bold">1</span><Plus className="h-4 w-4" /></div><span className="rounded-[5px] bg-[#214c37] px-5 py-3 text-sm font-bold text-white">Add to cart</span></div>
      </div>
    );
  }

  if (step === "send") {
    return (
      <div className="mx-auto max-w-lg rounded-[7px] border border-[#d2d2cb] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#deded8] pb-4"><div><p className="text-xs font-bold uppercase text-[#214c37]">Table 04</p><h3 className="mt-1 text-xl font-bold">Review order</h3></div><Send className="h-6 w-6" /></div>
        <div className="space-y-3 py-4">{["2 × Smoky paneer bowl", "1 × Masala lemonade"].map((item, index) => <div key={item} className="flex justify-between text-sm"><span>{item}</span><span className="font-bold">{APP_CONFIG.defaultCurrency}{index === 0 ? "578" : "99"}</span></div>)}</div>
        <div className="flex justify-between border-t border-[#deded8] pt-4"><span className="text-sm text-[#686b65]">Subtotal before GST</span><span className="font-bold">{APP_CONFIG.defaultCurrency}677</span></div>
        <div className="mt-5 rounded-[5px] bg-[#214c37] px-4 py-3 text-center text-sm font-bold text-white">Place table order</div>
      </div>
    );
  }

  if (step === "kot") {
    return (
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[7px] border border-[#d2d2cb] bg-white p-5">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-[#214c37]">New live order</p><p className="mt-1 text-xl font-bold">Table 04</p></div><span className="text-xs text-[#6b6e68]">Just now</span></div>
          <div className="my-4 space-y-2 border-y border-[#deded8] py-4 text-sm"><p>2 × Smoky paneer bowl</p><p>1 × Masala lemonade</p><p className="text-xs text-[#6b6e68]">Request: medium spice</p></div>
          <div className="flex gap-2"><span className="flex items-center gap-2 rounded-[5px] border border-[#bdbdb6] px-3 py-2 text-xs font-bold"><Printer className="h-4 w-4" />Print KOT</span><span className="rounded-[5px] bg-[#214c37] px-3 py-2 text-xs font-bold text-white">Accept order</span></div>
        </div>
        <div className="rotate-1 bg-white p-5 shadow-[6px_8px_0_#d2d2cb]">
          <p className="text-center font-mono text-sm font-bold">KITCHEN ORDER</p><p className="mt-2 border-y border-dashed border-[#777] py-2 text-center font-mono text-xs">TABLE 04 · ORDER A104</p><div className="mt-4 space-y-2 font-mono text-xs"><p>2  PANEER BOWL</p><p>1  MASALA LEMONADE</p><p className="pt-2 font-bold">NOTE: MEDIUM SPICE</p></div>
        </div>
      </div>
    );
  }

  if (step === "bill") {
    return (
      <div className="mx-auto max-w-md bg-white p-6 shadow-[8px_10px_0_#d2d2cb]">
        <p className="text-center text-lg font-bold">Your restaurant</p><p className="mt-1 text-center text-xs text-[#6b6e68]">Table 04 · Bill summary</p>
        <div className="mt-5 space-y-3 border-y border-dashed border-[#858780] py-4 text-sm"><div className="flex justify-between"><span>Items subtotal</span><span>{APP_CONFIG.defaultCurrency}677.00</span></div><div className="flex justify-between"><span>CGST</span><span>{APP_CONFIG.defaultCurrency}16.93</span></div><div className="flex justify-between"><span>SGST</span><span>{APP_CONFIG.defaultCurrency}16.93</span></div></div>
        <div className="mt-4 flex justify-between text-lg font-bold"><span>Total</span><span>{APP_CONFIG.defaultCurrency}710.86</span></div>
        <p className="mt-6 text-center text-xs text-[#6b6e68]">Thank you. Please pay at the counter or using the table QR.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["Today's orders", "Sales before GST", "Top item", "Active table"].map((label, index) => (
          <div key={label} className="rounded-[6px] border border-[#d4d4cd] p-4"><p className="text-[10px] font-bold uppercase text-[#6b6e68]">{label}</p><p className="mt-2 text-lg font-bold">{["42", `${APP_CONFIG.defaultCurrency}18,420`, "Paneer bowl", "Table 04"][index]}</p></div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[6px] border border-[#d4d4cd] p-4"><div className="flex items-center justify-between"><p className="font-bold">Orders by day</p><span className="text-xs font-bold text-[#214c37]">7 / 30 days</span></div><div className="mt-6 flex h-28 items-end gap-3">{[42, 64, 51, 76, 68, 92, 82].map((height, index) => <span key={index} className="flex-1 rounded-t-[2px] bg-[#214c37]" style={{ height: `${height}%` }} />)}</div></div>
        <div className="rounded-[6px] border border-[#d4d4cd] p-4"><p className="font-bold">Top items</p><div className="mt-4 space-y-3 text-sm">{["Paneer bowl", "Chicken biryani", "Masala lemonade"].map((item, index) => <div key={item} className="flex justify-between border-b border-[#deded8] pb-2"><span>{item}</span><span className="font-bold">{18 - index * 3}</span></div>)}</div></div>
      </div>
    </div>
  );
};

const HowItWorksPage: React.FC = () => {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const active = demoSteps[activeIndex];

  return (
    <div className="min-h-screen bg-[#f4f3ed] text-[#171916]">
      <PublicHeader />
      <main>
        <section className="border-b border-[#d8d7d0] py-14 text-center sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <p className="text-sm font-bold uppercase text-[#214c37]">Detailed demonstration</p>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.05] sm:text-5xl lg:text-6xl">Follow one order through the whole restaurant.</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#62655f] sm:text-lg">Choose a step to see what the customer, counter, kitchen, and owner experience from setup to reports.</p>
          </div>
        </section>

        <section className="bg-white py-12 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[300px_1fr] lg:px-8">
            <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:block lg:overflow-visible lg:border-t lg:border-[#c9c9c2] lg:px-0 lg:pb-0" aria-label="Demonstration steps">
              {demoSteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-pressed={activeIndex === index}
                  aria-controls="demonstration-panel"
                  className={`flex min-w-[174px] flex-none items-center gap-3 rounded-[6px] border border-[#c9c9c2] px-3 py-3 text-left transition-colors lg:w-full lg:min-w-0 lg:rounded-none lg:border-x-0 lg:border-t-0 ${activeIndex === index ? "bg-[#214c37] text-white" : "hover:bg-[#eeede7]"}`}
                >
                  <span className="font-mono text-[10px] font-bold opacity-60">{step.number}</span>
                  <step.icon className="h-4 w-4 flex-none" aria-hidden="true" />
                  <span className="text-sm font-bold">{step.label}</span>
                </button>
              ))}
            </nav>

            <div id="demonstration-panel" className="min-w-0" aria-live="polite">
              <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr] xl:items-start">
                <div>
                  <p className="text-xs font-bold uppercase text-[#214c37]">Step {active.number} - {active.label}</p>
                  <h2 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">{active.title}</h2>
                  <p className="mt-4 leading-7 text-[#646761]">{active.description}</p>
                  <ul className="mt-6 space-y-3">
                    {active.bullets.map((bullet) => <li key={bullet} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 flex-none text-[#214c37]" aria-hidden="true" />{bullet}</li>)}
                  </ul>
                </div>

                <div className="demo-stage min-h-[430px] rounded-[8px] border border-[#c9c9c2] bg-[#e7e6df] p-3 sm:p-6">
                  <div key={active.id} className="demo-plane demo-enter min-h-[380px] rounded-[8px] border border-[#c9c9c2] bg-[#f8f7f2] p-4 shadow-[0_28px_55px_rgba(23,25,22,0.16)] sm:p-6">
                    <DemoVisual step={active.id} />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-[#d4d4cd] pt-5">
                <button type="button" onClick={() => setActiveIndex((current) => Math.max(0, current - 1))} disabled={activeIndex === 0} className="inline-flex items-center gap-2 text-sm font-bold disabled:opacity-30"><ArrowLeft className="h-4 w-4" />Previous</button>
                <span className="font-mono text-xs text-[#6b6e68]">{activeIndex + 1} / {demoSteps.length}</span>
                <button type="button" onClick={() => setActiveIndex((current) => Math.min(demoSteps.length - 1, current + 1))} disabled={activeIndex === demoSteps.length - 1} className="inline-flex items-center gap-2 text-sm font-bold text-[#214c37] disabled:opacity-30">Next<ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[#d8d7d0] py-14 sm:py-16">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:px-6 lg:flex-row lg:items-center">
            <div><p className="text-sm font-bold uppercase text-[#214c37]">Seen enough?</p><h2 className="mt-2 text-3xl font-bold">Try the flow with your own restaurant.</h2></div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"><Link to="/register" className="rounded-[6px] bg-[#214c37] px-6 py-3.5 text-center font-bold text-white">Register restaurant</Link><Link to="/login" className="rounded-[6px] border border-[#aeada6] px-6 py-3.5 text-center font-bold">Login</Link></div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
};

export default HowItWorksPage;
