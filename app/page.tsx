"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { rpcCollectDrink } from "@/lib/rpc";

type Visit = {
  id: string;
  name: string;
  pax: number;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  est_end_time: string | null;
  drinks_collected: number;
};

export default function DashboardPage() {
  const [visits, setVisits] = useState<Visit[]>([]);

  async function load() {
    const { data, error } = await supabase
      .from("visits")
      .select("id,name,pax,status,est_end_time")
      .eq("status", "ACTIVE")
      .order("est_end_time", { ascending: true });

    if (error) return;

    const base = (data ?? []) as Omit<Visit, "drinks_collected">[];

    if (base.length === 0) {
      setVisits([]);
      return;
    }

    const visitIds = base.map((v) => v.id);

    // Fetch drink qty for all active visits in one go
    const { data: vp, error: vpErr } = await supabase
      .from("visit_products")
      .select("visit_id, qty, product:products(name)")
      .in("visit_id", visitIds);

    if (vpErr) {
      // still show visits even if drink query fails
      setVisits(base.map((v) => ({ ...v, drinks_collected: 0 })));
      return;
    }

    const drinksMap = new Map<string, number>();
    (vp ?? []).forEach((row: any) => {
      if (row.product?.name === "Drink") {
        drinksMap.set(row.visit_id, row.qty);
      }
    });

    setVisits(
      base.map((v) => ({
        ...v,
        drinks_collected: drinksMap.get(v.id) ?? 0,
      })),
    );
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visit_products" },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <a className="border rounded px-3 py-2" href="/new-checkin">
          New check-in
        </a>
      </div>

      <div className="space-y-2">
        {visits.map((v) => (
          <VisitRow key={v.id} v={v} onDrinkCollected={load} />
        ))}
        {visits.length === 0 && (
          <div className="opacity-70">No active visits</div>
        )}
      </div>
    </div>
  );
}

function VisitRow({
  v,
  onDrinkCollected,
}: {
  v: Visit;
  onDrinkCollected: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = useMemo(() => {
    if (!v.est_end_time) return null;
    const ms = new Date(v.est_end_time).getTime() - now;
    return Math.max(0, ms);
  }, [v.est_end_time, now]);

  const mmss = useMemo(() => {
    if (remaining === null) return "--:--";
    const totalSec = Math.floor(remaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [remaining]);

  const drinksLabel = `${v.drinks_collected}/${v.pax}`;

  async function addDrink() {
    if (busy) return;
    setBusy(true);
    try {
      await rpcCollectDrink({ visitId: v.id, qty: 1 });
      await onDrinkCollected();
    } catch (e: any) {
      alert(e.message ?? "Failed to collect drink");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded p-3 flex items-center justify-between">
      {/* LEFT */}
      <div className="space-y-1">
        <div className="font-medium">{v.name}</div>

        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">Pax {v.pax}</span>

          <span
            className={`text-xs px-2 py-1 rounded font-medium ${
              v.drinks_collected < v.pax
                ? "bg-red-500/20 text-red-400"
                : "bg-green-500/20 text-green-400"
            }`}
          >
            Drinks {v.drinks_collected}/{v.pax}
          </span>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-3">
        <button
          className="border rounded px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy || v.drinks_collected >= v.pax}
          onClick={addDrink}
        >
          +1 drink
        </button>

        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{mmss}</div>
          <div className="text-sm opacity-70">remaining</div>
        </div>
      </div>
    </div>
  );
}
