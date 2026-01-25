"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { rpcStartVisit } from "@/lib/rpc";
import { buildPayNowPayload } from "@/lib/paynow";
import { QRCodeSVG } from "qrcode.react";

function clampInt(v: string, min: number, max?: number) {
  if (v.trim() === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const i = Math.trunc(n);
  if (max != null) return String(Math.max(min, Math.min(max, i)));
  return String(Math.max(min, i));
}

export default function NewCheckinPage() {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"edit" | "summary">("edit");

  const [name, setName] = useState("");
  const [pax, setPax] = useState<string>("1");
  const [hours, setHours] = useState<string>("1");

  const [visitId, setVisitId] = useState<string | null>(null);

  const [firstHourPrice, setFirstHourPrice] = useState<number | null>(null);
  const [subsequentHourPrice, setSubsequentHourPrice] = useState<number | null>(
    null,
  );
  const [paynowUen, setPaynowUen] = useState<string | null>(null);

  const [showPaynow, setShowPaynow] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase
        .from("settings")
        .select("paynow_uen")
        .eq("id", 1)
        .single();
      if (s?.paynow_uen) setPaynowUen(s.paynow_uen);

      const { data: products } = await supabase
        .from("products")
        .select("name,price,active")
        .in("name", ["First hour", "Subsequent hour"])
        .eq("active", true);

      const first = products?.find((p: any) => p.name === "First hour");
      const sub = products?.find((p: any) => p.name === "Subsequent hour");

      setFirstHourPrice(first?.price != null ? Number(first.price) : null);
      setSubsequentHourPrice(sub?.price != null ? Number(sub.price) : null);
    })().catch(console.error);
  }, []);

  const paxN = Math.max(1, Number(pax || 1));
  const hoursN = Math.max(1, Number(hours || 1));

  const totalAmount = useMemo(() => {
    if (firstHourPrice == null) return null;
    if (hoursN === 1) return firstHourPrice * paxN;
    if (subsequentHourPrice == null) return null;
    return (firstHourPrice + (hoursN - 1) * subsequentHourPrice) * paxN;
  }, [firstHourPrice, subsequentHourPrice, paxN, hoursN]);

  async function cleanupDraft(id: string) {
    await supabase.from("visits").delete().eq("id", id).eq("status", "DRAFT");
  }

  async function onNext() {
    if (busy) return;

    if (!name.trim()) {
      alert("Please enter a visitor / group name.");
      return;
    }

    if (firstHourPrice == null || (hoursN > 1 && subsequentHourPrice == null)) {
      alert(
        `Pricing not found. Ensure products "First hour"${
          hoursN > 1 ? ' and "Subsequent hour"' : ""
        } are active.`,
      );
      return;
    }

    setBusy(true);
    try {
      const { data: visit, error } = await supabase
        .from("visits")
        .insert({ name: name.trim(), pax: paxN, status: "DRAFT" })
        .select("id")
        .single();

      if (error) throw error;

      setVisitId(visit.id);
      setStep("summary");
    } catch (e: any) {
      alert(e.message ?? "Failed to create visit");
    } finally {
      setBusy(false);
    }
  }

  async function pay(method: "CASH" | "PAYNOW") {
    if (!visitId) return;
    if (busy) return;

    setBusy(true);
    try {
      await rpcStartVisit({
        visitId,
        hours: hoursN,
        bufferMinutes: 10,
        method,
      });

      window.location.href = "/";
    } catch (e: any) {
      alert(e.message ?? "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  const inputBase =
    "w-full rounded border border-white/20 bg-black px-4 py-3 text-white text-base outline-none focus:border-white/40";
  const label = "text-sm font-semibold text-white/70";

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="Home">
          <Image
            src="/patacat.jpg"
            alt="Home"
            width={34}
            height={34}
            className="rounded-full border border-white/20"
          />
        </Link>
        <h1 className="text-2xl font-semibold">New check-in</h1>
      </div>

      <button
        onClick={async () => {
          if (step === "summary" && visitId) {
            await cleanupDraft(visitId);
            setVisitId(null);
            setShowPaynow(false);
            setStep("edit");
            return;
          }
          window.location.href = "/";
        }}
        className="rounded border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
        disabled={busy}
      >
        Back
      </button>
    </div>
  );

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      {/* ✅ single shared container for header + content so alignment matches on desktop */}
      <div className="max-w-xl mx-auto">
        {header}

        {step === "edit" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className={label}>Visitor / Group name</div>
              <input
                className={inputBase}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bob"
                autoCapitalize="words"
                autoCorrect="off"
                enterKeyHint="next"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className={label}>Pax</div>
                <input
                  className={inputBase}
                  value={pax}
                  onChange={(e) =>
                    setPax(clampInt(e.target.value, 1, 50) || "")
                  }
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="next"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>

              <div className="space-y-2">
                <div className={label}>Hours</div>
                <input
                  className={inputBase}
                  value={hours}
                  onChange={(e) =>
                    setHours(clampInt(e.target.value, 1, 24) || "")
                  }
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="done"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
            </div>

            <button
              className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-base font-semibold hover:bg-white/10 disabled:opacity-50"
              disabled={busy}
              onClick={onNext}
            >
              Next
            </button>
          </div>
        )}

        {step === "summary" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/15 bg-white/5 p-4">
              <div className="text-sm text-white/60 mb-2">Summary</div>
              <div className="text-3xl font-semibold">{name.trim()}</div>

              {/* ✅ "1 Pax" instead of "Pax 1" */}
              <div className="mt-2 text-white/70">
                {paxN} Pax · {hoursN} hour(s)
              </div>

              <div className="mt-3 text-4xl font-bold">
                ${Number(totalAmount ?? 0).toFixed(2)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={busy}
                onClick={() => pay("CASH")}
                className="rounded border border-white/20 bg-white/5 px-4 py-4 text-lg font-semibold hover:bg-white/10 disabled:opacity-50"
              >
                Cash
              </button>

              <button
                disabled={busy || !paynowUen || totalAmount == null}
                onClick={() => setShowPaynow(true)}
                className="rounded border border-white/20 bg-white/5 px-4 py-4 text-lg font-semibold hover:bg-white/10 disabled:opacity-50"
              >
                PayNow
              </button>
            </div>

            {/* PAYNOW POPUP */}
            {showPaynow && paynowUen && totalAmount != null && (
              <div className="fixed inset-0 z-50">
                <div
                  className="absolute inset-0 bg-black/60"
                  onClick={() => !busy && setShowPaynow(false)}
                />
                <div className="absolute left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/20 bg-black p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">PayNow</div>
                    <button
                      disabled={busy}
                      onClick={() => setShowPaynow(false)}
                      className="rounded border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-2 text-sm text-white/60">
                    Scan to pay ${totalAmount.toFixed(2)}
                  </div>

                  <div className="mt-4 rounded bg-white p-4 flex justify-center">
                    <QRCodeSVG
                      value={buildPayNowPayload({
                        uen: paynowUen,
                        amount: totalAmount,
                        ref: visitId?.slice(0, 10),
                        editable: false,
                        merchantName: "PATACAT",
                        merchantCity: "Singapore",
                      })}
                      size={240}
                    />
                  </div>

                  <button
                    disabled={busy}
                    onClick={() => pay("PAYNOW")}
                    className="mt-4 w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-base font-semibold hover:bg-white/10 disabled:opacity-50"
                  >
                    Confirm PayNow received
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
