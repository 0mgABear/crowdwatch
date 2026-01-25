"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import {
  rpcCollectDrink,
  rpcEndSeat,
  rpcExtendSeatsAndCollectPayment,
} from "@/lib/rpc";
import { QRCodeCanvas } from "qrcode.react";
import { buildPayNowPayload } from "@/lib/paynow";

type Seat = { seat_no: number; end_time: string };

type Visit = {
  id: string;
  name: string;
  pax: number;
  status: "ACTIVE";
  est_end_time: string | null;
  drinks_collected: number;
  seats: Seat[];
};

function PersonIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4.5 20.2c1.9-4 13.1-4 15 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function DashboardPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [paynowUen, setPaynowUen] = useState<string | null>(null);
  const [extensionPrice, setExtensionPrice] = useState<number>(5);
  const [drinkProductId, setDrinkProductId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  async function loadPaynowAndPrices() {
    const { data: s } = await supabase
      .from("settings")
      .select("paynow_uen")
      .eq("id", 1)
      .single();
    if (s?.paynow_uen) setPaynowUen(s.paynow_uen);

    const { data: p } = await supabase
      .from("products")
      .select("price")
      .eq("name", "Extension hour")
      .eq("active", true)
      .single();
    if (p?.price != null) setExtensionPrice(Number(p.price));
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

    if (error || !data) {
      setVisits([]);
      return;
    }

    const visitIds = data.map((v) => v.id);

    const { data: vp } = await supabase
      .from("visit_products")
      .select("visit_id, product_id, qty")
      .in("visit_id", visitIds);

    const { data: seats } = await supabase
      .from("visit_seats")
      .select("visit_id, seat_no, end_time")
      .in("visit_id", visitIds);

    const drinksMap = new Map<string, number>();
    if (drinkProductId) {
      (vp ?? []).forEach((row: any) => {
        if (row.product_id === drinkProductId) {
          drinksMap.set(row.visit_id, row.qty);
        }
      });
    }

    const seatsMap = new Map<string, Seat[]>();
    (seats ?? []).forEach((r: any) => {
      const arr = seatsMap.get(r.visit_id) ?? [];
      arr.push({ seat_no: r.seat_no, end_time: r.end_time });
      seatsMap.set(r.visit_id, arr);
    });
    seatsMap.forEach((arr) => arr.sort((a, b) => a.seat_no - b.seat_no));

    setVisits(
      data.map((v: any) => ({
        ...v,
        drinks_collected: drinksMap.get(v.id) ?? 0,
        seats: seatsMap.get(v.id) ?? [],
      })),
    );
  }

  useEffect(() => {
    loadPaynowAndPrices().catch(console.error);
    loadDrinkProductId().catch(console.error);

    // optional: if you created /api/admin/me, this will light up Admin on refresh
    fetch("/api/admin/me")
      .then((r) => setIsAdmin(r.ok))
      .catch(() => {});
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
  }, [drinkProductId]);

  const totalPax = useMemo(() => {
    const now = Date.now();
    return visits.reduce((sum, v) => {
      const activeSeats = (v.seats ?? []).filter(
        (s) => new Date(s.end_time).getTime() > now,
      );
      const inside = activeSeats.length > 0 ? activeSeats.length : v.pax;
      return sum + inside;
    }, 0);
  }, [visits]);

  const capacityColor =
    totalPax <= 8
      ? "text-green-400"
      : totalPax <= 15
        ? "text-orange-400"
        : "text-red-400";

  // long-press on logo to open admin login
  useEffect(() => {
    let t: any = null;
    const el = document.getElementById("logo-longpress");
    if (!el) return;

    const start = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const password = window.prompt("Admin password:");
        if (!password) return;
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) {
          alert("Wrong password");
          return;
        }
        setIsAdmin(true);
      }, 700);
    };
    const cancel = () => {
      clearTimeout(t);
    };

    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);

    return () => {
      cancel();
      el.removeEventListener("pointerdown", start);
      el.removeEventListener("pointerup", cancel);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("pointerleave", cancel);
    };
  }, []);

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 space-y-4 max-w-3xl mx-auto pb-24">
      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Home">
            <Image
              id="logo-longpress"
              src="/patacat.jpg"
              alt="Home"
              width={44}
              height={44}
              className="rounded-full border border-white/20"
            />
          </Link>

          <div>
            <div className="text-lg font-semibold">CrowdWatch</div>
            {isAdmin && <div className="text-xs text-white/50">Admin</div>}
          </div>
        </div>

        {/* CAPACITY (top-right) */}
        <div className={`flex items-center gap-2 ${capacityColor}`}>
          <PersonIcon className="h-6 w-6" />
          <div className="text-3xl font-bold tabular-nums leading-none">
            {totalPax}
          </div>
        </div>
      </div>

      {/* VISITS */}
      <div className="space-y-3">
        {visits.length === 0 && (
          <div className="opacity-60">No active visits</div>
        )}

        {visits.map((v) => (
          <VisitCard
            key={v.id}
            v={v}
            onReload={loadDashboard}
            loadPaynowAndPrices={loadPaynowAndPrices}
            paynowUen={paynowUen}
            extensionPrice={extensionPrice}
          />
        ))}
      </div>

      {/* BOTTOM CENTER NEW CHECK-IN */}
      <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center">
        <Link
          href="/new-checkin"
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur hover:bg-white/15"
          style={{
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          }}
        >
          <PlusIcon className="h-5 w-5" />
          New check-in
        </Link>
      </div>
    </div>
  );
}

function VisitCard({
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

  // extend modal
  const [showExtend, setShowExtend] = useState(false);
  const [extendHours, setExtendHours] = useState(1);
  const [showExtendPaynow, setShowExtendPaynow] = useState(false);
  const [selectedSeatNos, setSelectedSeatNos] = useState<number[]>([]);

  // partial-leave modal (only when seats exist)
  const [showLeaveCount, setShowLeaveCount] = useState(false);
  const [leaveCount, setLeaveCount] = useState(1);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const activeSeats = useMemo(() => {
    return (v.seats ?? []).filter((s) => new Date(s.end_time).getTime() > now);
  }, [v.seats, now]);

  const hasExtensions = activeSeats.length > 0;
  const peopleLeft = hasExtensions ? activeSeats.length : v.pax;

  const groupEndTimeIso = useMemo(() => {
    if (activeSeats.length > 0) {
      const maxMs = Math.max(...activeSeats.map((s) => +new Date(s.end_time)));
      return new Date(maxMs).toISOString();
    }
    return v.est_end_time;
  }, [activeSeats, v.est_end_time]);

  const mmss = useMemo(() => {
    if (!groupEndTimeIso) return "--:--";
    const ms = new Date(groupEndTimeIso).getTime() - now;
    const t = Math.max(0, ms);
    const totalSec = Math.floor(t / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [groupEndTimeIso, now]);

  const timerLabel = peopleLeft <= 1 ? "ends" : "group ends";

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

  async function endEntireVisit() {
    if (busy) return;
    if (!confirm(`End visit for ${v.name}?`)) return;

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

  async function endSomePeople(count: number) {
    if (activeSeats.length === 0) {
      alert("Partial checkout needs seat rows (created via extensions).");
      return;
    }

    const toEnd = activeSeats
      .slice()
      .sort((a, b) => a.seat_no - b.seat_no)
      .slice(0, count);

    setBusy(true);
    try {
      for (const s of toEnd) {
        await rpcEndSeat({ visitId: v.id, seatNo: s.seat_no });
      }
      await onReload();
      setShowLeaveCount(false);
    } catch (e: any) {
      alert(e.message ?? "Failed to checkout seats");
    } finally {
      setBusy(false);
    }
  }

  async function onEndPressed() {
    if (busy) return;

    // no seats => only end entire visit (no safe partial without DB support)
    if (!hasExtensions) {
      await endEntireVisit();
      return;
    }

    if (peopleLeft <= 1) {
      await endEntireVisit();
      return;
    }

    setLeaveCount(1);
    setShowLeaveCount(true);
  }

  const extendAmount = selectedSeatNos.length * extendHours * extensionPrice;

  async function extend(method: "CASH" | "PAYNOW") {
    if (busy) return;
    if (selectedSeatNos.length === 0) {
      alert("Select at least 1 seat to extend.");
      return;
    }
    if (!confirm("Collect payment and extend?")) return;

    setBusy(true);
    try {
      await rpcExtendSeatsAndCollectPayment({
        visitId: v.id,
        seatNos: selectedSeatNos,
        addHours: extendHours,
        method,
      });

      setShowExtendPaynow(false);
      setShowExtend(false);
      await onReload();
    } catch (e: any) {
      alert(e.message ?? "Failed to extend");
    } finally {
      setBusy(false);
    }
  }

  const drinksOk = v.drinks_collected >= v.pax;

  return (
    <div className="rounded-lg border border-white/15 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-lg font-semibold truncate">{v.name}</div>

          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2">
              <PersonIcon className="h-5 w-5 text-white/70" />
              <span className="font-medium">{peopleLeft}</span>
            </span>

            <span
              className={`text-xs px-2 py-1 rounded font-medium ${
                drinksOk
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              Drinks {v.drinks_collected}/{v.pax}
            </span>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={addDrink}
              disabled={busy || v.drinks_collected >= v.pax}
              className="rounded border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              +1 drink
            </button>

            <button
              onClick={onEndPressed}
              disabled={busy}
              className="rounded border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              End
            </button>

            <button
              onClick={async () => {
                if (!paynowUen) await loadPaynowAndPrices();
                setExtendHours(1);

                const seats =
                  activeSeats.length > 0
                    ? activeSeats.map((s) => s.seat_no)
                    : Array.from({ length: v.pax }, (_, i) => i + 1);

                setSelectedSeatNos(seats);
                setShowExtendPaynow(false);
                setShowExtend(true);
              }}
              disabled={busy}
              className="rounded border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              Extend
            </button>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-4xl font-bold tabular-nums">{mmss}</div>
          <div className="text-sm opacity-70">{timerLabel}</div>
        </div>
      </div>

      {/* LEAVE COUNT MODAL */}
      {showLeaveCount && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !busy && setShowLeaveCount(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/20 bg-black p-4">
            <div className="text-lg font-semibold">
              How many people are leaving?
            </div>
            <div className="mt-1 text-sm text-white/60">
              {v.name} has {peopleLeft} people left.
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  disabled={busy || n > peopleLeft - 1}
                  onClick={() => setLeaveCount(n)}
                  className={`rounded border px-3 py-2 text-sm disabled:opacity-50 ${
                    leaveCount === n
                      ? "border-white/40 bg-white/10"
                      : "border-white/20"
                  }`}
                >
                  {n}
                </button>
              ))}

              <button
                disabled={busy}
                onClick={() => setLeaveCount(peopleLeft)}
                className={`rounded border px-3 py-2 text-sm disabled:opacity-50 ${
                  leaveCount === peopleLeft
                    ? "border-white/40 bg-white/10"
                    : "border-white/20"
                }`}
              >
                All
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                disabled={busy}
                onClick={() => setShowLeaveCount(false)}
                className="flex-1 rounded border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                disabled={busy}
                onClick={async () => {
                  if (leaveCount >= peopleLeft) {
                    await endEntireVisit();
                    setShowLeaveCount(false);
                  } else {
                    await endSomePeople(leaveCount);
                  }
                }}
                className="flex-1 rounded border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>

            <button
              disabled={busy}
              onClick={async () => {
                await endEntireVisit();
                setShowLeaveCount(false);
              }}
              className="mt-3 w-full rounded border border-white/20 px-3 py-2 text-sm opacity-70 hover:bg-white/10 disabled:opacity-50"
            >
              End entire group
            </button>
          </div>
        </div>
      )}

      {/* EXTEND MODAL */}
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
              <div className="space-y-2">
                <div className="text-sm opacity-70">
                  Who is extending ({selectedSeatNos.length})
                </div>

                <div className="flex flex-wrap gap-2">
                  {(activeSeats.length > 0
                    ? activeSeats.map((s) => s.seat_no)
                    : Array.from({ length: v.pax }, (_, i) => i + 1)
                  ).map((seatNo) => {
                    const selected = selectedSeatNos.includes(seatNo);
                    return (
                      <button
                        key={seatNo}
                        className={`border rounded px-2 py-1 text-xs disabled:opacity-50 ${
                          selected ? "bg-white/10" : ""
                        }`}
                        disabled={busy}
                        onClick={() => {
                          setSelectedSeatNos((prev) =>
                            prev.includes(seatNo)
                              ? prev.filter((x) => x !== seatNo)
                              : [...prev, seatNo].sort((a, b) => a - b),
                          );
                        }}
                      >
                        S{seatNo}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm opacity-70">Hours to add</div>
                <input
                  className="border rounded p-2 w-24 text-right"
                  type="number"
                  min={1}
                  value={extendHours}
                  onChange={(e) => setExtendHours(Math.max(1, +e.target.value))}
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
