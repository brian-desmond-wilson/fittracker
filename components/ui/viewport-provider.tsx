"use client";

import { useEffect, useRef, useState } from "react";

export function ViewportProvider({ children }: { children: React.ReactNode }) {
  const initialHeightRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const focusResetTimeoutRef = useRef<number | null>(null);
  const keyboardVisibleRef = useRef(false);
  const editableFocusedRef = useRef(false);
  const lastOffsetRef = useRef(0);

  const applyKeyboardOffset = (rawOffset: number) => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    const shouldApplyOffset =
      rawOffset > 0 && (editableFocusedRef.current || keyboardVisibleRef.current);
    const clamped = shouldApplyOffset ? rawOffset : 0;

    root.style.setProperty("--app-keyboard-offset", `${clamped}px`);

    const shouldShow = clamped > 0;
    if (shouldShow && !keyboardVisibleRef.current) {
      keyboardVisibleRef.current = true;
      root.classList.add("keyboard-open");
      body.classList.add("keyboard-open");
    } else if (!shouldShow && keyboardVisibleRef.current) {
      keyboardVisibleRef.current = false;
      root.classList.remove("keyboard-open");
      body.classList.remove("keyboard-open");
    }

    if (typeof window !== "undefined" && lastOffsetRef.current !== clamped) {
      lastOffsetRef.current = clamped;
      window.dispatchEvent(
        new CustomEvent("app:keyboard-offset", {
          detail: { offset: clamped, active: shouldShow },
        })
      );
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const viewport = window.visualViewport;
    const root = document.documentElement;

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
      const keyboardOffset = keyboardDelta > keyboardThreshold ? keyboardDelta : 0;

      root.style.setProperty("--app-height", `${initialHeight}px`);
      applyKeyboardOffset(keyboardOffset);
    };

    const scheduleViewportUpdate = (delay = 0) => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(updateViewportVars, delay);
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
      focusResetTimeoutRef.current = window.setTimeout(() => {
        if (!editableFocusedRef.current) {
          applyKeyboardOffset(0);
        }
      }, 350);
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const vk = (navigator as any).virtualKeyboard;
    if (!vk) {
      return;
    }

    try {
      vk.overlaysContent = true;
    } catch (error) {
      console.debug("virtualKeyboard overlaysContent not supported", error);
    }

    const handleGeometryChange = () => {
      const rect =
        vk.boundingRect ??
        (vk as { geometry?: { height?: number } }).geometry ??
        { height: 0 };
      const keyboardHeight = rect?.height ?? 0;
      applyKeyboardOffset(keyboardHeight);
    };

    if (typeof vk.addEventListener === "function") {
      vk.addEventListener("geometrychange", handleGeometryChange);
    } else if ("ongeometrychange" in vk) {
      // @ts-expect-error legacy API
      vk.ongeometrychange = handleGeometryChange;
    }

    return () => {
      if (typeof vk.removeEventListener === "function") {
        vk.removeEventListener("geometrychange", handleGeometryChange);
      } else if ("ongeometrychange" in vk) {
        // @ts-expect-error legacy API
        vk.ongeometrychange = null;
      }
      applyKeyboardOffset(0);
    };
  }, []);

  return <>{children}</>;
}

type MetricSnapshot = {
  timestamp: number;
  innerHeight: number;
  clientHeight: number;
  visualViewportHeight: number | null;
  visualViewportOffsetTop: number | null;
  visualViewportOffsetBottom: number | null;
  rootAppHeight: string;
  rootKeyboardOffset: string;
  keyboardClass: boolean;
  navGap: number | null;
  navTransform: string | null;
};

const SHOW_VIEWPORT_OVERLAY =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_DEBUG_VIEWPORT === "true";

export function ViewportMetricsOverlay() {
  const [metrics, setMetrics] = useState<MetricSnapshot | null>(null);

  useEffect(() => {
    if (!SHOW_VIEWPORT_OVERLAY || typeof window === "undefined") {
      return;
    }

    const readSnapshot = (): MetricSnapshot => {
      const vv = window.visualViewport;
      const root = document.documentElement;
      const styles = getComputedStyle(root);
      const nav = document.querySelector<HTMLElement>('[data-nav-debug="bottom-nav"]');
      const navRect = nav ? nav.getBoundingClientRect() : null;

      return {
        timestamp: Date.now(),
        innerHeight: window.innerHeight,
        clientHeight: root.clientHeight,
        visualViewportHeight: vv ? Math.round(vv.height) : null,
        visualViewportOffsetTop: vv ? Math.round(vv.offsetTop) : null,
        visualViewportOffsetBottom: vv
          ? Math.round(vv.height + vv.offsetTop)
          : null,
        rootAppHeight: styles.getPropertyValue("--app-height"),
        rootKeyboardOffset: styles.getPropertyValue("--app-keyboard-offset"),
        keyboardClass: root.classList.contains("keyboard-open"),
        navGap:
          navRect !== null ? Math.round(window.innerHeight - navRect.bottom) : null,
        navTransform: nav?.dataset.debugTransform ?? null,
      };
    };

    const update = () => setMetrics(readSnapshot());

    const debouncedUpdate = () => {
      window.requestAnimationFrame(update);
    };

    update();

    window.addEventListener("resize", debouncedUpdate);
    window.addEventListener("orientationchange", debouncedUpdate);
    window.addEventListener("scroll", debouncedUpdate, true);
    window.addEventListener("focusin", debouncedUpdate);
    window.addEventListener("focusout", debouncedUpdate);
    window.addEventListener("app:keyboard-offset", debouncedUpdate as EventListener);
    window.visualViewport?.addEventListener("resize", debouncedUpdate);
    window.visualViewport?.addEventListener("scroll", debouncedUpdate);

    return () => {
      window.removeEventListener("resize", debouncedUpdate);
      window.removeEventListener("orientationchange", debouncedUpdate);
      window.removeEventListener("scroll", debouncedUpdate, true);
      window.removeEventListener("focusin", debouncedUpdate);
      window.removeEventListener("focusout", debouncedUpdate);
      window.removeEventListener("app:keyboard-offset", debouncedUpdate as EventListener);
      window.visualViewport?.removeEventListener("resize", debouncedUpdate);
      window.visualViewport?.removeEventListener("scroll", debouncedUpdate);
    };
  }, []);

  if (!SHOW_VIEWPORT_OVERLAY || metrics === null) {
    return null;
  }

  const {
    innerHeight,
    clientHeight,
    visualViewportHeight,
    visualViewportOffsetTop,
    visualViewportOffsetBottom,
    rootAppHeight,
    rootKeyboardOffset,
    keyboardClass,
    navGap,
    navTransform,
  } = metrics;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 140,
        right: 16,
        zIndex: 10000,
        background: "rgba(12, 15, 20, 0.85)",
        color: "#e2e8f0",
        padding: "12px 16px",
        borderRadius: 12,
        fontSize: 12,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        maxWidth: 260,
        backdropFilter: "blur(12px)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, letterSpacing: "0.02em" }}>
        Viewport Metrics
      </div>
      <div style={{ display: "grid", gap: 4, lineHeight: 1.3 }}>
        <MetricLine label="innerHeight" value={`${innerHeight}px`} />
        <MetricLine label="clientHeight" value={`${clientHeight}px`} />
        <MetricLine
          label="vv.height"
          value={
            visualViewportHeight !== null ? `${visualViewportHeight}px` : "null"
          }
        />
        <MetricLine
          label="vv.offsetTop"
          value={
            visualViewportOffsetTop !== null
              ? `${visualViewportOffsetTop}px`
              : "null"
          }
        />
        <MetricLine
          label="vv.bottom"
          value={
            visualViewportOffsetBottom !== null
              ? `${visualViewportOffsetBottom}px`
              : "null"
          }
        />
        <MetricLine label="--app-height" value={rootAppHeight || "(unset)"} />
        <MetricLine
          label="--app-keyboard-offset"
          value={rootKeyboardOffset || "(unset)"}
        />
        <MetricLine
          label="keyboard-open class"
          value={keyboardClass ? "true" : "false"}
        />
        <MetricLine
          label="nav gap"
          value={
            navGap !== null
              ? `${navGap}px`
              : "n/a"
          }
        />
        <MetricLine
          label="nav transform"
          value={navTransform ?? "none"}
        />
      </div>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value.trim()}</span>
    </div>
  );
}
