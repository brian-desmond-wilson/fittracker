"use client";

import { useEffect, useRef } from "react";

export function ViewportProvider({ children }: { children: React.ReactNode }) {
  const initialHeightRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const focusResetTimeoutRef = useRef<number | null>(null);

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

    const resetOffsetIfNoFocus = () => {
      const active = document.activeElement;
      if (!active || active === document.body) {
        document.documentElement.style.setProperty("--app-keyboard-offset", "0px");
      }
    };

    scheduleViewportUpdate();

    const handleWindowResize = () => scheduleViewportUpdate();
    const handleOrientationChange = () => scheduleViewportUpdate(200);
    const handleViewportResize = () => scheduleViewportUpdate();
    const handleViewportScroll = () => scheduleViewportUpdate();
    const handleFocusIn = () => scheduleViewportUpdate();
    const handleFocusOut = () => {
      scheduleViewportUpdate(200);
      if (focusResetTimeoutRef.current) {
        window.clearTimeout(focusResetTimeoutRef.current);
      }
      focusResetTimeoutRef.current = window.setTimeout(resetOffsetIfNoFocus, 350);
    };

    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    viewport?.addEventListener("resize", handleViewportResize);
    viewport?.addEventListener("scroll", handleViewportScroll);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      if (focusResetTimeoutRef.current) {
        window.clearTimeout(focusResetTimeoutRef.current);
      }
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      viewport?.removeEventListener("resize", handleViewportResize);
      viewport?.removeEventListener("scroll", handleViewportScroll);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  return <>{children}</>;
}
