import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-9xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-3xl font-bold text-white mb-2">Page not found</h2>
        <p className="text-gray-400 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          <Home className="w-5 h-5" />
          <span>Go Home</span>
        </Link>
      </div>
    </div>
  );
}
