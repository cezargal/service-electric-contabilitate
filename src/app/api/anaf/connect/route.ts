import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ error: "Conectarea ANAF nu este încă activă." }, { status: 501 });
}