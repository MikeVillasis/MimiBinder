"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useSync } from "@/lib/sync";
import { CardInspector } from "./CardInspector";
import { useTrackNavigation } from "./navHistory";
import { ShaderBackground } from "./theme/ShaderBackground";

const NAV = [
  { href: "/", label: "Home", icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/search", label: "Search", icon: "M11 4a7 7 0 1 0 4.2 12.6l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 11 4z" },
  { href: "/collection", label: "Collection", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { href: "/binders", label: "Binders", icon: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v14h2V5zm4 0v14h8V5z" },
  { href: "/settings", label: "Settings", icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.5 4a6.5 6.5 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a6.6 6.6 0 0 0-2-1.2L15.6 3h-4l-.4 2.6a6.6 6.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a6.500 6.500 0 0 0 0 2.400l-2 1.600 2 3.400 2.400-1a6.600 6.600 0 0 0 2 1.200l.4 2.600h4l.4-2.600a6.600 6.600 0 0 0 2-1.200l2.400 1 2-3.400-2-1.600c.1-.4.1-.8.1-1.200z" },
] as const;

// Desktop sidebar only: the mobile bottom bar stays at five items (phones reach this from Home and each card).
const CENTERING = { href: "/centering", label: "Centering", icon: "M4 4h16v16H4zM7 7v10h10V7z" } as const;
const SIDE_NAV = [...NAV.slice(0, 4), CENTERING, NAV[4]];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/icons/icon.svg" alt="" aria-hidden="true" className="h-7 w-7 rounded-lg" />
      <span className="text-lg font-extrabold tracking-tight">
        Mimi<span className="text-accent">Binder</span>
      </span>
    </span>
  );
}

function SideNav({ path }: { path: string }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {SIDE_NAV.map((n) => {
        const active = isActive(path, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`ui-motion flex min-h-11 items-center gap-3 rounded-ui-sm px-3 text-sm ${
              active ? "bg-accent-soft font-semibold text-accent" : "font-medium text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <Icon d={n.icon} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNav({ path }: { path: string }) {
  return (
    <ul className="mx-auto grid max-w-lg grid-cols-5 px-1">
      {NAV.map((n) => {
        const active = isActive(path, n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`ui-press flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-xs ${
                active ? "font-semibold text-accent" : "font-medium text-muted"
              }`}
            >
              <span
                className={`ui-motion flex h-7 w-14 items-center justify-center rounded-full ${active ? "bg-accent-soft" : ""}`}
                aria-hidden="true"
              >
                <Icon d={n.icon} />
              </span>
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Phone top bar: transparent over the page top, blurred surface + hairline once content scrolls under it. */
function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={`ui-motion sticky top-0 z-20 flex min-h-12 items-center border-b px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur-xl backdrop-saturate-150 md:hidden ${
        scrolled ? "border-line/60 bg-bg/75" : "border-transparent bg-bg/0"
      }`}
    >
      <Link href="/" aria-label="MimiBinder home" className="-my-1 flex min-h-11 items-center">
        <Logo />
      </Link>
    </header>
  );
}

// usePathname must sit under <Suspense> with Cache Components enabled.
function ActiveSideNav() {
  return <SideNav path={usePathname()} />;
}
function ActiveBottomNav() {
  useTrackNavigation(); // mounted once (bottom nav is always rendered, hidden on desktop)
  return <BottomNav path={usePathname()} />;
}

function SyncMount() {
  useSync(); // mounting enables auto-sync when signed in
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:pl-60">
      <ShaderBackground />
      <SyncMount />
      <CardInspector />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-5 border-r border-line/60 bg-surface/80 p-3 backdrop-blur-xl md:flex">
        <Link href="/" className="rounded-ui-sm px-3 py-4" aria-label="MimiBinder home">
          <Logo />
        </Link>
        <Suspense fallback={<SideNav path="" />}>
          <ActiveSideNav />
        </Suspense>
      </aside>

      <TopBar />

      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-2 md:px-8 md:pb-12 md:pt-10">
        {/* Route params and other runtime data stream in under this boundary (Cache Components). */}
        <Suspense fallback={<div className="h-40 animate-pulse rounded-ui-lg bg-surface" aria-busy="true" />}>
          {children}
        </Suspense>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line/60 bg-surface/75 pb-[env(safe-area-inset-bottom)] shadow-[var(--hairline)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
      >
        <Suspense fallback={<BottomNav path="" />}>
          <ActiveBottomNav />
        </Suspense>
      </nav>
    </div>
  );
}
