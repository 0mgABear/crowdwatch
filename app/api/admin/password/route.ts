import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/requireAdmin";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { newPassword } = await req.json();

    if (!newPassword || String(newPassword).length < 8) {
      return NextResponse.json(
        { error: "Password too short (min 8)" },
        { status: 400 },
      );
    }

    const hash = await bcrypt.hash(String(newPassword), 10);

    const { error } = await supabaseAdmin
      .from("settings")
      .update({
        admin_password_hash: hash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unauthorized" },
      { status: 401 },
    );
  }
}
