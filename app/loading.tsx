import { Dumbbell } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-bounce">
          <Dumbbell className="w-16 h-16 text-primary" />
        </div>
        <p className="mt-4 text-gray-400 font-medium">Loading...</p>
      </div>
    </div>
  );
}
