import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";
import {getStaffUser} from "@/lib/staff";
export const runtime="nodejs";
export async function GET(){
 const staff=await getStaffUser();if(!staff)return NextResponse.json({error:"Accesso non autorizzato"},{status:401});
 const [hours,tables,areas]=await Promise.all([
  db.query("select weekday,enabled,opens_at::text,closes_at::text,booking_duration_minutes,min_party_size,max_party_size from public.service_hours order by weekday"),
  db.query("select t.id,t.label,t.capacity,t.active,t.sort_order,a.name as area from public.dining_tables t left join public.dining_areas a on a.id=t.area_id order by t.sort_order,t.label"),
  db.query("select id,name from public.dining_areas where active=true order by sort_order,name")
 ]);
 return NextResponse.json({hours:hours.rows,tables:tables.rows,areas:areas.rows});
}
export async function POST(request:NextRequest){
 const staff=await getStaffUser();if(!staff)return NextResponse.json({error:"Accesso non autorizzato"},{status:401});
 if(!["owner","admin"].includes(staff.role))return NextResponse.json({error:"Permessi insufficienti"},{status:403});
 const body=await request.json().catch(()=>null);if(!body)return NextResponse.json({error:"Richiesta non valida"},{status:400});
 try{
  if(body.type==="hours"){
   if(!Array.isArray(body.hours)||body.hours.length!==7) return NextResponse.json({error:"Inserisci i sette giorni della settimana"},{status:400});
   for(const h of body.hours){
    const day=Number(h.weekday),duration=Number(h.booking_duration_minutes||120),min=Number(h.min_party_size||1),max=Number(h.max_party_size||12);
    if(!Number.isInteger(day)||day<0||day>6||duration<30||duration>360||min<1||max<min||max>30) return NextResponse.json({error:"Orari o capienza non validi"},{status:400});
    await db.query(`insert into public.service_hours(weekday,enabled,opens_at,closes_at,booking_duration_minutes,min_party_size,max_party_size)
     values($1,$2,$3,$4,$5,$6,$7) on conflict(weekday) do update set enabled=excluded.enabled,opens_at=excluded.opens_at,closes_at=excluded.closes_at,booking_duration_minutes=excluded.booking_duration_minutes,min_party_size=excluded.min_party_size,max_party_size=excluded.max_party_size`,
     [day,!!h.enabled,h.opens_at||null,h.closes_at||null,duration,min,max]);
   }
   return NextResponse.json({ok:true});
  }
  if(body.type==="table"){
   const label=String(body.label||"").trim(),capacity=Number(body.capacity),area=String(body.area||"").trim();
   if(!label||!Number.isInteger(capacity)||capacity<1||capacity>30)return NextResponse.json({error:"Nome e capienza del tavolo sono obbligatori"},{status:400});
   let areaId=null;
   if(area){const a=await db.query("insert into public.dining_areas(name) values($1) on conflict(name) do update set name=excluded.name returning id",[area]);areaId=a.rows[0].id;}
   await db.query("insert into public.dining_tables(label,capacity,area_id) values($1,$2,$3)",[label,capacity,areaId]);
   return NextResponse.json({ok:true});
  }
  if(body.type==="deactivate_table"){
   await db.query("update public.dining_tables set active=false where id=$1",[body.id]);
   return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Operazione non riconosciuta"},{status:400});
 }catch(error:any){console.error("settings_save_error",error);return NextResponse.json({error:error.code==="23505"?"Esiste già un tavolo con questo nome.":"Errore durante il salvataggio."},{status:500});}
}