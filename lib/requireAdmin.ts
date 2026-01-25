import { cookies } from "next/headers";

export async function requireAdmin() {
  const jar = await cookies();
  const ok = jar.get("admin_session")?.value === "true";
  return ok;
}
