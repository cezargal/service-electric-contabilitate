import { NextRequest, NextResponse } from "next/server";
import { createDecipheriv } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function decryptToken(value: string, keyHex: string) {
  const [ivPart, tagPart, dataPart] = value.split(".");
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32 || !ivPart || !tagPart || !dataPart) throw new Error("Configurația de criptare ANAF este invalidă.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

function extractMessages(data: any): any[] {
  if (Array.isArray(data)) return data;
  for (const key of ["mesaje", "mesajeFactura", "listaMesaje", "messages", "data"]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

export async function GET(request: NextRequest) {
  const cif = (request.nextUrl.searchParams.get("cif") || "").replace(/^RO/i, "").replace(/\D/g, "");
  const days = Math.min(60, Math.max(1, Number(request.nextUrl.searchParams.get("days") || 30)));
  if (cif.length < 2) return NextResponse.json({ error: "Introdu CUI-ul întreprinderii." }, { status: 400 });

  const storageSecret = process.env.ANAF_STORAGE_SECRET;
  const encryptionKey = process.env.ANAF_TOKEN_ENCRYPTION_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!storageSecret || !encryptionKey || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Lipsesc setările securizate pentru ANAF." }, { status: 500 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: rows, error: tokenError } = await supabase.rpc("get_anaf_oauth_tokens", { p_secret: storageSecret });
    if (tokenError || !rows?.[0]?.access_token_enc) {
      console.error("ANAF token read failed", tokenError?.message || "missing_token");
      return NextResponse.json({ error: "Nu există o autorizare ANAF activă. Reconectează certificatul." }, { status: 401 });
    }

    const accessToken = decryptToken(rows[0].access_token_enc, encryptionKey);
    const url = new URL("https://api.anaf.ro/prod/FCTEL/rest/listaMesajeFactura");
    url.searchParams.set("zile", String(days));
    url.searchParams.set("cif", cif);
    url.searchParams.set("filtru", "P");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const responseText = await response.text();
    let payload: any;
    try { payload = JSON.parse(responseText); } catch { payload = { raw: responseText.slice(0, 1000) }; }
    if (!response.ok || payload?.eroare) {
      console.error("ANAF supplier message list failed", response.status, payload?.eroare || payload?.message || "api_error");
      return NextResponse.json({ error: payload?.eroare || payload?.message || `ANAF a răspuns cu HTTP ${response.status}.` }, { status: response.status >= 400 ? response.status : 502 });
    }

    const messages = extractMessages(payload);
    if (messages.length) {
      const { error: saveError } = await supabase.rpc("save_anaf_supplier_messages", {
        p_secret: storageSecret, p_cif: cif, p_messages: messages,
      });
      if (saveError) {
        console.error("ANAF supplier messages save failed", saveError.message);
        return NextResponse.json({ error: "ANAF a returnat facturi, dar salvarea listei în aplicație a eșuat." }, { status: 500 });
      }
    }
    return NextResponse.json({
      success: true,
      cif,
      days,
      count: messages.length,
      messages: messages.map((m) => ({
        id: String(m.id_descarcare ?? m.id ?? m.id_solicitare ?? ""),
        date: m.data_creare ?? null,
        type: m.tip ?? "",
        supplierCif: m.cif_emitent ?? "",
        buyerCif: m.cif_beneficiar ?? "",
        details: m.detalii ?? "",
      })),
    });
  } catch (error: any) {
    console.error("ANAF supplier messages error", error?.message || "unknown");
    return NextResponse.json({ error: "Nu am putut comunica cu ANAF. Verifică jurnalul tehnic al aplicației." }, { status: 502 });
  }
}
