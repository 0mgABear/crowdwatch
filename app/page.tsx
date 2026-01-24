"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  rpcCollectDrink,
  rpcExtendVisitPartial,
  rpcEndSeat,
  rpcExtendSeats,
} from "@/lib/rpc";
import { QRCodeCanvas } from "qrcode.react";
import { buildPayNowPayload } from "@/lib/paynow";

type Seat = { seat_no: number; end_time: string };
type Visit = {
  id: string;
  name: string;
  pax: number;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  est_end_time: string | null;
  drinks_collected: number;
  seats: Seat[];
};

export default function DashboardPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [paynowUen, setPaynowUen] = useState<string | null>(null);
  const [extensionPrice, setExtensionPrice] = useState<number>(5);
  const [drinkProductId, setDrinkProductId] = useState<string | null>(null);

  async function loadPaynowAndPrices() {
    const { data: s, error: sErr } = await supabase
      .from("settings")
      .select("paynow_uen")
      .eq("id", 1)
      .single();
    if (!sErr && s?.paynow_uen) setPaynowUen(s.paynow_uen);

    const { data: p, error: pErr } = await supabase
      .from("products")
      .select("price")
      .eq("name", "Extension hour")
      .eq("active", true)
      .single();
    if (!pErr && p?.price != null) setExtensionPrice(Number(p.price));
  }

  async function loadDrinkProductId() {
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("name", "Drink")
      .eq("active", true)
      .single();
    if (data?.id) setDrinkProductId(data.id);
  }

  async function loadDashboard() {
    const { data, error } = await supabase
      .from("visits")
      .select("id,name,pax,status,est_end_time")
      .eq("status", "ACTIVE")
      .order("est_end_time", { ascending: true });

    if (error) return;

    const base = (data ?? []) as Array<
      Omit<Visit, "drinks_collected" | "seats">
    >;

    if (base.length === 0) {
      setVisits([]);
      return;
    }

    const visitIds = base.map((v) => v.id);

    const { data: vp, error: vpErr } = await supabase
      .from("visit_products")
      .select("visit_id, product_id, qty")
      .in("visit_id", visitIds);

    const { data: seats, error: seatErr } = await supabase
      .from("visit_seats")
      .select("visit_id, seat_no, end_time")
      .in("visit_id", visitIds);

    const drinksMap = new Map<string, number>();
    if (!vpErr && drinkProductId) {
      (vp ?? []).forEach((row: any) => {
        if (row.product_id === drinkProductId) {
          drinksMap.set(row.visit_id, row.qty);
        }
      });
    }

    const seatsMap = new Map<string, Seat[]>();
    if (!seatErr) {
      (seats ?? []).forEach((r: any) => {
        const arr = seatsMap.get(r.visit_id) ?? [];
        arr.push({ seat_no: r.seat_no, end_time: r.end_time });
        seatsMap.set(r.visit_id, arr);
      });
      seatsMap.forEach((arr) => arr.sort((a, b) => a.seat_no - b.seat_no));
    }

    setVisits(
      base.map((v) => ({
        ...v,
        drinks_collected: drinksMap.get(v.id) ?? 0,
        seats: seatsMap.get(v.id) ?? [],
      })),
    );
  }

  useEffect(() => {
    loadPaynowAndPrices().catch(console.error);
    loadDrinkProductId().catch(console.error);
  }, []);

  useEffect(() => {
    loadDashboard();

    const channel = supabase
      .channel("dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits" },
        () => loadDashboard(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visit_products" },
        () => loadDashboard(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visit_seats" },
        () => loadDashboard(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drinkProductId]);

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
            onReload={loadDashboard}
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

  // NEW: pick exactly which seats extend
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);

  const extendAmount = extendPeople * extendHours * extensionPrice;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const activeSeats = useMemo(() => {
    // only seats that haven't ended yet
    return (v.seats ?? []).filter((s) => new Date(s.end_time).getTime() > now);
  }, [v.seats, now]);

  // Big timer:
  // - if seats exist: show max(active seat end_time)
  // - else: fallback to visit.est_end_time
  const groupEndTime = useMemo(() => {
    if (activeSeats.length > 0) {
      const maxMs = Math.max(
        ...activeSeats.map((s) => new Date(s.end_time).getTime()),
      );
      return new Date(maxMs).toISOString();
    }
    return v.est_end_time;
  }, [activeSeats, v.est_end_time]);

  const remaining = useMemo(() => {
    if (!groupEndTime) return null;
    const ms = new Date(groupEndTime).getTime() - now;
    return Math.max(0, ms);
  }, [groupEndTime, now]);

  const mmss = useMemo(() => {
    if (remaining === null) return "--:--";
    const totalSec = Math.floor(remaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [remaining]);

  function seatMmss(end_time: string) {
    const ms = new Date(end_time).getTime() - now;
    const t = Math.max(0, ms);
    const totalSec = Math.floor(t / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

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

  async function endSeat(seatNo: number) {
    if (!confirm(`Checkout seat ${seatNo} for ${v.name}?`)) return;
    if (busy) return;

    setBusy(true);
    try {
      await rpcEndSeat({ visitId: v.id, seatNo });
      await onReload();
    } catch (e: any) {
      alert(e.message ?? "Failed to checkout seat");
    } finally {
      setBusy(false);
    }
  }

  function toggleSeat(seatNo: number) {
    setSelectedSeats((prev) => {
      const has = prev.includes(seatNo);
      if (has) return prev.filter((x) => x !== seatNo);
      if (prev.length >= extendPeople) return prev; // cap at extendPeople
      return [...prev, seatNo].sort((a, b) => a - b);
    });
  }

  async function extend(method: "CASH" | "PAYNOW") {
    if (busy) return;
    if (!confirm("Collect payment and extend?")) return;

    // if no seats exist for some reason, fallback to old behavior
    if (activeSeats.length === 0) {
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
      return;
    }

    // seat-based extend:
    // if extending everyone => auto-select all active seats
    const seatNos =
      extendPeople >= activeSeats.length
        ? activeSeats.map((s) => s.seat_no)
        : selectedSeats;

    if (extendPeople < activeSeats.length && seatNos.length !== extendPeople) {
      alert(`Pick ${extendPeople} seat(s) to extend.`);
      return;
    }

    setBusy(true);
    try {
      await rpcExtendSeats({
        visitId: v.id,
        seatNos,
        addHours: extendHours,
        method,
      });

      setSelectedSeats([]);
      setShowExtendPaynow(false);
      setShowExtend(false);
      await onReload();
    } catch (e: any) {
      alert(e.message ?? "Failed to extend visit");
    } finally {
      setBusy(false);
    }
  }

  const showSeatSplit = activeSeats.length > 0;

  return (
    <div className="space-y-2">
      <div className="border rounded p-3 flex items-center justify-between">
        {/* LEFT */}
        <div className="space-y-2">
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

          {showSeatSplit && (
            <div className="flex flex-wrap gap-2">
              {activeSeats.map((s) => (
                <button
                  key={s.seat_no}
                  className="border rounded px-2 py-1 text-xs disabled:opacity-50"
                  disabled={busy}
                  onClick={() => endSeat(s.seat_no)}
                  title="Click to checkout this seat"
                >
                  End S{s.seat_no} {seatMmss(s.end_time)}
                </button>
              ))}
            </div>
          )}
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
              if (!paynowUen) await loadPaynowAndPrices();

              setExtendPeople(
                Math.max(1, Math.min(v.pax, activeSeats.length || v.pax)),
              );
              setExtendHours(1);
              setSelectedSeats([]);
              setShowExtendPaynow(false);
              setShowExtend(true);
            }}
          >
            Extend
          </button>

          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{mmss}</div>
            <div className="text-sm opacity-70">group ends</div>
          </div>
        </div>
      </div>

      {showExtend && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !busy && setShowExtend(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 border rounded bg-black p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Extend: {v.name}</div>
              <button
                className="border rounded px-3 py-1 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  setSelectedSeats([]);
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
                  className="border rounded p-2 w-28 text-right"
                  type="number"
                  min={1}
                  max={Math.max(1, activeSeats.length || v.pax)}
                  value={extendPeople}
                  onChange={(e) => {
                    const max = Math.max(1, activeSeats.length || v.pax);
                    const next = Math.min(
                      max,
                      Math.max(1, Number(e.target.value)),
                    );
                    setExtendPeople(next);
                    setSelectedSeats([]); // reset selection when count changes
                  }}
                  disabled={busy}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm opacity-70">Hours to add</div>
                <input
                  className="border rounded p-2 w-28 text-right"
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

              {/* NEW: Seat picker only if not everyone extends */}
              {activeSeats.length > 0 && extendPeople < activeSeats.length && (
                <div className="space-y-2">
                  <div className="text-sm opacity-70">
                    Pick {extendPeople} seat(s) to extend
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeSeats.map((s) => {
                      const selected = selectedSeats.includes(s.seat_no);
                      return (
                        <button
                          key={s.seat_no}
                          className={`border rounded px-2 py-1 text-xs disabled:opacity-50 ${
                            selected ? "bg-white/10" : ""
                          }`}
                          disabled={busy}
                          onClick={() => toggleSeat(s.seat_no)}
                        >
                          S{s.seat_no} {seatMmss(s.end_time)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-xs opacity-60">
                    Selected: {selectedSeats.length}/{extendPeople}
                  </div>
                </div>
              )}

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
                    setSelectedSeats([]);
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
                    disabled={
                      busy ||
                      !paynowUen ||
                      (activeSeats.length > 0 &&
                        extendPeople < activeSeats.length &&
                        selectedSeats.length !== extendPeople)
                    }
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
