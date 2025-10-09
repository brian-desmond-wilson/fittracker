"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Droplets } from "lucide-react";

export function AddWaterButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const addWater = async (amount: number) => {
    setLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not authenticated");

      await supabase.from("water_logs").insert({
        user_id: user.id,
        amount_ml: amount,
      });

      router.refresh();
    } catch (err) {
      console.error("Failed to add water:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={() => addWater(250)}
      disabled={loading}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
    >
      <Droplets className="w-5 h-5" />
      <span>+250ml</span>
    </button>
  );
}
