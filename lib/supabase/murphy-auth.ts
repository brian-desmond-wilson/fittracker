import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

export interface MurphyContext {
  supabase: ReturnType<typeof createClient>;
  userId: string;
}

export class MurphyAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "MurphyAuthError";
  }
}

/**
 * Authenticate Murphy API requests using service key + user_id
 * 
 * Requires:
 * - Authorization header with service key: "Bearer <service_role_key>"
 * - user_id query parameter
 */
export async function requireMurphyAuth(request: Request): Promise<MurphyContext> {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new MurphyAuthError("Missing or invalid authorization header", 401);
  }

  const providedKey = authHeader.replace("Bearer ", "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey || providedKey !== serviceKey) {
    throw new MurphyAuthError("Invalid service key", 401);
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  if (!userId) {
    throw new MurphyAuthError("Missing user_id parameter", 400);
  }

  // Create admin client with service key
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  return { supabase, userId };
}
