import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Item = { productId: string; qty: number };

function toMoney(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const method = body?.method as "CASH" | "PAYNOW";
    const items = (body?.items ?? []) as Item[];
    const donationAmount = toMoney(body?.donationAmount);

    if (!method || !["CASH", "PAYNOW"].includes(method)) {
      return NextResponse.json({ error: "Invalid method" }, { status: 400 });
    }

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    }

    const cleanItems = items
      .map((it) => ({
        productId: String(it?.productId || ""),
        qty: Math.max(0, Math.trunc(Number(it?.qty ?? 0))),
      }))
      .filter((it) => it.productId && it.qty > 0);

    if (cleanItems.length === 0 && donationAmount <= 0) {
      return NextResponse.json(
        { error: "Select items or enter a donation amount" },
        { status: 400 },
      );
    }

    // Load product prices (trust DB, not client)
    const ids = Array.from(new Set(cleanItems.map((i) => i.productId)));

    const priceMap = new Map<string, number>();
    if (ids.length > 0) {
      const { data: prods, error: pe } = await supabaseAdmin
        .from("products")
        .select("id,price,active")
        .in("id", ids);

      if (pe) throw pe;

      for (const p of prods ?? []) {
        if (!p.active) {
          return NextResponse.json(
            { error: "Inactive product" },
            { status: 400 },
          );
        }
        priceMap.set(p.id, Number(p.price ?? 0));
      }

      for (const id of ids) {
        if (!priceMap.has(id)) {
          return NextResponse.json(
            { error: "Invalid product" },
            { status: 400 },
          );
        }
      }
    }

    let itemsTotal = 0;
    for (const it of cleanItems) {
      const unit = priceMap.get(it.productId);
      if (unit == null) {
        return NextResponse.json({ error: "Invalid product" }, { status: 400 });
      }
      itemsTotal += it.qty * unit;
    }

    const total = Math.round((itemsTotal + donationAmount) * 100) / 100;

    if (total <= 0) {
      return NextResponse.json({ error: "Total must be > 0" }, { status: 400 });
    }

    const { data: sale, error: saleErr } = await supabaseAdmin
      .from("sales")
      .insert({
        amount: total,
        status: "PAID",
        method,
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (saleErr) throw saleErr;
    if (!sale?.id) throw new Error("Failed to create sale");

    if (cleanItems.length > 0) {
      const rows = cleanItems.map((it) => {
        const unit = priceMap.get(it.productId);
        if (unit == null) throw new Error("Invalid product");
        return {
          sale_id: sale.id,
          product_id: it.productId,
          qty: it.qty,
          unit_price: unit,
        };
      });

      const { error: itemsErr } = await supabaseAdmin
        .from("sale_items")
        .insert(rows);

      if (itemsErr) throw itemsErr;
    }

    return NextResponse.json({ ok: true, total, saleId: sale.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
