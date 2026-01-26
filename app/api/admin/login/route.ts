export const runtime = "nodejs";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ error: "Missing password" }, { status: 400 });
    }

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return NextResponse.json(
        { error: "Server missing Supabase env vars" },
        { status: 500 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("admin_password_hash")
      .eq("id", 1)
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Supabase error: ${error.message}` },
        { status: 500 },
      );
    }

    if (!data?.admin_password_hash) {
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
    const jar = await cookies();
    jar.set("admin_session", "true", {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown server error" },
      { status: 500 },
    );
  }
}
