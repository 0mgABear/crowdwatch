import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    // Compute today's time window (local server time)
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(24, 0, 0, 0);

    // 1) Payments today (visit payments)
    const { data: payRows, error: payErr } = await supabaseAdmin
      .from("payments")
      .select("amount, method, paid_at, visit_id")
      .gte("paid_at", start.toISOString())
      .lt("paid_at", end.toISOString());

    if (payErr) throw payErr;

    let cash = 0;
    let paynow = 0;

    const visitIds = new Set<string>();

    for (const p of payRows ?? []) {
      const amt = Number((p as any).amount ?? 0);
      const method = String((p as any).method ?? "");
      const visitId = (p as any).visit_id;

      if (method === "CASH") cash += amt;
      if (method === "PAYNOW") paynow += amt;

      if (visitId) visitIds.add(String(visitId));
    }

    // 2) Sales today (new sale page)
    const { data: saleRows, error: saleErr } = await supabaseAdmin
      .from("sales")
      .select("amount, method, paid_at")
      .gte("paid_at", start.toISOString())
      .lt("paid_at", end.toISOString());

    if (saleErr) throw saleErr;

    for (const s of saleRows ?? []) {
      const amt = Number((s as any).amount ?? 0);
      const method = String((s as any).method ?? "");

      if (method === "CASH") cash += amt;
      if (method === "PAYNOW") paynow += amt;
    }

    // 3) Groups + People (only from visits that had payments today)
    const visitIdList = Array.from(visitIds);

    let groups = 0;
    let people = 0;

    if (visitIdList.length > 0) {
      const { data: vRows, error: vErr } = await supabaseAdmin
        .from("visits")
        .select("id, pax")
        .in("id", visitIdList);

      if (vErr) throw vErr;

      groups = vRows?.length ?? 0;
      people = (vRows ?? []).reduce(
        (sum, v: any) => sum + Number(v?.pax ?? 0),
        0,
      );
    }

    // keep 2dp for money
    cash = Math.round(cash * 100) / 100;
    paynow = Math.round(paynow * 100) / 100;

    return NextResponse.json({
      totals: { cash, paynow, groups, people },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
