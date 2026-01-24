"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { rpcStartVisit } from "@/lib/rpc";
import { QRCodeCanvas } from "qrcode.react";
import { buildPayNowPayload } from "@/lib/paynow";

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

  const [step, setStep] = useState<"EDIT" | "PAY">("EDIT");
  const [name, setName] = useState("");
  const [pax, setPax] = useState<string>("1");
  const [hours, setHours] = useState<string>("1");

  const [visitId, setVisitId] = useState<string | null>(null);

  const [entryPrice, setEntryPrice] = useState<number>(15);
  const [paynowUen, setPaynowUen] = useState<string | null>(null);
  const [showPaynow, setShowPaynow] = useState(false);

  const paxN = Math.max(1, Number(pax || 1));
  const hoursN = Math.max(1, Number(hours || 1));
  const amount = useMemo(
    () => paxN * hoursN * entryPrice,
    [paxN, hoursN, entryPrice],
  );

  async function loadSettingsAndPrice() {
    const { data: s } = await supabase
      .from("settings")
      .select("paynow_uen")
      .eq("id", 1)
      .single();
    if (s?.paynow_uen) setPaynowUen(s.paynow_uen);

    const { data: p } = await supabase
      .from("products")
      .select("price")
      .eq("name", "Entry hour") // change if needed
      .eq("active", true)
      .single();
    if (p?.price != null) setEntryPrice(Number(p.price));
  }

  async function onNext() {
    if (busy) return;

    if (!name.trim()) {
      alert("Please enter a visitor / group name.");
      return;
    }

    setBusy(true);
    try {
      await loadSettingsAndPrice();

      const { data: visit, error } = await supabase
        .from("visits")
        .insert({ name: name.trim(), pax: paxN, status: "DRAFT" })
        .select("id")
        .single();
      if (error) throw error;

      setVisitId(visit.id);
      setStep("PAY");
      setShowPaynow(false);
    } catch (e: any) {
      alert(e.message ?? "Failed to create visit");
    } finally {
      setBusy(false);
    }
  }

  async function startAndGoHome(method: "CASH" | "PAYNOW") {
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
      alert(e.message ?? "Failed to start visit");
    } finally {
      setBusy(false);
    }
  }

  const inputBase =
    "w-full rounded border border-white/20 bg-black px-4 py-3 text-white text-base outline-none focus:border-white/40";
  const label = "text-sm font-semibold text-white/70";
  const card = "rounded-lg border border-white/15 bg-white/5 p-4";

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Home">
            <Image
              src="/patacat.jpg"
              alt="Home"
              width={40}
              height={40}
              className="rounded-full border border-white/20"
            />
          </Link>
          <h1 className="text-2xl font-semibold">New check-in</h1>
        </div>

        <button
          className="rounded border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            setShowPaynow(false);
            setStep("EDIT");
          }}
        >
          Back
        </button>
      </div>

      {step === "EDIT" && (
        <div className="space-y-4 max-w-xl">
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
                onChange={(e) => setPax(clampInt(e.target.value, 1, 50) || "")}
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

      {step === "PAY" && (
        <div className="space-y-4 max-w-xl">
          <div className={card}>
            <div className="text-sm text-white/60">Summary</div>
            <div className="mt-2 text-2xl font-semibold">
              {name.trim() || "-"}
            </div>
            <div className="mt-2 text-white/70">
              Pax {paxN} · {hoursN} hour(s)
            </div>
            <div className="mt-3 text-3xl font-bold">${amount.toFixed(2)}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-base font-semibold hover:bg-white/10 disabled:opacity-50"
              disabled={busy}
              onClick={() => startAndGoHome("CASH")}
            >
              Cash
            </button>

            <button
              className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-base font-semibold hover:bg-white/10 disabled:opacity-50"
              disabled={busy}
              onClick={() => setShowPaynow(true)}
            >
              PayNow
            </button>
          </div>

          {showPaynow && (
            <div className="fixed inset-0 z-50">
              <div
                className="absolute inset-0 bg-black/60"
                onClick={() => !busy && setShowPaynow(false)}
              />
              <div className="absolute left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/20 bg-black p-4">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">PayNow</div>
                  <button
                    className="rounded border border-white/20 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => setShowPaynow(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {!paynowUen ? (
                    <div className="text-sm text-red-400">
                      Missing PayNow UEN in settings.
                    </div>
                  ) : (
                    <div className="flex justify-center bg-white p-3 rounded">
                      <QRCodeCanvas
                        value={buildPayNowPayload({
                          uen: paynowUen,
                          amount,
                          merchantName: "Shelter",
                          merchantCity: "Singapore",
                          editable: false,
                        })}
                        size={260}
                        includeMargin
                      />
                    </div>
                  )}

                  <button
                    className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-base font-semibold hover:bg-white/10 disabled:opacity-50"
                    disabled={busy || !paynowUen}
                    onClick={() => startAndGoHome("PAYNOW")}
                  >
                    Confirm PayNow received
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            className="w-full rounded border border-white/20 px-4 py-3 text-base opacity-70 hover:bg-white/10 disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              setShowPaynow(false);
              setStep("EDIT");
            }}
          >
            Back to edit
          </button>
        </div>
      )}
    </div>
  );
}
