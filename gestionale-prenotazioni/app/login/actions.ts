"use server";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function signInAction(_state:{error?:string}|null,formData:FormData) {
  const email=String(formData.get("email")||"").trim();
  const password=String(formData.get("password")||"");
  const result=await auth.signIn.email({email,password});
  if(result.error) return {error:result.error.message||"Credenziali non valide."};
  redirect("/");
}