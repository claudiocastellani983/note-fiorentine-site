import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";
import {getStaffUser} from "@/lib/staff";
export const runtime="nodejs";
export async function GET(request:NextRequest){
 const staff=await getStaffUser();if(!staff)return NextResponse.json({error:"Accesso non autorizzato"},{status:401});
 const date=request.nextUrl.searchParams.get("date")||"";
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:"Data non valida"},{status:400});
 const r=await db.query("select slot_time::text,online_enabled,note from public.online_slot_overrides where service_date=$1 order by slot_time",[date]);
 return NextResponse.json({overrides:r.rows});
}
export async function POST(request:NextRequest){
 const staff=await getStaffUser();if(!staff)return NextResponse.json({error:"Accesso non autorizzato"},{status:401});
 if(!["owner","admin"].includes(staff.role))return NextResponse.json({error:"Permessi insufficienti"},{status:403});
 const body=await request.json().catch(()=>null);
 if(!body||!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.time)))return NextResponse.json({error:"Data o orario non valido"},{status:400});
 await db.query(`insert into public.online_slot_overrides(service_date,slot_time,online_enabled,note,updated_by)
 values($1,$2,$3,$4,$5) on conflict(service_date,slot_time) do update set online_enabled=excluded.online_enabled,note=excluded.note,updated_by=excluded.updated_by,updated_at=now()`,
 [body.date,body.time,!!body.online_enabled,body.note||null,staff.id]);
 return NextResponse.json({ok:true});
}