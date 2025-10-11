import { createClient } from "./server";

export interface AdminContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
}

export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AdminAuthError("Unauthorized", 401);
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (error) {
    throw new AdminAuthError("Failed to verify admin status", 500);
  }

  if (!profile?.is_admin) {
    throw new AdminAuthError("Forbidden", 403);
  }

  return { supabase, user };
}

export class AdminAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "AdminAuthError";
  }
}
