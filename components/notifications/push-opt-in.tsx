"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Bell, BellOff } from "lucide-react";
import { urlBase64ToUint8Array } from "@/lib/push/client";
import { cn } from "@/lib/utils";

type SubscriptionStatus = "idle" | "subscribed" | "unsubscribed" | "unsupported" | "denied";

interface PushOptInProps {
  className?: string;
}

export function PushOptIn({ className }: PushOptInProps) {
  const [status, setStatus] = useState<SubscriptionStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const publicKey = process.env.NEXT_PUBLIC_PUSH_PUBLIC_KEY ?? "";

  const swPath = useMemo(() => `${basePath}/sw.js`, [basePath]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    setStatus(Notification.permission === "granted" ? "subscribed" : "unsubscribed");

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (subscription) {
          setStatus("subscribed");
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const sendSubscription = useCallback(async (subscription: PushSubscription) => {
    const response = await fetch("/app2/api/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });

    if (!response.ok) {
      const { error: message } = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(message || "Failed to save subscription");
    }
  }, []);

  const removeSubscription = useCallback(async (subscription: PushSubscription) => {
    const response = await fetch("/app2/api/push-subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    if (!response.ok) {
      const { error: message } = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(message || "Failed to remove subscription");
    }
  }, []);

  const ensureServiceWorker = useCallback(async () => {
    const registration = await navigator.serviceWorker.register(swPath, { scope: `${basePath}/` });
    return registration;
  }, [swPath, basePath]);

  const handleSubscribe = useCallback(async () => {
    if (!publicKey) {
      setError("Push key is not configured.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const registration = await ensureServiceWorker();

      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setStatus("denied");
        setLoading(false);
        return;
      }

      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe().catch(() => undefined);
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await sendSubscription(subscription);
      setStatus("subscribed");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to enable notifications");
    } finally {
      setLoading(false);
    }
  }, [ensureServiceWorker, publicKey, sendSubscription]);

  const handleUnsubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await removeSubscription(subscription);
        await subscription.unsubscribe().catch(() => undefined);
      }

      setStatus("unsubscribed");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to disable notifications");
    } finally {
      setLoading(false);
    }
  }, [removeSubscription]);

  const renderActionButton = () => {
    if (status === "unsupported") {
      return <p className="text-sm text-gray-500">Notifications aren&apos;t supported on this device.</p>;
    }

    if (status === "denied") {
      return (
        <p className="text-sm text-red-400">
          Notifications are blocked. Enable them in Settings &gt; Safari &gt; Notifications.
        </p>
      );
    }

    const buttonProps = status === "subscribed"
      ? { onClick: handleUnsubscribe, label: "Disable notifications", icon: <BellOff className="w-4 h-4" /> }
      : { onClick: handleSubscribe, label: "Enable notifications", icon: <Bell className="w-4 h-4" /> };

    return (
      <button
        onClick={buttonProps.onClick}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors",
          status === "subscribed"
            ? "border-red-500/60 text-red-300 hover:bg-red-500/10"
            : "border-primary/60 text-primary hover:bg-primary/10",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : buttonProps.icon}
        <span className="text-sm font-semibold">{loading ? "Processing..." : buttonProps.label}</span>
      </button>
    );
  };

  return (
    <div className={cn("rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Event reminders</h3>
          <p className="text-xs text-gray-400 mt-1">
            Receive a push notification on your devices at the moment a scheduled event begins.
          </p>
        </div>
        {renderActionButton()}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
