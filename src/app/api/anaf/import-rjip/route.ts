import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeOwner } from "@/lib/owner-auth";

export async function POST(request: NextRequest) {
  const storageSecret = process.env.ANAF_STORAGE_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization") || "";
  const access = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!storageSecret || !supabaseUrl || !supabaseAnonKey || !access) return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
  const authorizationResult = await authorizeOwner(request);
  if (!authorizationResult.ok) return NextResponse.json({ error: authorizationResult.error }, { status: authorizationResult.status });
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${access}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const body = await request.json();
    const cif = String(body.cif || "").replace(/^RO/i, "").replace(/\\D/g, "");
    const id = String(body.id || "");
    const inv = body.invoice || {};
    const paymentMethods = ["numerar","card","banca","ordin de plata","alta"];
    const paymentMethod = String(body.supplierPaymentMethod || "").trim().toLowerCase();
    const paymentDate = String(body.supplierPaymentDate || "").trim();
    if (cif.length < 2 || !id || !inv.total || Number(inv.total) <= 0 || String(inv.currency || "RON").toUpperCase() !== "RON") return NextResponse.json({ error: "Datele facturii sunt incomplete sau moneda nu este RON." }, { status: 400 });
    if (!paymentMethods.includes(paymentMethod) || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return NextResponse.json({ error: "Alege metoda și data plății efective." }, { status: 400 });
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
      p_payment_date: paymentDate,
      p_payment_method: paymentMethod,
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
