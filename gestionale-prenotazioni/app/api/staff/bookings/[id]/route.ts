import { NextRequest,NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffUser } from "@/lib/staff";
export const runtime="nodejs";

export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}) {
  const staff=await getStaffUser();
  if(!staff) return NextResponse.json({error:"Accesso non autorizzato"},{status:401});
  const {id}=await context.params;
  const body=await request.json().catch(()=>null);
  if(!body) return NextResponse.json({error:"Richiesta non valida"},{status:400});
  const allowed=["requested","confirmed","arrived","completed","cancelled","no_show"];
  const client=await db.connect();
  try{
    await client.query("begin");
    const current=await client.query("select * from public.bookings where id=$1 for update",[id]);
    if(!current.rowCount){await client.query("rollback");return NextResponse.json({error:"Prenotazione non trovata"},{status:404});}
    const b=current.rows[0];
    const status=body.status||b.status;
    if(!allowed.includes(status)){await client.query("rollback");return NextResponse.json({error:"Stato non valido"},{status:400});}
    await client.query(`update public.bookings set status=$2,updated_at=now(),updated_by=$3,version=version+1 where id=$1`,[id,status,staff.id]);
    await client.query("insert into public.booking_events(booking_id,actor_user_id,event_type,details) values($1,$2,'status_changed',$3)",[id,staff.id,JSON.stringify({from:b.status,to:status})]);
    if(["cancelled","no_show","completed"].includes(status)) await client.query("delete from public.booking_tables where booking_id=$1",[id]);
    await client.query("commit");
    return NextResponse.json({ok:true});
  }catch(error){await client.query("rollback").catch(()=>{});console.error("staff_update_booking_error",error);return NextResponse.json({error:"Errore durante l'aggiornamento"},{status:500});}
  finally{client.release();}
}