import {redirect} from "next/navigation";
import Link from "next/link";
import {getStaffUser} from "@/lib/staff";
import SettingsClient from "./settings-client";
export const dynamic="force-dynamic";
export default async function SettingsPage(){
 const staff=await getStaffUser();if(!staff)redirect("/login");
 if(!["owner","admin"].includes(staff.role))redirect("/");
 return <><header className="topbar"><div className="brand"><div className="mark">N</div><div><strong>NOTE FIORENTINE</strong><small>Impostazioni gestionale</small></div></div><Link className="btn ghost" href="/">Torna all'agenda</Link></header><SettingsClient/></>;
}