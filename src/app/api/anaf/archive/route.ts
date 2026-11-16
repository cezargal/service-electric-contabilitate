import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


function readTag(xml: string, tag: string): string {
  const pattern = new RegExp("<(?:[\\w.-]+:)?" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?" + tag + "\\s*>", "i");
  return (xml.match(pattern)?.[1] || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
function invoiceMetadata(xml: string) {
  const supplier = xml.match(/<(?:[\w.-]+:)?AccountingSupplierParty\b[\s\S]*?<\/(?:[\w.-]+:)?AccountingSupplierParty>/i)?.[0] || xml;
  const amount = readTag(xml, "TaxInclusiveAmount") || readTag(xml, "PayableAmount");
  const payable = readTag(xml, "PayableAmount");
  const prepaid = readTag(xml, "PrepaidAmount");
  const tax = readTag(xml, "TaxAmount");
  const subtotal = readTag(xml, "TaxExclusiveAmount");
  const lines = [...xml.matchAll(/<(?:[\\w.-]+:)?InvoiceLine\\b[\\s\\S]*?<\\/(?:[\\w.-]+:)?InvoiceLine>/gi)].map((m) => ({
    description: readTag(m[0], "Name") || readTag(m[0], "Description") || "Articol",
    quantity: readTag(m[0], "InvoicedQuantity"),
    unit_price: readTag(m[0], "PriceAmount"),
    line_total: readTag(m[0], "LineExtensionAmount"),
    unit: (m[0].match(/InvoicedQuantity[^>]*unitCode="([^"]+)"/i) || [])[1] || ""
  }));
  const customer = xml.match(/<(?:[\\w.-]+:)?AccountingCustomerParty\\b[\\s\\S]*?<\\/(?:[\\w.-]+:)?AccountingCustomerParty>/i)?.[0] || "";
  const supplierAddress = readTag(supplier, "StreetName");
  const customerAddress = readTag(customer, "StreetName");
  const num = (v: string) => v ? Number(v.replace(",", ".")) : 0;
  return { supplier_name: readTag(supplier, "RegistrationName") || readTag(supplier, "Name") || null, supplier_cif: readTag(supplier, "CompanyID") || null, supplier_address: supplierAddress, customer_name: readTag(customer, "RegistrationName") || null, customer_cif: readTag(customer, "CompanyID") || null, customer_address: customerAddress, invoice_number: readTag(xml, "ID") || null, invoice_date: readTag(xml, "IssueDate") || null, due_date: readTag(xml, "DueDate") || null, currency: readTag(xml, "DocumentCurrencyCode") || "RON", invoice_total: amount ? num(amount) : null, subtotal: num(subtotal), tax_total: num(tax), prepaid_total: num(prepaid), payable_amount: num(payable), lines };
}

async function getAuthorizedClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.ANAF_STORAGE_SECRET;
  const header = request.headers.get("authorization") || "";
  const access = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!url || !key || !secret || !access) throw new Error("Autentificare necesară.");
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${access}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(access);
  if (error || !data.user) throw new Error("Sesiunea aplicației a expirat. Autentifică-te din nou.");
  return { client, secret };
}

export async function GET(request: NextRequest) {
  try {
    const { client, secret } = await getAuthorizedClient(request);
    const id = request.nextUrl.searchParams.get("id");
    const cif = (request.nextUrl.searchParams.get("cif") || "").replace(/^RO/i, "").replace(/\D/g, "");
    if (id) {
      if (!cif) return NextResponse.json({ error: "Lipsește CUI-ul documentului." }, { status: 400 });
      const { data, error } = await client.rpc("get_anaf_supplier_archive_xml", {
        p_secret: secret, p_cif: cif, p_message_id: id,
      });
      if (error || !data) return NextResponse.json({ error: "Documentul XML nu a fost găsit în arhivă." }, { status: 404 });
      const xml = String(data);
      if (request.nextUrl.searchParams.get("view") === "1") {
        return NextResponse.json({ success: true, id, xml, invoice: invoiceMetadata(xml) }, { headers: { "Cache-Control": "no-store" } });
      }
      return new NextResponse(xml, { headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="SPV-${id}.xml"`,
        "Cache-Control": "no-store",
      }});
    }
    const { data, error } = await client.rpc("list_anaf_supplier_archive", {
      p_secret: secret, p_cif: cif || null,
    });
    if (error) throw error;
    const documents = await Promise.all((data || []).map(async (doc: any) => { if (!doc.has_xml) return doc; const { data: xml, error: xmlError } = await client.rpc("get_anaf_supplier_archive_xml", { p_secret: secret, p_cif: String(doc.cif || "").replace(/\D/g, ""), p_message_id: String(doc.anaf_message_id || "") }); if (xmlError || !xml) return doc; return { ...doc, ...invoiceMetadata(String(xml)) }; }));
    return NextResponse.json({ success: true, documents }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Nu am putut accesa arhiva SPV." }, { status: 401 });
  }
}
