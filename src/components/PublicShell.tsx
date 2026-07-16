import React from "react";
import { ArrowRight, Menu, Store, X } from "lucide-react";
import { Link } from "react-router-dom";
import { APP_CONFIG } from "../config/config";

const navLinks = [
  { label: "How it works", href: "/how-it-works", internal: true },
  { label: "Features", href: "/#features", internal: false },
  { label: "Pricing", href: "/#pricing", internal: false },
];

export const PublicHeader: React.FC = () => {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#d8d7d0] bg-[#f4f3ed]/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5" aria-label={`${APP_CONFIG.appName} home`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-[#171916] text-white">
            <Store className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold text-[#171916]">{APP_CONFIG.appName}</span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main navigation">
          {navLinks.map((link) =>
            link.internal ? (
              <Link key={link.href} to={link.href} className="text-sm font-semibold text-[#5d615b] hover:text-[#171916]">
                {link.label}
              </Link>
            ) : (
              <a key={link.href} href={link.href} className="text-sm font-semibold text-[#5d615b] hover:text-[#171916]">
                {link.label}
              </a>
            )
          )}
          <Link to="/login" className="text-sm font-semibold text-[#5d615b] hover:text-[#171916]">
            Login
          </Link>
          <Link to="/register" className="inline-flex items-center gap-2 rounded-[6px] bg-[#214c37] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#173a29]">
            Register restaurant <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-[#c9c8c0] text-[#171916] lg:hidden"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          title={open ? "Close navigation" : "Open navigation"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-[#d8d7d0] bg-[#f4f3ed] px-4 py-4 lg:hidden" aria-label="Mobile navigation">
          <div className="mx-auto grid max-w-7xl gap-1">
            {navLinks.map((link) =>
              link.internal ? (
                <Link key={link.href} to={link.href} onClick={() => setOpen(false)} className="rounded-[4px] px-3 py-2.5 text-sm font-semibold hover:bg-[#e7e6df]">
                  {link.label}
                </Link>
              ) : (
                <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-[4px] px-3 py-2.5 text-sm font-semibold hover:bg-[#e7e6df]">
                  {link.label}
                </a>
              )
            )}
            <Link to="/login" onClick={() => setOpen(false)} className="rounded-[4px] px-3 py-2.5 text-sm font-semibold hover:bg-[#e7e6df]">
              Restaurant login
            </Link>
            <Link to="/register" onClick={() => setOpen(false)} className="mt-2 rounded-[6px] bg-[#214c37] px-4 py-3 text-center text-sm font-bold text-white">
              Register restaurant
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
};

export const PublicFooter: React.FC = () => (
  <footer className="border-t border-white/10 bg-[#171916] py-10 text-white">
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-8 md:flex-row">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-white text-[#171916]">
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold">{APP_CONFIG.appName}</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-white/55">Table QR ordering, live counter operations, KOT printing, billing, and reports.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-3">
          <Link to="/how-it-works" className="text-white/65 hover:text-white">How it works</Link>
          <a href="/#features" className="text-white/65 hover:text-white">Features</a>
          <a href="/#pricing" className="text-white/65 hover:text-white">Pricing</a>
          <Link to="/register" className="text-white/65 hover:text-white">Register</Link>
          <Link to="/login" className="text-white/65 hover:text-white">Restaurant login</Link>
          <Link to="/admin/login" className="text-white/65 hover:text-white">Admin login</Link>
        </div>
      </div>
      <div className="mt-8 border-t border-white/10 pt-6 text-xs text-white/40">
        © {new Date().getFullYear()} {APP_CONFIG.appName}. All rights reserved.
      </div>
    </div>
  </footer>
);
