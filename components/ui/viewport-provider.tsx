"use client";

import { useEffect, useRef } from "react";

export function ViewportProvider({ children }: { children: React.ReactNode }) {
  const initialHeightRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const viewport = window.visualViewport;

    const updateViewportVars = () => {
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

    updateViewportVars();

    window.addEventListener("resize", updateViewportVars);
    viewport?.addEventListener("resize", updateViewportVars);
    viewport?.addEventListener("scroll", updateViewportVars);

    return () => {
      window.removeEventListener("resize", updateViewportVars);
      viewport?.removeEventListener("resize", updateViewportVars);
      viewport?.removeEventListener("scroll", updateViewportVars);
    };
  }, []);

  return <>{children}</>;
}
