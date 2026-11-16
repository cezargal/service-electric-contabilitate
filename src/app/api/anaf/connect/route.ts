import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = process.env.ANAF_CLIENT_ID;
  const redirectUri = process.env.ANAF_REDIRECT_URI;
  if (!clientId || !redirectUri || !process.env.ANAF_CLIENT_SECRET) {
    return NextResponse.json({ error: "Lipsesc setările OAuth ANAF din mediul Production." }, { status: 500 });
  }

  const state = randomBytes(32).toString("hex");
  const authorize = new URL("https://logincert.anaf.ro/anaf-oauth2/v1/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("token_content_type", "jwt");
  // ANAF cere ca scope și state să rămână necompletate în profilul OAuth.
  // State-ul este folosit aici doar pentru protecția CSRF a sesiunii aplicației.

  const response = NextResponse.redirect(authorize);
  response.cookies.set("anaf_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/anaf/callback",
    maxAge: 600,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
