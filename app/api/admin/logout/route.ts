import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const isProd = process.env.NODE_ENV === "production";
  const jar = await cookies();

  jar.set("admin_session", "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ success: true });
}
