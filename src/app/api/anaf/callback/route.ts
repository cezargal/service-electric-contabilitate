import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ error: "Conectarea ANAF va fi activată după configurarea certificatelor și a datelor OAuth." }, { status: 501 });
}