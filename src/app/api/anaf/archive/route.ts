import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
      return new NextResponse(data, { headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="SPV-${id}.xml"`,
        "Cache-Control": "no-store",
      }});
    }
    const { data, error } = await client.rpc("list_anaf_supplier_archive", {
      p_secret: secret, p_cif: cif || null,
    });
    if (error) throw error;
    return NextResponse.json({ success: true, documents: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Nu am putut accesa arhiva SPV." }, { status: 401 });
  }
}
