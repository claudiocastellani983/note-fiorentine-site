import { db } from "@/lib/db";

export type Slot = { time: string; available: boolean };

function minutes(value: string) {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
function clock(value: number) {
  return String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
}

export function chooseTables(tables: {id:string;capacity:number}[], partySize: number) {
  const sorted = [...tables].sort((a,b) => a.capacity-b.capacity);
  let best: typeof sorted | null = null;
  function walk(index:number, chosen:typeof sorted, seats:number) {
    if (seats >= partySize) {
      if (!best || chosen.length < best.length || (chosen.length === best.length && seats < best.reduce((n,t)=>n+t.capacity,0))) best = [...chosen];
      return;
    }
    if (index >= sorted.length || (best && chosen.length >= best.length)) return;
    for (let i=index;i<sorted.length;i++) walk(i+1,[...chosen,sorted[i]],seats+sorted[i].capacity);
  }
  walk(0,[],0);
  return best;
}

export async function getSlots(date: string, partySize: number, onlineOnly = true) {
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  const hours = await db.query("select enabled, opens_at::text, closes_at::text, booking_duration_minutes, min_party_size, max_party_size from public.service_hours where weekday=$1",[weekday]);
  if (!hours.rowCount || !hours.rows[0].enabled) return { configured:false, slots:[] as Slot[] };
  const service = hours.rows[0];
  if (partySize < service.min_party_size || partySize > service.max_party_size) return { configured:true, slots:[] as Slot[] };
  const tablesResult = await db.query("select id,capacity from public.dining_tables where active=true order by capacity asc");
  const tables = tablesResult.rows as {id:string;capacity:number}[];
  if (!tables.length) return { configured:false, slots:[] as Slot[] };
  const startDay = await db.query("select ($1::date::timestamp at time zone 'Europe/Rome') as day_start, (($1::date + 1)::timestamp at time zone 'Europe/Rome') as day_end",[date]);
  const dayStart = startDay.rows[0].day_start;
  const dayEnd = startDay.rows[0].day_end;
  const [busyResult, overrideResult] = await Promise.all([
    db.query(`select bt.table_id, bt.starts_at, bt.ends_at
      from public.booking_tables bt join public.bookings b on b.id=bt.booking_id
      where b.status not in ('cancelled','no_show','completed')
      and bt.starts_at < $2 and bt.ends_at > $1`,[dayStart,dayEnd]),
    db.query("select slot_time::text, online_enabled from public.online_slot_overrides where service_date=$1",[date])
  ]);
  const overrides = new Map<string,boolean>(overrideResult.rows.map((r:any)=>[String(r.slot_time).slice(0,5),r.online_enabled]));
  const busy = busyResult.rows;
  const open = minutes(String(service.opens_at));
  const close = minutes(String(service.closes_at));
  const interval = 30;
  const duration = Number(service.booking_duration_minutes);
  const slots: Slot[] = [];
  for (let t=open;t+duration<=close;t+=interval) {
    const time = clock(t);
    if (onlineOnly && overrides.get(time) === false) continue;
    const start = await db.query("select ($1::date + $2::time) at time zone 'Europe/Rome' as value",[date,time]);
    const startAt = new Date(start.rows[0].value).getTime();
    const endAt = startAt + duration*60000;
    const free = tables.filter(table => !busy.some((b:any)=>b.table_id===table.id && new Date(b.starts_at).getTime()<endAt && new Date(b.ends_at).getTime()>startAt));
    const combination = chooseTables(free,partySize);
    if (combination) slots.push({time,available:true});
  }
  return { configured:true, slots };
}

export async function reserveTables(client:any, startAt:Date, endAt:Date, partySize:number, excludeBookingId?:string) {
  const available = await client.query(`select t.id,t.capacity from public.dining_tables t
    where t.active=true and not exists (
      select 1 from public.booking_tables bt join public.bookings b on b.id=bt.booking_id
      where bt.table_id=t.id and b.status not in ('cancelled','no_show','completed')
      and bt.starts_at < $2 and bt.ends_at > $1
      and ($3::uuid is null or b.id <> $3::uuid)
    ) order by t.capacity asc`,[startAt,endAt,excludeBookingId ?? null]);
  const chosen = chooseTables(available.rows,partySize);
  if (!chosen) return null;
  return chosen as {id:string;capacity:number}[];
}