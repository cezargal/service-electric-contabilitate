import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Keep access to company-wide ANAF credentials limited to the account that
// already owns the Oblio import endpoint.
export const OWNER_USER_ID = "18bd609e-4ad7-4896-bb6a-b5a1358f7495";

export async function authorizeOwner(request: NextRequest): Promise<
  | { ok: true }
  | { ok: false; status: 401 | 403 | 500; error: string }
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: "Configurarea aplicației este incompletă." };
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { ok: false, status: 401, error: "Autentificare necesară." };

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, error: "Sesiunea aplicației a expirat. Autentifică-te din nou." };
  }
  if (data.user.id !== OWNER_USER_ID) {
    return { ok: false, status: 403, error: "Acces neautorizat." };
  }
  return { ok: true };
}
