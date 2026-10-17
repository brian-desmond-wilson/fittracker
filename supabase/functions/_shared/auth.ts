// supabase/functions/_shared/auth.ts
// Who is calling. verify_jwt on a function only proves the caller holds a JWT
// the project signed — and the app ships the anon key, which is one. So a
// function that spends on a paid API (OpenAI, Gemini, Google CSE) must also
// confirm the token belongs to a signed-in user. The service-role key itself
// is accepted too: the agent gateway and operational scripts call with it,
// and its holders already have full database access.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type Caller = { kind: 'user'; userId: string } | { kind: 'service' };

/** The verified caller, or null when the request carries no valid user token. */
export async function resolveCaller(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && token === serviceKey) return { kind: 'service' };
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return null;
  return { kind: 'user', userId: data.user.id };
}
