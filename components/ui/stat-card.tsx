import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-primary",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-gray-900 rounded-2xl p-4 border border-gray-800",
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-gray-400 font-medium">{title}</p>
        {Icon && (
          <div className={cn("p-2 rounded-lg bg-gray-800", iconColor)}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
  );
}
