"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Visit = {
  id: string;
  name: string;
  pax: number;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  est_end_time: string | null;
};

export default function DashboardPage() {
  const [visits, setVisits] = useState<Visit[]>([]);

  async function load() {
    const { data, error } = await supabase
      .from("visits")
      .select("id,name,pax,status,est_end_time")
      .eq("status", "ACTIVE")
      .order("est_end_time", { ascending: true });

    if (!error) setVisits((data ?? []) as Visit[]);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("visits-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits" },
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
          <VisitRow key={v.id} v={v} />
        ))}
        {visits.length === 0 && (
          <div className="opacity-70">No active visits</div>
        )}
      </div>
    </div>
  );
}

function VisitRow({ v }: { v: Visit }) {
  const [now, setNow] = useState(Date.now());

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

  return (
    <div className="border rounded p-3 flex items-center justify-between">
      <div>
        <div className="font-medium">{v.name}</div>
        <div className="text-sm opacity-70">Pax {v.pax}</div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-semibold tabular-nums">{mmss}</div>
        <div className="text-sm opacity-70">remaining</div>
      </div>
    </div>
  );
}
