import { NextRequest, NextResponse } from "next/server";
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cui = String(body?.cui ?? "").replace(/^RO/i, "").replace(/\D/g, "");
    if (!cui) return NextResponse.json({ error: "Introdu un CUI valid." }, { status: 400 });
    const response = await fetch("https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ cui: Number(cui), data: new Date().toISOString().slice(0, 10) }]),
      cache: "no-store"
    });
    if (!response.ok) return NextResponse.json({ error: "Serviciul ANAF nu răspunde." }, { status: 502 });
    const data = await response.json();
    const company = data?.found?.[0];
    if (!company) return NextResponse.json({ error: "CUI negăsit în registrul ANAF." }, { status: 404 });
    const g = company.date_generale ?? {};
    return NextResponse.json({ cui: String(g.cui ?? cui), denumire: g.denumire ?? "", nrRegCom: g.nrRegCom ?? "", adresa: g.adresa ?? "", codCAEN: g.cod_CAEN ?? "" });
  } catch {
    return NextResponse.json({ error: "Nu am putut interoga ANAF." }, { status: 500 });
  }
}