"use client";

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

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 pb-safe">
      <div className="grid grid-cols-5 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center py-3 px-2 transition-colors",
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
}
