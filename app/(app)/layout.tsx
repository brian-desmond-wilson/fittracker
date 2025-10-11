import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/nav/bottom-nav";
import { PageTransition } from "@/components/ui/page-transition";
import { ViewportProvider } from "@/components/ui/viewport-provider";
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
      <div className="min-h-screen bg-gray-950 pb-20">
        <PullToRefresh>
          <PageTransition>{children}</PageTransition>
        </PullToRefresh>
        <BottomNav />
      </div>
    </ViewportProvider>
  );
}
