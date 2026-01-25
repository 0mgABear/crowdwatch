import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const { password } = await req.json();

  if (!password) {
    return NextResponse.json({ error: "Missing password" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("settings")
    .select("admin_password_hash")
    .eq("id", 1)
    .single();

  if (error || !data?.admin_password_hash) {
    return NextResponse.json(
      { error: "Admin not configured" },
      { status: 500 },
    );
  }

  const ok = await bcrypt.compare(password, data.admin_password_hash);

  if (!ok) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const isProd = process.env.NODE_ENV === "production";
  const cookieStore = await cookies();

  cookieStore.set("admin_session", "true", {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });

  return NextResponse.json({ success: true });
}
