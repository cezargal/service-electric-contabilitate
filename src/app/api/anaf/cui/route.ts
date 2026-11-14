import { NextRequest, NextResponse } from "next/server";
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = String(body?.cui ?? "").trim().toUpperCase().replace(/^RO/, "").replace(/\D/g, "");
    if (!raw || raw.length < 2 || raw.length > 10) return NextResponse.json({ error: "Introdu un CUI valid." }, { status: 400 });
    const response = await fetch("https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva", {
      method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify([{ cui: Number(raw), data: new Date().toISOString().slice(0, 10) }]),
      cache: "no-store", signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return NextResponse.json({ error: "ANAF nu a răspuns momentan. Încearcă din nou." }, { status: 502 });
    const data = await response.json();
    const company = data?.found?.[0];
    if (!company) return NextResponse.json({ error: "CUI-ul nu a fost găsit în registrul ANAF. Verifică numărul și completează manual datele." }, { status: 404 });
    