"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Plus, TrendingUp, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/",
    label: "Home",
    icon: Home,
  },
  {
    href: "/schedule",
    label: "Schedule",
    icon: Calendar,
  },
  {
    href: "/track",
    label: "Track",
    icon: Plus,
  },
  {
    href: "/progress",
    label: "Progress",
    icon: TrendingUp,
  },
  {
    href: "/profile",
    label: "Profile",
    icon: User,
  },
];

const TRANSITION_DELAY_MS = 500;

export function BottomNav() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const keyboardOffsetRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const pendingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") {
      return;
    }

    const nav = navRef.current;
    if (!nav) {
      return;
    }

    const readKeyboardOffset = () => {
      const root = document.documentElement;
      const value = getComputedStyle(root).getPropertyValue("--app-keyboard-offset");
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const applyTransform = (immediate = false) => {
      if (!nav) return;

      const vv = window.visualViewport;
      const offsetTop = vv ? vv.offsetTop : 0;
      const viewportBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const gap = Math.max(0, window.innerHeight - viewportBottom);

      const translate = offsetTop - gap;

      const commit = () => {
        nav.style.transform = `translate3d(0, ${translate}px, 0)`;
        nav.dataset.debugTransform = nav.style.transform;
        animationRef.current = null;
      };

      if (immediate) {
        commit();
      } else {
        if (animationRef.current !== null) {
          cancelAnimationFrame(animationRef.current);
        }
        animationRef.current = requestAnimationFrame(commit);
      }
    };

    keyboardOffsetRef.current = readKeyboardOffset();
    applyTransform(true);

    const handleKeyboardOffset = (event: Event) => {
      const detail = (event as CustomEvent<{ offset: number }>).detail;
      const offset = detail && typeof detail.offset === "number" ? detail.offset : 0;
      keyboardOffsetRef.current = offset;
      if (pendingTimeoutRef.current !== null) {
        window.clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }

      if (offset > 0) {
        applyTransform(true);
      } else {
        pendingTimeoutRef.current = window.setTimeout(() => {
          applyTransform(true);
        }, TRANSITION_DELAY_MS);
      }
    };

    const handleViewportChange = () => applyTransform();

    window.addEventListener("app:keyboard-offset", handleKeyboardOffset as EventListener);
    window.addEventListener("orientationchange", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);

    return () => {
      window.removeEventListener(
        "app:keyboard-offset",
        handleKeyboardOffset as EventListener
      );
      window.removeEventListener("orientationchange", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (pendingTimeoutRef.current !== null) {
        window.clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
      if (navRef.current) {
        navRef.current.style.transform = "translate3d(0, 0, 0)";
      }
    };
  }, [mounted]);

  const navContent = (
    <nav
      ref={navRef}
      className="bottom-nav fixed left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 pb-safe"
      data-nav-debug="bottom-nav"
      style={{
        bottom: "env(safe-area-inset-bottom)",
        WebkitTransform: "translate3d(0, 0, 0)",
        transform: "translate3d(0, 0, 0)",
        WebkitBackfaceVisibility: "hidden",
        backfaceVisibility: "hidden",
      }}
    >
      <div className="grid grid-cols-5 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center py-3 px-2",
                "transition-all duration-150 ease-out",
                "active:scale-90 active:bg-gray-800/50",
                "touch-manipulation",
                isActive
                  ? "text-primary"
                  : "text-gray-400 hover:text-gray-300"
              )}
            >
              <Icon className={cn("w-6 h-6 mb-1", isActive && "stroke-[2.5]")} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  if (!mounted) {
    return null;
  }

  return createPortal(navContent, document.body);
}
