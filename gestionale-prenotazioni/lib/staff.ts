import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export type StaffUser = { id: string; name: string; email: string; role: "owner" | "admin" | "staff" };

export async function getStaffUser(): Promise<StaffUser | null> {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user?.id) return null;
  const result = await db.query(
    "select p.user_id, p.display_name, p.role from public.staff_profiles p where p.user_id=$1 and p.active=true",
    [user.id]
  );
  if (!result.rowCount) return null;
  const profile = result.rows[0];
  return { id: user.id, name: profile.display_name || user.name || "Staff", email: user.email, role: profile.role };
}