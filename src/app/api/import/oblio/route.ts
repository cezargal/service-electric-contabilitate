"use server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const api = "https://www.oblio.eu/api";

async function oblioGet(path: string, token: string) {
  const response = await fetch(api + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body?.status && Number(body.status) !== 200)) {
    throw new Error(body?.statusMessage || body?.message || `Oblio a răspuns cu status ${response.status}`);
  }
  return body?.data ?? [];
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const jwt = authorization.replace(/^Bearer\s+/i, "");
    if (!jwt) return NextResponse.json({ error: "Sesiune lipsă." }, { status: 401 });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return NextResponse.json({ error: "Configurarea aplicației este incompletă." }, { status: 500 });
    const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authData.user || authData.user.id !== "18bd609e-4ad7-4896-bb6a-b5a1358f7495") {
      return NextResponse.json({ error: "Acces neautorizat." }, { status: 403 });
    }

    const body = await request.json();
    const clientId = String(body?.clientId || "").trim();
    const clientSecret = String(body?.clientSecret || "").trim();
    const cif = String(body?.cif || "").replace(/^RO/i, "").replace(/\D/g, "");
    if (!clientId || !clientSecret || !cif) return NextResponse.json({ error: "Completează e-mailul Oblio, tokenul API și CUI-ul firmei." }, { status: 400 });

    const tokenResponse = await fetch(api + "/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
      cache: "no-store"
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) {
      return NextResponse.json({ error: "Autentificarea Oblio a eșuat. Verifică e-mailul și tokenul API din Setări → Date cont." }, { status: 401 });
    }
    const token = String(tokenData.access_token);
    const companies = await oblioGet("/nomenclature/companies", token);
    const companyList = Array.isArray(companies) ? companies : [];
    const company = companyList.find((x: any) => String(x.cif || "").replace(/^RO/i, "").replace(/\D/g, "") === cif);
    if (!company) return NextResponse.json({ error: "CUI-ul introdus nu apare în companiile asociate contului Oblio.", companies: companyList }, { status: 404 });

    const clients: any[] = [];
    for (let offset = 0; offset < 5000; offset += 250) {
      const batch = await oblioGet(`/nomenclature/clients?cif=${encodeURIComponent(company.cif)}&offset=${offset}`, token);
      const rows = Array.isArray(batch) ? batch : [];
      clients.push(...rows);
      if (rows.length < 250) break;
    }

    const documents: any[] = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const params = new URLSearchParams({
        cif: company.cif,
        withProducts: "1",
        withCollects: "1",
        withEinvoiceStatus: "1",
        limitPerPage: "100",
        offset: String(offset),
        orderBy: "issueDate",
        orderDir: "ASC"
      });
      const batch = await oblioGet(`/docs/invoice/list?${params.toString()}`, token);
      const rows = Array.isArray(batch) ? batch : [];
      documents.push(...rows);
      if (rows.length < 100) break;
    }

    return NextResponse.json({
      company,
      clients,
      documents,
      counts: {
        clients: clients.length,
        documents: documents.length,
        collections: documents.reduce((n, d) => n + (Array.isArray(d.collects) ? d.collects.length : 0), 0)
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Importul din Oblio nu a putut fi efectuat." }, { status: 502 });
  }
}
