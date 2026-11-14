import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffUser } from "@/lib/staff";
import { reserveTables } from "@/lib/availability";
export const runtime = "nodejs";

export async function GET(request:NextRequest) {
  const staff = await getStaffUser();
  if (!staff) return NextResponse.json({error:"Accesso non autorizzato"},{status:401});
  const date = request.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0,10);
  const result = await db.query(`select b.*,coalesce(json_agg(json_build_object('id',t.id,'label',t.label)) filter (where t.id is not null),'[]') as tables
    from public.bookings b left join public.booking_tables bt on bt.booking_id=b.id left join public.dining_tables t on t.id=bt.table_id
    where b.starts_at >= ($1::date::timestamp at time zone 'Europe/Rome')
      and b.starts_at < (($1::date+1)::timestamp at time zone 'Europe/Rome')
    group by b.id order by b.starts_at asc`,[date]);
  return NextResponse.json({bookings:result.rows});
}

export async function POST(request:NextRequest) {
  const staff = await getStaffUser();
  if (!staff) return NextResponse.json({error:"Accesso non autorizzato"},{status:401});
  const body = await request.json().catch(()=>null);
  if (!body) return NextResponse.json({error:"Richiesta non valida"},{status:400});
  const {date,time,party_size,guest_name,phone,email,notes,source="phone"}=body;
  const size=Number(party_size);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(date)) || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(time)) || !Number.isInteger(size)||size<1||size>30||!String(guest_name||"").trim()) return NextResponse.json({error:"Dati prenotazione incompleti"},{status:400});
  if (!["phone","walk_in","staff"].includes(source)) return NextResponse.json({error:"Origine non valida"},{status:400});
  const client=await db.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))",["nf-booking:"+date]);
    const start=await client.query("select ($1::date+$2::time) at time zone 'Europe/Rome' as starts_at",[date,time]);
    const startsAt=new Date(start.rows[0].starts_at);
    const hours=await client.query("select booking_duration_minutes from public.service_hours where weekday=extract(dow from $1::date)::int",[date]);
    const duration=Number(hours.rows[0]?.booking_duration_minutes||120);
    const endsAt=new Date(startsAt.getTime()+duration*60000);
    const chosen=await reserveTables(client,startsAt,endsAt,size);
    if(!chosen){await client.query("rollback");return NextResponse.json({error:"Capienza insufficiente per questo orario."},{status:409});}
    const guest=await client.query("insert into public.guests(full_name,phone,email) values($1,$2,$3) returning id",[String(guest_name).trim(),String(phone||"").trim()||null,String(email||"").trim()||null]);
    const booking=await client.query(`insert into public.bookings(guest_id,guest_name,guest_phone,guest_email,party_size,starts_at,ends_at,status,source,notes,created_by,updated_by)
      values($1,$2,$3,$4,$5,$6,$7,'confirmed',$8,$9,$10,$10) returning id`,
      [guest.rows[0].id,String(guest_name).trim(),String(phone||"").trim()||null,String(email||"").trim()||null,size,startsAt,endsAt,source,String(notes||"").trim()||null,staff.id]);
    for(const table of chosen) await client.query("insert into public.booking_tables(booking_id,table_id,starts_at,ends_at) values($1,$2,$3,$4)",[booking.rows[0].id,table.id,startsAt,endsAt]);
    await client.query("insert into public.booking_events(booking_id,actor_user_id,event_type,details) values($1,$2,'created_by_staff',$3)",[booking.rows[0].id,staff.id,JSON.stringify({source})]);
    await client.query("commit");
    return NextResponse.json({ok:true,id:booking.rows[0].id},{status:201});
  } catch(error){await client.query("rollback").catch(()=>{});console.error("staff_create_booking_error",error);return NextResponse.json({error:"Errore durante il salvataggio"},{status:500});}
  finally{client.release();}
}