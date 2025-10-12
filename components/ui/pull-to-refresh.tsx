"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  children: React.ReactNode;
}

const THRESHOLD = 80;
const MAX_PULL = 140;

const isScrollable = (el: HTMLElement) => {
  const style = window.getComputedStyle(el);
  const overflowY = style.overflowY;
  return (
    (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
    el.scrollHeight > el.clientHeight
  );
};

const findScrollableParent = (
  start: EventTarget | null
): HTMLElement | Window => {
  let current = start instanceof HTMLElement ? start : null;

  while (current && current !== document.body) {
    if (isScrollable(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return window;
};

export function PullToRefresh({ children }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const startYRef = useRef(0);
  const isTrackingRef = useRef(false);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateDisplayMode = () => {
      const standaloneMedia = window.matchMedia("(display-mode: standalone)");
      const standaloneNavigator =
        // @ts-expect-error - standalone only exists on iOS Safari PWAs
        typeof window.navigator.standalone === "boolean"
          ? // @ts-expect-error
            window.navigator.standalone
          : false;

      setEnabled(standaloneMedia.matches || Boolean(standaloneNavigator));
    };

    updateDisplayMode();

    const media = window.matchMedia("(display-mode: standalone)");
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateDisplayMode);
      return () => media.removeEventListener("change", updateDisplayMode);
    }

    // Fallback for older iOS versions
    media.addListener(updateDisplayMode);
    return () => media.removeListener(updateDisplayMode);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) {
      return;
    }

    const updatePullDistance = (value: number) => {
      pullDistanceRef.current = value;
      setPullDistance(value);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const scroller = findScrollableParent(event.target);
      const containerParent = containerRef.current?.parentElement ?? null;
      const isWindowScroller = scroller === window;
      const isContainerScroller =
        scroller instanceof HTMLElement && scroller === containerParent;

      if (!isWindowScroller && !isContainerScroller) {
        isTrackingRef.current = false;
        return;
      }

      const isAtTop = isWindowScroller
        ? window.scrollY <= 0 && document.documentElement.scrollTop <= 0
        : scroller instanceof HTMLElement && scroller.scrollTop <= 0;

      if (!isAtTop) {
        isTrackingRef.current = false;
        return;
      }

      isTrackingRef.current = true;
      setIsDragging(true);
      startYRef.current = event.touches[0].clientY;
      updatePullDistance(0);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!isTrackingRef.current) return;

      const currentY = event.touches[0].clientY;
      const delta = currentY - startYRef.current;

      if (delta <= 0) {
        updatePullDistance(0);
        return;
      }

      // Prevent the default bounce so we can control the animation
      event.preventDefault();
      const distance = Math.min(delta, MAX_PULL);
      updatePullDistance(distance);
    };

    const resetPull = () => {
      isTrackingRef.current = false;
      setIsDragging(false);
      updatePullDistance(0);
    };

    const triggerRefresh = () => {
      window.location.reload();
    };

    const onTouchEnd = () => {
      if (!isTrackingRef.current) return;

      const pulledFarEnough = pullDistanceRef.current >= THRESHOLD;
      resetPull();

      if (pulledFarEnough) {
        triggerRefresh();
      }
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", resetPull);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", resetPull);
    };
  }, [enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const indicatorOffset = Math.min(pullDistance, MAX_PULL);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "pointer-events-none fixed left-1/2 top-4 z-50 flex items-center gap-2 rounded-full bg-gray-900/90 px-3 py-2 text-xs font-medium text-gray-300 shadow-lg backdrop-blur-sm transition-opacity",
          pullDistance > 0 ? "opacity-100" : "opacity-0"
        )}
        style={{
          transform: `translate(-50%, ${indicatorOffset}px)`,
          transition: isDragging ? "none" : "transform 0.2s ease, opacity 0.2s ease",
        }}
      >
        <RefreshCw
          className={cn(
            "h-4 w-4 text-gray-400 transition-colors",
            pullDistance >= THRESHOLD && "text-primary"
          )}
          style={{ transform: `rotate(${progress * 360}deg)` }}
        />
        <span className="tracking-wide">
          {pullDistance >= THRESHOLD ? "Release to refresh" : "Pull to refresh"}
        </span>
      </div>

      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isDragging ? "none" : "transform 0.2s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
