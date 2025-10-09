import { Dumbbell } from "lucide-react";

export function BackgroundLogo() {
  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
      <Dumbbell
        className="text-gray-900/30 w-96 h-96"
        strokeWidth={0.5}
      />
    </div>
  );
}
