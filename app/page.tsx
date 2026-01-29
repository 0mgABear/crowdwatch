"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { QRCodeCanvas } from "qrcode.react";

import { supabase } from "@/lib/supabaseClient";
import {
  rpcCollectDrink,
  rpcEndSeat,
  rpcExtendSeatsAndCollectPayment,
} from "@/lib/rpc";
import { buildPayNowPayload } from "@/lib/paynow";

type Seat = { seat_no: number; end_time: string | null };
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

function MoneyBagIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 7c1.8 1 4.2 1 6 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10 4h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8.5 9.5c-2 1.8-3 4-3 6.4 0 3.3 2.6 5.1 6.5 5.1s6.5-1.8 6.5-5.1c0-2.4-1-4.6-3-6.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 13.7c0-1 0.8-1.7 1.8-1.7s1.8 0.7 1.8 1.7c0 1.7-3.6 1-3.6 2.7 0 0.9 0.8 1.6 1.8 1.6s1.8-0.7 1.8-1.6"
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

  // admin modal
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPw, setAdminPw] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState<boolean | null>(null);

  // Today dropdown
  const [todayOpen, setTodayOpen] = useState(false);
  const [todayTotals, setTodayTotals] = useState<{
    cash: number;
    paynow: number;
    groups: number;
    people: number;
  } | null>(null);

  const pressTimer = useRef<number | null>(null);

  async function loadTodayTotals() {
    const r = await fetch("/api/totals/today", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? "Failed to load totals");
    setTodayTotals(j?.totals ?? null);
  }

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
    loadTodayTotals().catch(console.error);
  }, []);

  useEffect(() => {
    loadDashboard();

    const channel = supabase
      .channel("dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visits" },
        () => {
          loadDashboard();
          loadTodayTotals().catch(console.error);
        },
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => loadTodayTotals().catch(console.error),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [drinkProductId]);

  // total pax counts “people left” (uses seats when present, else pax)
  const totalPax = useMemo(() => {
    const now = Date.now();
    return visits.reduce((sum, v) => {
      const activeSeats = (v.seats ?? []).filter((s) => {
        if (!s.end_time) return true;
        return new Date(s.end_time).getTime() > now;
      });
      const inside = (v.seats?.length ?? 0) > 0 ? activeSeats.length : v.pax;
      return sum + inside;
    }, 0);
  }, [visits]);

  const capColor =
    totalPax <= 8
      ? "text-green-300"
      : totalPax <= 15
        ? "text-orange-300"
        : "text-red-300";

  async function refreshAdminAuthed() {
    const r = await fetch("/api/admin/me", { cache: "no-store" });
    const j = await r.json();
    setAdminAuthed(!!j.authed);
  }

  async function adminLogin() {
    setAdminBusy(true);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPw }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Login failed");
      await refreshAdminAuthed();
      setAdminOpen(false);
      setAdminPw("");
      window.location.href = "/admin";
    } catch (e: any) {
      alert(e.message ?? "Login failed");
    } finally {
      setAdminBusy(false);
    }
  }

  async function adminLogout() {
    setAdminBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      await refreshAdminAuthed();
      setAdminOpen(false);
      setAdminPw("");
    } finally {
      setAdminBusy(false);
    }
  }

  function startLongPress() {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(async () => {
      setAdminOpen(true);
      await refreshAdminAuthed().catch(() => setAdminAuthed(false));
    }, 650);
  }

  function cancelLongPress() {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  const t = todayTotals ?? { cash: 0, paynow: 0, groups: 0, people: 0 };

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 space-y-4 max-w-3xl mx-auto pb-24">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Admin"
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            onMouseDown={startLongPress}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            className="rounded-full select-none"
          >
            <Image
              src="/patacat.jpg"
              alt="Admin"
              width={40}
              height={40}
              className="rounded-full border border-white/20 pointer-events-none"
            />
          </button>

          <div>
            <div className="text-lg font-semibold">CrowdWatch</div>
            <div className="text-xs text-white/50">
              {adminAuthed ? "Admin" : ""}
            </div>
          </div>
        </div>

        <div className={`flex items-center gap-2 ${capColor}`}>
          <PersonIcon className="h-6 w-6" />
          <div className="text-2xl font-bold tabular-nums">{totalPax}</div>
        </div>
      </div>

      {/* Today collapsible */}
      <div className="rounded-lg border border-white/15 bg-white/5 overflow-hidden">
        <button
          type="button"
          onClick={() => setTodayOpen((x) => !x)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <div className="font-semibold">Today</div>
          <div className="text-white/60">{todayOpen ? "▴" : "▾"}</div>
        </button>

        {todayOpen && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <div className="text-white/70">Cash</div>
              <div className="text-right font-semibold tabular-nums">
                ${t.cash.toFixed(2)}
              </div>

              <div className="text-white/70">PayNow</div>
              <div className="text-right font-semibold tabular-nums">
                ${t.paynow.toFixed(2)}
              </div>

              <div className="text-white/70">Groups</div>
              <div className="text-right font-semibold tabular-nums">
                {t.groups}
              </div>

              <div className="text-white/70">People</div>
              <div className="text-right font-semibold tabular-nums">
                {t.people}
              </div>
            </div>

            <button
              className="mt-3 w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              onClick={() => loadTodayTotals().catch(console.error)}
            >
              Refresh totals
            </button>
          </div>
        )}
      </div>

      <div className="h-px w-full bg-white/10" />

      <div className="text-xl sm:text-2xl font-bold tracking-wide text-white">
        Current visits
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

      {/* Bottom center New check-in */}
      {/* Bottom center actions */}
      <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center gap-3">
          <Link
            href="/new-checkin"
            aria-label="New check-in"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur hover:bg-white/15"
          >
            <PersonIcon className="h-6 w-6" />
          </Link>

          <Link
            href="/new-sale"
            aria-label="New sale"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur hover:bg-white/15"
          >
            <MoneyBagIcon className="h-6 w-6" />
          </Link>
        </div>
      </div>

      {/* ADMIN MODAL */}
      {adminOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => !adminBusy && setAdminOpen(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/20 bg-black p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Admin</div>
                <div className="text-sm text-white/60">
                  Long-press logo anytime to open.
                </div>
              </div>
              <button
                className="rounded border border-white/20 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
                disabled={adminBusy}
                onClick={() => setAdminOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {!adminAuthed ? (
                <>
                  <div className="text-sm text-white/70">Password</div>
                  <input
                    className="w-full rounded border border-white/20 bg-black px-4 py-3 text-white text-sm outline-none"
                    type="password"
                    value={adminPw}
                    onChange={(e) => setAdminPw(e.target.value)}
                    placeholder="Enter admin password"
                  />
                  <button
                    disabled={adminBusy || !adminPw}
                    onClick={adminLogin}
                    className="w-full rounded border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"
                  >
                    Log in
                  </button>
                </>
              ) : (
                <>
                  <div className="text-sm text-white/70">You’re logged in.</div>
                  <Link
                    href="/admin"
                    className="block w-full rounded border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-semibold hover:bg-white/15"
                    onClick={() => setAdminOpen(false)}
                  >
                    Go to Admin page
                  </Link>
                  <button
                    disabled={adminBusy}
                    onClick={adminLogout}
                    className="w-full rounded border border-white/20 px-4 py-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
                  >
                    Log out
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
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

  const [showExtend, setShowExtend] = useState(false);
  const [extendHours, setExtendHours] = useState(1);
  const [showExtendPaynow, setShowExtendPaynow] = useState(false);
  const [selectedSeatNos, setSelectedSeatNos] = useState<number[]>([]);

  const [showLeaveCount, setShowLeaveCount] = useState(false);
  const [leaveCount, setLeaveCount] = useState(1);

  const [showDrink, setShowDrink] = useState(false);
  const [drinkQty, setDrinkQty] = useState<string>("1");

  const drinkQtyN = useMemo(() => {
    const n = Math.trunc(Number(drinkQty || 0));
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(999, n));
  }, [drinkQty]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const seatRows = useMemo(() => {
    return [...(v.seats ?? [])].sort((a, b) => a.seat_no - b.seat_no);
  }, [v.seats]);

  const activeSeats = useMemo(() => {
    return seatRows.filter((s) => {
      if (!s.end_time) return true;
      return new Date(s.end_time).getTime() > now;
    });
  }, [seatRows, now]);

  const hasSeatRows = seatRows.length > 0;
  const peopleLeft = hasSeatRows ? activeSeats.length : v.pax;

  const canPartialLeave = hasSeatRows && peopleLeft > 1;

  async function ensureSeatRows() {
    if (hasSeatRows) return;

    const endIso =
      v.est_end_time ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const rows = Array.from({ length: v.pax }, (_, i) => ({
      visit_id: v.id,
      seat_no: i + 1,
      end_time: endIso,
    }));

    const { error } = await supabase
      .from("visit_seats")
      .upsert(rows, { onConflict: "visit_id,seat_no" });

    if (error) throw error;
  }

  const hasExtensions = hasSeatRows;

  const allSeatNos = useMemo(() => {
    return activeSeats.length > 0
      ? activeSeats.map((s) => s.seat_no)
      : Array.from({ length: v.pax }, (_, i) => i + 1);
  }, [activeSeats, v.pax]);

  const needsSeatPicker = allSeatNos.length > 1;

  const groupEndTimeIso = useMemo(() => {
    if (activeSeats.length > 0) {
      const maxMs = Math.max(
        ...activeSeats
          .map((s) => (s.end_time ? new Date(s.end_time).getTime() : NaN))
          .filter((x) => Number.isFinite(x)),
      );
      if (Number.isFinite(maxMs)) return new Date(maxMs).toISOString();
    }
    return v.est_end_time;
  }, [activeSeats, v.est_end_time]);

  function fmtMs(ms: number) {
    const t = Math.max(0, ms);
    const totalSec = Math.floor(t / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  const seatTimers = useMemo(() => {
    if (!hasExtensions) return null;

    const fallbackEndMs = groupEndTimeIso
      ? new Date(groupEndTimeIso).getTime()
      : null;

    const map = new Map<number, number>(); // endMs -> count
    for (const s of activeSeats) {
      const endMs = s.end_time ? new Date(s.end_time).getTime() : fallbackEndMs;
      if (endMs == null || !Number.isFinite(endMs)) continue;
      map.set(endMs, (map.get(endMs) ?? 0) + 1);
    }

    const items = Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([endMs, count]) => ({
        endMs,
        label: `${count} pax · ${fmtMs(endMs - now)}`,
      }));

    return items.length ? items : null;
  }, [hasExtensions, activeSeats, now, groupEndTimeIso]);

  const mmss = useMemo(() => {
    if (!groupEndTimeIso) return "--:--";
    const ms = new Date(groupEndTimeIso).getTime() - now;
    return fmtMs(ms);
  }, [groupEndTimeIso, now]);

  const timerLabel = peopleLeft <= 1 ? "ends" : "group ends";
  const drinksOk = v.drinks_collected >= v.pax;

  function openDrinkModal() {
    if (busy) return;
    setDrinkQty("1");
    setShowDrink(true);
  }

  async function confirmDrink(qty: number) {
    if (busy) return;
    if (qty < 1) return;

    setBusy(true);
    try {
      await rpcCollectDrink({ visitId: v.id, qty });
      setShowDrink(false);
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

    if (peopleLeft <= 1) {
      await endEntireVisit();
      return;
    }

    if (!hasSeatRows) {
      try {
        setBusy(true);
        await ensureSeatRows();
        await onReload();
      } catch (e: any) {
        alert(e.message ?? "Failed to enable partial checkout");
        return;
      } finally {
        setBusy(false);
      }
    }

    setLeaveCount(1);
    setShowLeaveCount(true);
  }

  const extendAmount = selectedSeatNos.length * extendHours * extensionPrice;

  async function extend(method: "CASH" | "PAYNOW") {
    if (busy) return;

    if (needsSeatPicker && selectedSeatNos.length === 0) {
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
              onClick={openDrinkModal}
              disabled={busy}
              className="rounded border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              + Drink
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
                setSelectedSeatNos(allSeatNos); // auto-select
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
          <div className="text-4xl font-bold tabular-nums">
            {seatTimers?.[0]?.label.split(" · ")[1] ?? mmss}
          </div>
          <div className="text-sm opacity-70">
            {hasExtensions ? "next checkout" : timerLabel}
          </div>

          {seatTimers && seatTimers.length > 1 && (
            <div className="mt-2 space-y-1 text-xs text-white/60">
              {seatTimers.slice(1).map((t) => (
                <div key={t.endMs}>{t.label}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* DRINK MODAL */}
      {showDrink && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => !busy && setShowDrink(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/20 bg-black p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Add drinks</div>
                <div className="text-sm text-white/60">{v.name}</div>
              </div>
              <button
                disabled={busy}
                onClick={() => setShowDrink(false)}
                className="rounded border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="text-sm text-white/70">How many drinks?</div>

              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 5].map((n) => (
                  <button
                    key={n}
                    disabled={busy}
                    onClick={() => setDrinkQty(String(n))}
                    className={`rounded border px-3 py-2 text-sm disabled:opacity-50 ${
                      drinkQtyN === n
                        ? "border-white/40 bg-white/10"
                        : "border-white/20"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white/70">Custom</div>
                <input
                  className="w-28 rounded border border-white/20 bg-black px-3 py-2 text-right text-sm outline-none [appearance:textfield]"
                  inputMode="numeric"
                  value={drinkQty}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // allow empty while typing
                    if (raw.trim() === "") return setDrinkQty("");
                    const n = Math.trunc(Number(raw));
                    if (!Number.isFinite(n)) return;
                    setDrinkQty(String(Math.max(1, Math.min(999, n))));
                  }}
                  onBlur={() => {
                    // normalize empty -> 1
                    if (drinkQty.trim() === "") setDrinkQty("1");
                  }}
                  disabled={busy}
                />
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => setShowDrink(false)}
                  className="flex-1 rounded border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  disabled={busy}
                  onClick={() => confirmDrink(drinkQtyN)}
                  className="flex-1 rounded border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
                >
                  Add {drinkQtyN}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

            {!canPartialLeave && (
              <div className="mt-1 text-xs text-white/50">
                Partial checkout unavailable.
              </div>
            )}

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
                    return;
                  }
                  if (!canPartialLeave) {
                    alert("Partial checkout isn't available for this visit.");
                    return;
                  }
                  await endSomePeople(leaveCount);
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
          <div className="absolute left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/20 bg-black p-4">
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
              {needsSeatPicker && (
                <div className="space-y-2">
                  <div className="text-sm opacity-70">
                    Who is extending ({selectedSeatNos.length})
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {allSeatNos.map((seatNo) => {
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
              )}

              <div className="flex items-center justify-between">
                <div className="text-sm opacity-70">Hours to add</div>
                <input
                  className="border rounded p-2 w-24 text-right bg-black"
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
