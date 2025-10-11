"use client";

import { Calendar, Plus, Zap } from "lucide-react";

interface EmptyStateProps {
  onAddEvent: () => void;
  onOpenTemplates: () => void;
}

export function EmptyState({ onAddEvent, onOpenTemplates }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-sm px-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-800/50 mb-6">
          <Calendar className="w-10 h-10 text-gray-600" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">
          No events scheduled
        </h3>
        <p className="text-sm text-gray-400 mb-8">
          Get started by adding your first event or using a quick template
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onAddEvent}
            className="flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] bg-primary hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-gray-950 text-gray-950 font-medium rounded-lg transition-colors outline-none"
            autoFocus
          >
            <Plus className="w-5 h-5" />
            Add Your First Event
          </button>
          <button
            onClick={onOpenTemplates}
            className="flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] bg-gray-800 hover:bg-gray-700 focus:ring-2 focus:ring-gray-600 focus:ring-offset-2 focus:ring-offset-gray-950 text-white font-medium rounded-lg transition-colors outline-none"
          >
            <Zap className="w-5 h-5" />
            Browse Templates
          </button>
        </div>
      </div>
    </div>
  );
}
