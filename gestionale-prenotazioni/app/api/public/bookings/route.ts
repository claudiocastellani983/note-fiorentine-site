import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getSlots, reserveTables } from "@/lib/availability";
export const runtime = "nodejs";

export async function POST(request:NextRequest) {
  const body = await request.json().catch(()=>null);
  if (!body) return NextResponse.json({error:"Richiesta non valida"},{status:400});
  const {date,time,party_size,guest_name,phone,email,notes} = body;
  const size = Number(party_size);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(date)) || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(time)) ||
      !Number.isInteger(size) || size<1 || size>30 || !String(guest_name||"").trim() || !String(phone||"").trim()) {
    return NextResponse.json({error:"Compila nome, telefono, data, orario e numero di persone."},{status:400});
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = createHash("sha256").update((process.env.NEON_AUTH_COOKIE_SECRET || "nf-rate-limit") + ip).digest("hex");
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))",["nf-booking:"+date]);
    const rate = await client.query("select window_started_at,request_count from public.booking_rate_limits where ip_hash=$1 for update",[ipHash]);
    if (rate.rowCount && Date.now()-new Date(rate.rows[0].window_started_at).getTime()<15*60*1000 && Number(rate.rows[0].request_count)>=8) {
      await client.query("rollback");
      return NextResponse.json({error:"Hai raggiunto il limite temporaneo di richieste. Riprova più tardi."},{status:429});
    }
    if (rate.rowCount) {
      const fresh = Date.now()-new Date(rate.rows[0].window_started_at).getTime()>=15*60*1000;
      await client.query("update public.booking_rate_limits set window_started_at=case when $2 then now() else window_started_at end, request_count=case when $2 then 1 else request_count+1 end where ip_hash=$1",[ipHash,fresh]);
    } else {
      await client.query("insert into public.booking_rate_limits(ip_hash,window_started_at,request_count) values($1,now(),1)",[ipHash]);
    }
    const availability = await getSlots(date,size,true);
    if (!availability.slots.some(slot=>slot.time===time)) {
      await client.query("rollback");
      return NextResponse.json({error:"Questo orario non è più disponibile. Aggiorna gli orari e scegline un altro."},{status:409});
    }
    const startResult = await client.query("select ($1::date + $2::time) at time zone 'Europe/Rome' as starts_at",[date,time]);
    const startsAt = new Date(startResult.rows[0].starts_at);
    const service = await client.query("select booking_duration_minutes from public.service_hours where weekday=extract(dow from $1::date)::int",[date]);
    const endsAt = new Date(startsAt.getTime()+Number(service.rows[0].booking_duration_minutes)*60000);
    const chosen = await reserveTables(client,startsAt,endsAt,size);
    if (!chosen) {
      await client.query("rollback");
      return NextResponse.json({error:"Nel frattempo i posti sono stati occupati. Scegli un altro orario."},{status:409});
    }
    const guest = await client.query(`insert into public.guests(full_name,phone,email)
      values($1,$2,$3) returning id`,[String(guest_name).trim(),String(phone).trim(),String(email||"").trim()||null]);
    const booking = await client.query(`insert into public.bookings(guest_id,guest_name,guest_phone,guest_email,party_size,starts_at,ends_at,status,source,notes)
      values($1,$2,$3,$4,$5,$6,$7,'requested','website',$8) returning id`,
      [guest.rows[0].id,String(guest_name).trim(),String(phone).trim(),String(email||"").trim()||null,size,startsAt,endsAt,String(notes||"").trim()||null]);
    for (const table of chosen) await client.query("insert into public.booking_tables(booking_id,table_id,starts_at,ends_at) values($1,$2,$3,$4)",[booking.rows[0].id,table.id,startsAt,endsAt]);
    await client.query("insert into public.booking_events(booking_id,event_type,details) values($1,'online_request',$2)",[booking.rows[0].id,JSON.stringify({party_size:size,date,time})]);
    await client.query("commit");
    return NextResponse.json({ok:true,booking_id:booking.rows[0].id,message:"Richiesta ricevuta. Il ristorante ti confermerà la prenotazione."},{status:201});
  } catch (error) {
    await client.query("rollback").catch(()=>{});
    console.error("public_booking_error",error);
    return NextResponse.json({error:"Non è stato possibile registrare la richiesta. Riprova tra poco."},{status:503});
  } finally { client.release(); }
}