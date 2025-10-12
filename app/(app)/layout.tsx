import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/bottom-nav";
import { PageTransition } from "@/components/ui/page-transition";
import {
  ViewportMetricsOverlay,
  ViewportProvider,
} from "@/components/ui/viewport-provider";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ViewportProvider>
      <div
        className="app-shell bg-gray-950"
        style={{
          paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <PullToRefresh>
          <PageTransition>{children}</PageTransition>
        </PullToRefresh>
      </div>
      <ViewportMetricsOverlay />
      <BottomNav />
    </ViewportProvider>
  );
}
