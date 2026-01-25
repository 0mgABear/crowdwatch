import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET() {
  try {
    await requireAdmin();
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id,name,price,active,image_url,created_at")
      .order("name", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ products: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unauthorized" },
      { status: 401 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const { updates } = await req.json();

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    for (const u of updates) {
      const { id, price, active, name, image_url } = u ?? {};
      if (!id) continue;

      const patch: any = {};
      if (price != null) patch.price = price;
      if (active != null) patch.active = active;
      if (name != null) patch.name = name;
      if (image_url != null) patch.image_url = image_url;

      const { error } = await supabaseAdmin
        .from("products")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unauthorized" },
      { status: 401 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const { name, price, active = true, image_url = null } = await req.json();

    if (!name || price == null) {
      return NextResponse.json(
        { error: "Missing name/price" },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .insert({ name, price, active, image_url })
      .select("id,name,price,active,image_url,created_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ product: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unauthorized" },
      { status: 401 },
    );
  }
}

export async function DELETE(req: Request) {
  await requireAdmin(); // whatever you're using in this file already

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabaseAdmin.from("products").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
