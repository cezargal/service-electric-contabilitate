import { NextRequest, NextResponse } from "next/server";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const api = "https://api.anaf.ro/prod/FCTEL/rest";
const oauthTokenUrl = "https://logincert.anaf.ro/anaf-oauth2/v1/token";

function encryptToken(value: string, keyHex: string) {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("Invalid ANAF encryption key.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptToken(value: string, keyHex: string) {
  const [ivPart, tagPart, dataPart] = value.split(".");
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32 || !ivPart || !tagPart || !dataPart) throw new Error("Invalid encrypted ANAF token.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

function extractXmlFromZip(zip: Buffer): string {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65558); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ANAF returned an invalid ZIP.");
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const candidates: string[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) break;
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name.toLowerCase().endsWith(".xml")) {
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = zip.subarray(dataStart, dataStart + compressedSize);
      const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (data) candidates.push(data.toString("utf8"));
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (!candidates.length) throw new Error("ANAF archive has no XML.");
  return candidates.find((x) => /<\s*(?:[\w.-]+:)?(?:Invoice|CreditNote|CrossIndustryInvoice)\b/i.test(x)) || candidates[0];
}

async function getAccessToken(supabase: any, storageSecret: string, encryptionKey: string) {
  const { data: rows, error } = await supabase.rpc("get_anaf_oauth_tokens", { p_secret: storageSecret });
  if (error || !rows?.[0]?.access_token_enc || !rows?.[0]?.refresh_token_enc) throw new Error("Autorizarea ANAF nu este disponibilă.");
  const saved = rows[0];
  const expiresAt = saved.expires_at ? new Date(saved.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 5 * 60 * 1000) return decryptToken(saved.access_token_enc, encryptionKey);

  const clientId = process.env.ANAF_CLIENT_ID;
  const clientSecret = process.env.ANAF_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Lipsesc credențialele OAuth ANAF pentru reînnoirea automată.");
  const refreshToken = decryptToken(saved.refresh_token_enc, encryptionKey);
  const response = await fetch(oauthTokenUrl, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, token_content_type: "jwt" }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const tokenData = await response.json().catch(() => ({}));
  if (!response.ok || !tokenData.access_token) throw new Error("ANAF nu a putut reînnoi autorizarea. Reconectează certificatul în aplicație.");
  const nextRefreshToken = tokenData.refresh_token || refreshToken;
  const expires = new Date(Date.now() + Number(tokenData.expires_in || 7776000) * 1000).toISOString();
  const { error: saveError } = await supabase.rpc("save_anaf_oauth_tokens", {
    p_secret: storageSecret,
    p_access_token_enc: encryptToken(String(tokenData.access_token), encryptionKey),
    p_refresh_token_enc: encryptToken(nextRefreshToken, encryptionKey),
    p_token_type: tokenData.token_type || saved.token_type || "Bearer",
    p_scope: tokenData.scope || saved.scope || null,
    p_expires_at: expires,
  });
  if (saveError) throw new Error("Tokenul ANAF a fost reînnoit, dar nu a putut fi salvat securizat.");
  return String(tokenData.access_token);
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== "Bearer " + cronSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const storageSecret = process.env.ANAF_STORAGE_SECRET;
  const encryptionKey = process.env.ANAF_TOKEN_ENCRYPTION_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!storageSecret || !encryptionKey || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "ANAF sync configuration is incomplete." }, { status: 500 });
  }

  const cif = String(process.env.ANAF_SYNC_CIF || "43594993").replace(/^RO/i, "").replace(/\D/g, "");
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const accessToken = await getAccessToken(supabase, storageSecret, encryptionKey);
    const listUrl = new URL(api + "/listaMesajeFactura");
    listUrl.searchParams.set("zile", "60");
    listUrl.searchParams.set("cif", cif);
    listUrl.searchParams.set("filtru", "P");
    const listResponse = await fetch(listUrl, {
      headers: { Authorization: "Bearer " + accessToken, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const payload = await listResponse.json().catch(() => ({}));
    if (!listResponse.ok || payload?.eroare) throw new Error(payload?.eroare || "ANAF nu a returnat lista facturilor.");
    const messages = Array.isArray(payload) ? payload : [payload.mesaje,payload.mesajeFactura,payload.listaMesaje,payload.messages,payload.data].find(Array.isArray) || [];

    if (messages.length) {
      const { error } = await supabase.rpc("save_anaf_supplier_messages", { p_secret: storageSecret, p_cif: cif, p_messages: messages });
      if (error) throw new Error("Mesajele ANAF au fost primite, dar nu au putut fi arhivate.");
    }

    const { data: archive, error: archiveError } = await supabase.rpc("list_anaf_supplier_archive", { p_secret: storageSecret, p_cif: cif });
    if (archiveError) throw new Error("Nu am putut verifica arhiva SPV.");
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const pending = (Array.isArray(archive) ? archive : [])
      .filter((doc: any) => !doc.has_xml && doc.anaf_message_id && (!doc.created_at_anaf || new Date(doc.created_at_anaf).getTime() >= cutoff))
      .sort((a: any, b: any) => new Date(b.created_at_anaf || 0).getTime() - new Date(a.created_at_anaf || 0).getTime())
      .slice(0, 12);

    let archived = 0;
    const failures: string[] = [];
    for (const doc of pending) {
      try {
        const downloadUrl = new URL(api + "/descarcare");
        downloadUrl.searchParams.set("id", String(doc.anaf_message_id));
        const download = await fetch(downloadUrl, {
          headers: { Authorization: "Bearer " + accessToken, Accept: "application/octet-stream" },
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
        if (!download.ok) throw new Error("HTTP " + download.status);
        const xml = extractXmlFromZip(Buffer.from(await download.arrayBuffer()));
        const { data: saved, error } = await supabase.rpc("save_anaf_supplier_xml", {
          p_secret: storageSecret, p_cif: cif, p_message_id: String(doc.anaf_message_id), p_xml: xml,
        });
        if (error || saved !== true) throw new Error("XML-ul nu a putut fi arhivat.");
        archived++;
      } catch (error: any) {
        failures.push(String(doc.anaf_message_id) + ": " + (error?.message || "eroare"));
      }
    }

    return NextResponse.json({
      success: true,
      cif,
      messages: messages.length,
      xmlArchived: archived,
      xmlPending: Math.max(0, pending.length - archived),
      errors: failures,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Scheduled ANAF sync failed", error?.message || "unknown");
    return NextResponse.json({ error: error?.message || "Sincronizarea zilnică ANAF a eșuat." }, { status: 502 });
  }
}
