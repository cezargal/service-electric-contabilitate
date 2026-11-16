import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const storageSecret = process.env.ANAF_STORAGE_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization") || "";
  const access = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!storageSecret || !supabaseUrl || !supabaseAnonKey || !access) return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${access}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: authError } = await supabase.auth.getUser(access);
  if (authError || !userData.user) return NextResponse.json({ error: "Sesiunea aplicației a expirat. Autentifică-te din nou." }, { status: 401 });
  try {
    const body = await request.json();
    const cif = String(body.cif || "").replace(/^RO/i, "").replace(/\\D/g, "");
    const id = String(body.id || "");
    const inv = body.invoice || {};
    if (cif.length < 2 || !id || !inv.total || Number(inv.total) <= 0) return NextResponse.json({ error: "Datele facturii sunt incomplete." }, { status: 400 });
    const { data, error } = await supabase.rpc("import_anaf_supplier_invoice_to_rjip", {
      p_secret: storageSecret,
      p_cif: cif,
      p_message_id: id,
      p_invoice_number: String(inv.invoiceNumber || ""),
      p_invoice_series: "",
      p_invoice_date: inv.invoiceDate || null,
      p_supplier: String(inv.supplierName || "Furnizor ANAF"),
      p_supplier_cif: String(inv.supplierCif || ""),
      p_total: Number(inv.total),
      p_courier_receipt: String(body.courierReceipt || ""),
      p_courier_date: body.courierReceiptDate || null,
      p_payment_date: body.supplierPaymentDate || null,
    });
    if (error) {
      console.error("ANAF RJIP import failed", error.message);
      return NextResponse.json({ error: "Factura a fost citită, dar importul în RJIP a eșuat." }, { status: 500 });
    }
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("ANAF RJIP import error", error?.message || "unknown");
    return NextResponse.json({ error: "Nu am putut importa factura în RJIP." }, { status: 500 });
  }
}
