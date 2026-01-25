import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const jar = await cookies();
  const authed = jar.get("admin_session")?.value === "true";
  return NextResponse.json({ authed });
}
