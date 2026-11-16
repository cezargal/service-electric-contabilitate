import { NextRequest, NextResponse } from "next/server";
import { createDecipheriv } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

function decryptToken(value: string, keyHex: string) {
  const [ivPart, tagPart, dataPart] = value.split(".");
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32 || !ivPart || !tagPart || !dataPart) throw new Error("Configurația de criptare ANAF este invalidă.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

function extractXmlFromZip(zip: Buffer): string {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65558); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ANAF nu a returnat o arhivă ZIP validă.");
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
  if (!candidates.length) throw new Error("Arhiva ANAF nu conține fișier XML.");
  return candidates.find((x) => /<\s*(?:[\w.-]+:)?(?:Invoice|CreditNote|CrossIndustryInvoice)\b/i.test(x)) || candidates[0];
}

function xmlValue(xml: string, tag: string): string {
  const re = new RegExp("<(?:[\\w.-]+:)?"+tag+"\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+tag+"\\s*>","i");
  const match = xml.match(re);
  return (match?.[1] || "").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\\s+/g," ").trim();
}
function parseInvoice(xml: string) {
 const supplier = xml.match(/<(?:[\\w.-]+:)?AccountingSupplierParty\\b[\\s\\S]*?<\\/(?:[\\w.-]+:)?AccountingSupplierParty>/i)?.[0] || xml;
 const supplierName = xmlValue(supplier,"RegistrationName") || xmlValue(supplier,"Name");
 const supplierCif = xmlValue(supplier,"CompanyID");
 const invoiceNumber = xmlValue(xml,"ID");
 const invoiceDate = xmlValue(xml,"IssueDate");
 const dueDate = xmlValue(xml,"DueDate");
 const currency = xmlValue(xml,"DocumentCurrencyCode") || "RON";
 const total = Number((xmlValue(xml,"PayableAmount") || xmlValue(xml,"TaxInclusiveAmount") || "0").replace(",","."));
 const lines = [...xml.matchAll(/<(?:[\\w.-]+:)?InvoiceLine\\b[\\s\\S]*?<\\/(?:[\\w.-]+:)?InvoiceLine>/gi)].map(m=>({
   description: xmlValue(m[0],"Name") || xmlValue(m[0],"Description") || "Articol",
   quantity: xmlValue(m[0],"InvoicedQuantity"),
   unitPrice: xmlValue(m[0],"PriceAmount"),
   lineTotal: xmlValue(m[0],"LineExtensionAmount")
 }));
 return {supplierName,supplierCif,invoiceNumber,invoiceDate,dueDate,currency,total,lines};
}

export async function GET(request: NextRequest) {
  const cif = (request.nextUrl.searchParams.get("cif") || "").replace(/^RO/i, "").replace(/\D/g, "");
  const id = request.nextUrl.searchParams.get("id") || "";
  if (cif.length < 2 || !id) return NextResponse.json({ error: "Lipsesc CUI-ul sau identificatorul mesajului ANAF." }, { status: 400 });

  const storageSecret = process.env.ANAF_STORAGE_SECRET;
  const encryptionKey = process.env.ANAF_TOKEN_ENCRYPTION_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!storageSecret || !encryptionKey || !supabaseUrl || !supabaseAnonKey) return NextResponse.json({ error: "Lipsesc setările securizate pentru ANAF." }, { status: 500 });

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: rows, error: tokenError } = await supabase.rpc("get_anaf_oauth_tokens", { p_secret: storageSecret });
    if (tokenError || !rows?.[0]?.access_token_enc) return NextResponse.json({ error: "Autorizarea ANAF nu este disponibilă." }, { status: 401 });
    const accessToken = decryptToken(rows[0].access_token_enc, encryptionKey);
    const url = new URL("https://api.anaf.ro/prod/FCTEL/rest/descarcare");
    url.searchParams.set("id", id);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(30000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      const message = bytes.toString("utf8").slice(0, 600);
      console.error("ANAF invoice download failed", response.status, message.replace(/[\r\n]/g, " "));
      return NextResponse.json({ error: "ANAF nu a permis descărcarea acestui mesaj." }, { status: response.status });
    }
    const xml = extractXmlFromZip(bytes);
    const { data: saved, error: saveError } = await supabase.rpc("save_anaf_supplier_xml", {
      p_secret: storageSecret, p_cif: cif, p_message_id: id, p_xml: xml,
    });
    if (saveError || saved !== true) {
      console.error("ANAF XML save failed", saveError?.message || "message_not_found");
      return NextResponse.json({ error: "XML-ul a fost descărcat, dar nu a putut fi arhivat în aplicație." }, { status: 500 });
    }
    if (request.nextUrl.searchParams.get("view") === "1") {
      return NextResponse.json({ success: true, id, invoice: parseInvoice(xml), xml }, { headers: { "Cache-Control": "no-store" } });
    }
    return new NextResponse(xml, { headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="anaf-${id}.xml"`,
      "Cache-Control": "no-store",
    }});
  } catch (error: any) {
    console.error("ANAF invoice download error", error?.message || "unknown");
    return NextResponse.json({ error: error?.message || "Nu am putut descărca factura din ANAF." }, { status: 502 });
  }
}
