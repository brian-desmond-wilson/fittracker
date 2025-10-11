"use client";

import { useEffect, useRef } from "react";

export function ViewportProvider({ children }: { children: React.ReactNode }) {
  const initialHeightRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const viewport = window.visualViewport;

    const updateViewportVars = () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      const baseInnerHeight = window.innerHeight;
      if (
        initialHeightRef.current === null ||
        baseInnerHeight > initialHeightRef.current
      ) {
        initialHeightRef.current = baseInnerHeight;
      }

      const initialHeight = initialHeightRef.current ?? baseInnerHeight;

      const viewportHeight = viewport
        ? viewport.height + viewport.offsetTop
        : baseInnerHeight;

      const keyboardDelta = initialHeight - viewportHeight;
      const keyboardThreshold = 80;
      const keyboardOffset =
        keyboardDelta > keyboardThreshold ? keyboardDelta : 0;

      const root = document.documentElement;
      root.style.setProperty("--app-height", `${initialHeight}px`);
      root.style.setProperty("--app-keyboard-offset", `${keyboardOffset}px`);
    };

    const scheduleViewportUpdate = (delay = 0) => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(updateViewportVars, delay);
    };

    scheduleViewportUpdate();

    window.addEventListener("resize", () => scheduleViewportUpdate());
    window.addEventListener("orientationchange", () => scheduleViewportUpdate(200));
    viewport?.addEventListener("resize", () => scheduleViewportUpdate());
    viewport?.addEventListener("scroll", () => scheduleViewportUpdate());
    document.addEventListener("focusin", () => scheduleViewportUpdate());
    document.addEventListener("focusout", () => scheduleViewportUpdate(200));

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      window.removeEventListener("resize", () => scheduleViewportUpdate());
      window.removeEventListener("orientationchange", () => scheduleViewportUpdate(200));
      viewport?.removeEventListener("resize", () => scheduleViewportUpdate());
      viewport?.removeEventListener("scroll", () => scheduleViewportUpdate());
      document.removeEventListener("focusin", () => scheduleViewportUpdate());
      document.removeEventListener("focusout", () => scheduleViewportUpdate(200));
    };
  }, []);

  return <>{children}</>;
}
