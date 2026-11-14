import { NextRequest, NextResponse } from "next/server";
import { getSlots } from "@/lib/availability";
export const runtime = "nodejs";
export async function GET(request:NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") || "";
    const partySize = Number(request.nextUrl.searchParams.get("party_size") || 2);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(partySize) || partySize<1 || partySize>30) {
      return NextResponse.json({error:"Parametri non validi"},{status:400});
    }
    const result = await getSlots(date,partySize,true);
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    console.error("availability_error",error);
    return NextResponse.json({error:"Disponibilità temporaneamente non raggiungibile"},{status:503});
  }
}