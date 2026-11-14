import { redirect } from "next/navigation";
import { getStaffUser } from "@/lib/staff";
import Dashboard from "./ui/dashboard";

export const dynamic="force-dynamic";
export default async function Home(){
  const staff=await getStaffUser();
  if(!staff) redirect("/login");
  return <Dashboard staff={staff}/>;
}