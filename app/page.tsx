"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { rpcCollectDrink, rpcExtendVisitPartial } from "@/lib/rpc";
import { QRCodeCanvas } from "qrcode.react";
import { buildPayNowPayload } from "@/lib/paynow";

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
  const [paynowUen, setPaynowUen] = useState<string | null>(null);
  const [extensionPrice, setExtensionPrice] = useState<number>(5);

  async function loadVisitsAndDrinks() {
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

    const { data: vp, error: vpErr } = await supabase
      .from("visit_products")
      .select("visit_id, qty, product:products(name)")
      .in("visit_id", visitIds);

    if (vpErr) {
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

  async function loadPaynowAndPrices() {
    // ONLY fetch paynow_uen (no merchant_name)
    const { data: s, error: sErr } = await supabase
      .from("settings")
      .select("paynow_uen")
      .eq("id", 1)
      .single();

    console.log("dashboard settings", s, "err", sErr);

    if (!sErr && s?.paynow_uen) setPaynowUen(s.paynow_uen);

    const { data: p, error: pErr } = await supabase
      .from("products")
      .select("price")
      .eq("name", "Extension hour")
      .eq("active", true)
      .single();

    if (!pErr && p?.price != null) setExtensionPrice(Number(p.price));
  }

  useEffect(() => {
    loadVisitsAndDrinks();
    loadPaynowAndPrices().catch(console.error);

    const channel = supabase
      .channel("dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits" },
        () => loadVisitsAndDrinks(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visit_products" },
        () => loadVisitsAndDrinks(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">CrowdWatch</h1>
        <a className="border rounded px-3 py-2" href="/new-checkin">
          New Check In
        </a>
      </div>

      <div className="space-y-2">
        {visits.map((v) => (
          <VisitRow
            key={v.id}
            v={v}
            onReload={loadVisitsAndDrinks}
            loadPaynowAndPrices={loadPaynowAndPrices}
            paynowUen={paynowUen}
            extensionPrice={extensionPrice}
          />
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
  onReload,
  loadPaynowAndPrices,
  paynowUen,
  extensionPrice,
}: {
  v: Visit;
  onReload: () => void;
  loadPaynowAndPrices: () => Promise<void>;
  paynowUen: string | null;
  extensionPrice: number;
}) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const [showExtend, setShowExtend] = useState(false);
  const [extendPeople, setExtendPeople] = useState(1);
  const [extendHours, setExtendHours] = useState(1);
  const [showExtendPaynow, setShowExtendPaynow] = useState(false);

  const extendAmount = extendPeople * extendHours * extensionPrice;

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

  async function addDrink() {
    if (busy) return;
    setBusy(true);
    try {
      await rpcCollectDrink({ visitId: v.id, qty: 1 });
      await onReload();
    } catch (e: any) {
      alert(e.message ?? "Failed to collect drink");
    } finally {
      setBusy(false);
    }
  }

  async function endVisit() {
    if (!confirm(`End visit for ${v.name}?`)) return;
    if (busy) return;

    setBusy(true);
    try {
      const { error } = await supabase
        .from("visits")
        .update({ status: "CLOSED" })
        .eq("id", v.id);

      if (error) throw error;
      await onReload();
    } catch (e: any) {
      alert(e.message ?? "Failed to end visit");
    } finally {
      setBusy(false);
    }
  }

  async function extend(method: "CASH" | "PAYNOW") {
    if (busy) return;
    if (!confirm("Collect payment and extend?")) return;

    setBusy(true);
    try {
      await rpcExtendVisitPartial({
        visitId: v.id,
        people: extendPeople,
        addHours: extendHours,
        method,
      });

      setShowExtendPaynow(false);
      setShowExtend(false);
      await onReload();
    } catch (e: any) {
      alert(e.message ?? "Failed to extend visit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="border rounded p-3 flex items-center justify-between">
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

        <div className="flex items-center gap-3">
          <button
            className="border rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy || v.drinks_collected >= v.pax}
            onClick={addDrink}
          >
            +1 drink
          </button>

          <button
            className="border rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={endVisit}
          >
            End
          </button>

          <button
            className="border rounded px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              // Retry fetching UEN in case session timing was weird
              if (!paynowUen) await loadPaynowAndPrices();

              setExtendPeople(v.pax);
              setExtendHours(1);
              setShowExtendPaynow(false);
              setShowExtend(true);
            }}
          >
            Extend
          </button>

          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{mmss}</div>
            <div className="text-sm opacity-70">remaining</div>
          </div>
        </div>
      </div>

      {showExtend && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !busy && setShowExtend(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 border rounded bg-black p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Extend: {v.name}</div>
              <button
                className="border rounded px-3 py-1 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  setShowExtendPaynow(false);
                  setShowExtend(false);
                }}
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm opacity-70">People extending</div>
                <input
                  className="border rounded p-2 w-24 text-right"
                  type="number"
                  min={1}
                  max={v.pax}
                  value={extendPeople}
                  onChange={(e) =>
                    setExtendPeople(
                      Math.min(v.pax, Math.max(1, Number(e.target.value))),
                    )
                  }
                  disabled={busy}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm opacity-70">Hours to add</div>
                <input
                  className="border rounded p-2 w-24 text-right"
                  type="number"
                  min={1}
                  value={extendHours}
                  onChange={(e) =>
                    setExtendHours(Math.max(1, Number(e.target.value)))
                  }
                  disabled={busy}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm opacity-70">Amount</div>
                <div className="text-lg font-semibold">
                  ${extendAmount.toFixed(2)}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="border rounded px-3 py-2 text-sm disabled:opacity-50"
                  disabled={busy}
                  onClick={() => extend("CASH")}
                >
                  Cash
                </button>

                <button
                  className="border rounded px-3 py-2 text-sm disabled:opacity-50"
                  disabled={busy}
                  onClick={() => setShowExtendPaynow(true)}
                >
                  PayNow
                </button>

                <button
                  className="border rounded px-3 py-2 text-sm opacity-70 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    setShowExtendPaynow(false);
                    setShowExtend(false);
                  }}
                >
                  Cancel
                </button>
              </div>

              {showExtendPaynow && (
                <div className="mt-4 space-y-3">
                  {!paynowUen ? (
                    <div className="text-sm text-red-400">
                      Missing PayNow UEN in settings.
                    </div>
                  ) : (
                    <div className="flex justify-center bg-white p-3 rounded">
                      <QRCodeCanvas
                        value={buildPayNowPayload({
                          uen: paynowUen,
                          amount: extendAmount,
                          merchantName: "Shelter",
                          merchantCity: "Singapore",
                          editable: false,
                        })}
                        size={240}
                        includeMargin
                      />
                    </div>
                  )}

                  <button
                    className="w-full border rounded p-2 disabled:opacity-50"
                    disabled={busy || !paynowUen}
                    onClick={() => extend("PAYNOW")}
                  >
                    Confirm payment received
                  </button>

                  <button
                    className="w-full border rounded p-2 opacity-70 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => setShowExtendPaynow(false)}
                  >
                    Hide QR
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
