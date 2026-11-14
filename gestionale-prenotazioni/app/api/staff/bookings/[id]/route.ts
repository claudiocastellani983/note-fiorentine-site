import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";
import {getStaffUser} from "@/lib/staff";
import {reserveTables} from "@/lib/availability";
export const runtime="nodejs";

export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}) {
 const staff=await getStaffUser();
 if(!staff)return NextResponse.json({error:"Accesso non autorizzato"},{status:401});
 const {id}=await context.params;
 const body=await request.json().catch(()=>null);
 if(!body)return NextResponse.json({error:"Richiesta non valida"},{status:400});
 const allowed=["requested","confirmed","arrived","completed","cancelled","no_show"];
 const client=await db.connect();
 try{
  await client.query("begin");
  const before=await client.query("select *,to_char(starts_at at time zone 'Europe/Rome','YYYY-MM-DD') as local_date,to_char(starts_at at time zone 'Europe/Rome','HH24:MI') as local_time from public.bookings where id=$1",[id]);
  if(!before.rowCount){await client.query("rollback");return NextResponse.json({error:"Prenotazione non trovata"},{status:404});}
  const old=before.rows[0];
  const date=String(body.date||old.local_date);
  const time=String(body.time||old.local_time);
  const partySize=Number(body.party_size??old.party_size);
  const status=String(body.status||old.status);
  if(!allowed.includes(status)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):(00|15|30|45)$/.test(time)||!Number.isInteger(partySize)||partySize<1||partySize>30){
   await client.query("rollback");return NextResponse.json({error:"Dati della prenotazione non validi"},{status:400});
  }
  const lockDates=[old.local_date,date].sort();
  for(const day of [...new Set(lockDates)]) await client.query("select pg_advisory_xact_lock(hashtext($1))",["nf-booking:"+day]);
  const locked=await client.query("select * from public.bookings where id=$1 for update",[id]);
  if(!locked.rowCount){await client.query("rollback");return NextResponse.json({error:"Prenotazione non trovata"},{status:404});}
  if(["cancelled","no_show","completed"].includes(status)){
   await client.query("delete from public.booking_tables where booking_id=$1",[id]);
  }else{
   const start=await client.query("select ($1::date+$2::time) at time zone 'Europe/Rome' as starts_at",[date,time]);
   const startsAt=new Date(start.rows[0].starts_at);
   const hours=await client.query("select booking_duration_minutes from public.service_hours where weekday=extract(dow from $1::date)::int",[date]);
   const duration=Number(hours.rows[0]?.booking_duration_minutes||Math.round((new Date(old.ends_at).getTime()-new Date(old.starts_at).getTime())/60000)||120);
   const endsAt=new Date(startsAt.getTime()+duration*60000);
   const chosen=await reserveTables(client,startsAt,endsAt,partySize,id);
   if(!chosen){await client.query("rollback");return NextResponse.json({error:"Non ci sono tavoli liberi per la nuova data, ora o capienza."},{status:409});}
   await client.query("delete from public.booking_tables where booking_id=$1",[id]);
   for(const table of chosen) await client.query("insert into public.booking_tables(booking_id,table_id,starts_at,ends_at) values($1,$2,$3,$4)",[id,table.id,startsAt,endsAt]);
   await client.query(`update public.bookings set starts_at=$2,ends_at=$3,party_size=$4,guest_name=$5,guest_phone=$6,guest_email=$7,notes=$8,status=$9,updated_at=now(),updated_by=$10,version=version+1 where id=$1`,
    [id,startsAt,endsAt,partySize,String(body.guest_name??old.guest_name),String(body.phone??old.guest_phone??"")||null,String(body.email??old.guest_email??"")||null,String(body.notes??old.notes??"")||null,status,staff.id]);
  }
  if(["cancelled","no_show","completed"].includes(status)){
   await client.query("update public.bookings set status=$2,updated_at=now(),updated_by=$3,version=version+1 where id=$1",[id,status,staff.id]);
  }
  await client.query("insert into public.booking_events(booking_id,actor_user_id,event_type,details) values($1,$2,'booking_updated',$3)",[id,staff.id,JSON.stringify({status,date,time,party_size:partySize})]);
  await client.query("commit");
  return NextResponse.json({ok:true});
 }catch(error){await client.query("rollback").catch(()=>{});console.error("staff_update_booking_error",error);return NextResponse.json({error:"Errore durante l'aggiornamento"},{status:500});}
 finally{client.release();}
}