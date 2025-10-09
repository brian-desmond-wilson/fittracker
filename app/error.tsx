"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-800 text-center">
        <div className="flex justify-center mb-4">
          <div className="bg-red-500/20 rounded-full p-4">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Something went wrong!</h2>
        <p className="text-gray-400 mb-6">
          {error.message || "An unexpected error occurred"}
        </p>
        <button
          onClick={reset}
          className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
