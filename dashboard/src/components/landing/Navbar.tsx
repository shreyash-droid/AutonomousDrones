"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import Logo from "@/components/ui/Logo";

const LINKS = [
  ["How it works", "#how"],
  ["AI in action", "#ai"],
  ["Hardware", "#hardware"],
  ["Impact", "#impact"],
  ["Run modes", "#modes"],
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-line bg-bg/75 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">
            AgriDrone <span className="text-brand">AI</span>
          </span>
        </Link>
        <div className="ml-6 hidden items-center gap-1 lg:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href}
               className="rounded-lg px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              {label}
            </a>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <Link href="/dashboard/simulator" className="btn btn-ghost">Live simulator</Link>
          <Link href="/dashboard" className="btn btn-primary">
            Open dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <button className="ml-auto rounded-lg p-2 text-ink-2 sm:hidden" onClick={() => setOpen(!open)}
                aria-label="Toggle menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open && (
        <div className="border-t border-line bg-bg/95 px-4 pb-4 backdrop-blur-xl sm:hidden">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}
               className="block border-b border-line py-3 text-sm text-ink-2">{label}</a>
          ))}
          <Link href="/dashboard" className="btn btn-primary mt-4 w-full">Open dashboard</Link>
        </div>
      )}
    </header>
  );
}
