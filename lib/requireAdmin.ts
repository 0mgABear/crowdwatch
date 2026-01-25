import { cookies } from "next/headers";

export async function requireAdmin() {
  const jar = await cookies();
  const v = jar.get("admin_session")?.value;
  if (v !== "true") {
    return { ok: false as const };
  }
  return { ok: true as const };
}
