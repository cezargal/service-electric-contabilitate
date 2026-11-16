import { NextRequest, NextResponse } from "next/server";
import { createCipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encryptToken(token: string, keyHex: string) {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("Cheia de criptare ANAF trebuie să aibă 32 de octeți.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}


function page(message: string, ok = false) {
  const safe = message.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return new NextResponse(
    `<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectare ANAF</title><body style="font:16px system-ui;background:#f3f6fa;padding:32px;color:#172033"><main style="max-width:560px;margin:8vh auto;background:white;padding:32px;border-radius:18px;box-shadow:0 12px 40px #17203318"><h1 style="margin-top:0">${ok ? "Conectare ANAF reușită" : "Conectarea ANAF nu a fost finalizată"}</h1><p>${safe}</p><a href="/" style="display:inline-block;margin-top:12px;color:#155eef">Înapoi în aplicație</a></main></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const expectedState = request.cookies.get("anaf_oauth_state")?.value;
  const code = request.nextUrl.searchParams.get("code");
  const anafError = request.nextUrl.searchParams.get("error");

  const clearCookie = (response: NextResponse) => {
    response.cookies.set("anaf_oauth_state", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/anaf/callback", maxAge: 0 });
    return response;
  };

  if (anafError) return clearCookie(page("ANAF a refuzat autorizarea. " + (request.nextUrl.searchParams.get("error_description") || anafError)));
  if (!expectedState) {
    return clearCookie(page("Sesiunea de autorizare a expirat sau nu este validă. Reia conectarea din aplicație."));
  }
  if (!code) return clearCookie(page("ANAF nu a returnat codul de autorizare. Reia conectarea."));

  const clientId = process.env.ANAF_CLIENT_ID;
  const clientSecret = process.env.ANAF_CLIENT_SECRET;
  const redirectUri = process.env.ANAF_REDIRECT_URI;
  const storageSecret = process.env.ANAF_STORAGE_SECRET;
  const encryptionKey = process.env.ANAF_TOKEN_ENCRYPTION_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!clientId || !clientSecret || !redirectUri || !storageSecret || !encryptionKey || !supabaseUrl || !supabaseAnonKey) {
    return clearCookie(page("Lipsesc setări securizate necesare pentru salvarea tokenurilor. Contactează administratorul aplicației."));
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      token_content_type: "jwt",
    });
    const tokenResponse = await fetch("https://logincert.anaf.ro/anaf-oauth2/v1/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token || !tokenData.refresh_token) {
      console.error("ANAF token exchange failed", tokenResponse.status, tokenData.error || "invalid_token_response");
      return clearCookie(page("ANAF nu a emis tokenurile. Verifică dacă aplicația este înrolată pentru E-Factura și dacă URL-ul de revenire coincide exact cu cel înregistrat."));
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 7776000) * 1000).toISOString();
    const { error } = await supabase.rpc("save_anaf_oauth_tokens", {
      p_secret: storageSecret,
      p_access_token_enc: encryptToken(tokenData.access_token, encryptionKey),
      p_refresh_token_enc: encryptToken(tokenData.refresh_token, encryptionKey),
      p_token_type: tokenData.token_type || "Bearer",
      p_scope: tokenData.scope || null,
      p_expires_at: expiresAt,
    });
    if (error) {
      console.error("ANAF token storage failed", error.message);
      return clearCookie(page("Autorizarea a reușit, dar salvarea securizată a tokenurilor a eșuat. Nu închide pagina; contactează administratorul."));
    }
    return clearCookie(page("Certificatul a fost acceptat, iar tokenurile ANAF au fost salvate criptat. Următorul pas este activarea importului facturilor furnizorilor.", true));
  } catch (error) {
    console.error("ANAF OAuth callback error", error);
    return clearCookie(page("A apărut o eroare la conectarea cu ANAF. Reia conectarea; dacă problema persistă, verificăm jurnalul tehnic."));
  }
}
