import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}
function tagMatch(xml: string, tag: string): RegExpMatchArray | null {
  return xml.match(new RegExp("<(?:[\\w.-]+:)?"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+tag+"\\s*>", "i"));
}
function readTag(xml: string, tag: string): string {
  const match = tagMatch(xml, tag);
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, " ")) : "";
}
function readBlock(xml: string, tag: string): string {
  return tagMatch(xml, tag)?.[1] || "";
}
function readAttr(xml: string, tag: string, attr: string): string {
  const match = xml.match(new RegExp("<(?:[\\w.-]+:)?"+tag+"\\b([^>]*)>", "i"));
  const value = match?.[1]?.match(new RegExp("\\b"+attr+"\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]", "i"));
  return value?.[1] || "";
}
function partyMetadata(xml: string, partyTag: string) {
  const block = readBlock(xml, partyTag);
  const party = readBlock(block, "Party") || block;
  const legal = readBlock(party, "PartyLegalEntity");
  const partyName = readBlock(party, "PartyName");
  const tax = readBlock(party, "PartyTaxScheme");
  const address = readBlock(party, "PostalAddress");
  const contact = readBlock(party, "Contact");
  const cif = readTag(tax, "CompanyID") || readTag(legal, "CompanyID") || readTag(party, "CompanyID");
  const street = [readTag(address, "StreetName"), readTag(address, "AdditionalStreetName")].filter(Boolean).join(" ");
  const locality = [readTag(address, "CityName"), readTag(address, "PostalZone"), readTag(address, "CountrySubentity")].filter(Boolean).join(", ");
  return {
    name: readTag(legal, "RegistrationName") || readTag(partyName, "Name") || readTag(legal, "CompanyName") || null,
    cif: cif.replace(/^RO/i, "") || null,
    address: [street, locality].filter(Boolean).join(", ") || null,
    reg_com: readTag(legal, "CompanyLegalForm") || null,
    email: readTag(contact, "ElectronicMail") || null,
    phone: readTag(contact, "Telephone") || null,
  };
}
function invoiceMetadata(xml: string) {
  const supplier = partyMetadata(xml, "AccountingSupplierParty");
  const customer = partyMetadata(xml, "AccountingCustomerParty");
  const legal = readBlock(xml, "LegalMonetaryTotal");
  const taxTotal = readBlock(xml, "TaxTotal");
  const lines = [...xml.matchAll(/<(?:[\\w.-]+:)?InvoiceLine\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?InvoiceLine\\s*>/gi)].map((match) => {
    const line = match[1], item = readBlock(line, "Item"), price = readBlock(line, "Price");
    const quantityMatch = line.match(/<(?:[\\w.-]+:)?InvoicedQuantity\\b([^>]*)>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?InvoicedQuantity\\s*>/i);
    const tax = readBlock(line, "TaxTotal");
    return {
      description: readTag(item, "Name") || readTag(item, "Description") || readTag(line, "Description") || "Articol",
      quantity: quantityMatch ? decodeXml(quantityMatch[2]) : "",
      unit: quantityMatch ? readAttr(quantityMatch[0], "InvoicedQuantity", "unitCode") : "",
      unit_price: readTag(price, "PriceAmount") || readTag(line, "PriceAmount"),
      line_total: readTag(line, "LineExtensionAmount"),
      tax_amount: readTag(tax, "TaxAmount"),
      tax_percent: readTag(readBlock(tax, "TaxSubtotal"), "Percent"),
    };
  });
  const currency = readTag(xml, "DocumentCurrencyCode") || "RON";
  const subtotal = readTag(legal, "TaxExclusiveAmount") || readTag(xml, "TaxExclusiveAmount");
  const taxAmount = readTag(taxTotal, "TaxAmount") || readTag(legal, "TaxAmount");
  const total = readTag(legal, "TaxInclusiveAmount") || readTag(xml, "TaxInclusiveAmount") || readTag(legal, "PayableAmount") || readTag(xml, "PayableAmount");
  const prepaid = readTag(legal, "PrepaidAmount") || readTag(xml, "PrepaidAmount");
  const payable = readTag(legal, "PayableAmount") || readTag(xml, "PayableAmount");
  const num = (value: string) => value ? Number(value.replace(",", ".")) : 0;
  return {
    supplier_name: supplier.name, supplier_cif: supplier.cif, supplier_address: supplier.address, supplier_reg_com: supplier.reg_com, supplier_email: supplier.email, supplier_phone: supplier.phone,
    customer_name: customer.name, customer_cif: customer.cif, customer_address: customer.address, customer_reg_com: customer.reg_com, customer_email: customer.email, customer_phone: customer.phone,
    invoice_number: readTag(xml, "ID") || null, invoice_date: readTag(xml, "IssueDate") || null, due_date: readTag(xml, "DueDate") || null, currency,
    invoice_total: total ? num(total) : null, subtotal: num(subtotal), tax_total: num(taxAmount), prepaid_total: num(prepaid), payable_amount: num(payable), lines,
  };
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
