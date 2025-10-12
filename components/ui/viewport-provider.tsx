"use client";

import { useEffect, useRef } from "react";

export function ViewportProvider({ children }: { children: React.ReactNode }) {
  const initialHeightRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const focusResetTimeoutRef = useRef<number | null>(null);
  const keyboardVisibleRef = useRef(false);
  const editableFocusedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const viewport = window.visualViewport;

    const applyKeyboardOffset = (rawOffset: number) => {
      const root = document.documentElement;
      const body = document.body;

      const shouldApply =
        rawOffset > 0 && (editableFocusedRef.current || keyboardVisibleRef.current);
      const clamped = shouldApply ? rawOffset : 0;

      root.style.setProperty("--app-keyboard-offset", `${clamped}px`);

      if (clamped > 0) {
        keyboardVisibleRef.current = true;
        root.classList.add("keyboard-open");
        body.classList.add("keyboard-open");
      } else {
        keyboardVisibleRef.current = false;
        root.classList.remove("keyboard-open");
        body.classList.remove("keyboard-open");
      }
    };

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
      const viewportHeight = viewport ? viewport.height : baseInnerHeight;
      const keyboardDelta = initialHeight - viewportHeight;
      const keyboardThreshold = 40;
      const keyboardOffset =
        keyboardDelta > keyboardThreshold ? keyboardDelta : 0;

      document.documentElement.style.setProperty(
        "--app-height",
        `${initialHeight}px`
      );
      applyKeyboardOffset(keyboardOffset);
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
        applyKeyboardOffset(0);
      }
    };

    scheduleViewportUpdate();

    const handleWindowResize = () => scheduleViewportUpdate();
    const handleOrientationChange = () => scheduleViewportUpdate(200);
    const handleViewportResize = () => scheduleViewportUpdate();
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable ||
          target.getAttribute("role") === "textbox");

      editableFocusedRef.current = isEditable;
      scheduleViewportUpdate();
    };
    const handleFocusOut = () => {
      editableFocusedRef.current = false;
      scheduleViewportUpdate(200);
      if (focusResetTimeoutRef.current) {
        window.clearTimeout(focusResetTimeoutRef.current);
      }
      focusResetTimeoutRef.current = window.setTimeout(resetOffsetIfNoFocus, 350);
    };

    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    viewport?.addEventListener("resize", handleViewportResize);
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
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      applyKeyboardOffset(0);
    };
  }, []);

  return <>{children}</>;
}
