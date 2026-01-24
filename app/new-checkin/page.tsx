"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { rpcStartVisit } from "@/lib/rpc";

export default function NewCheckinPage() {
  const [name, setName] = useState("");
  const [pax, setPax] = useState(1);
  const [hours, setHours] = useState(1);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [step, setStep] = useState<"FORM" | "PAY">("FORM");
  const [loading, setLoading] = useState(false);

  const bufferMinutes = 10;
  const firstHourPrice = 15;
  const extensionHourPrice = 5;

  const total =
    pax * firstHourPrice + pax * Math.max(hours - 1, 0) * extensionHourPrice;

  async function createDraftVisit() {
    setLoading(true);
    try {
      if (visitId) {
        await supabase
          .from("visits")
          .update({ name: name.trim(), pax })
          .eq("id", visitId);

        setStep("PAY");
        return;
      }

      const { data, error } = await supabase
        .from("visits")
        .insert({ name: name.trim(), pax, status: "DRAFT" })
        .select("id")
        .single();

      if (error) throw error;

      setVisitId(data.id);
      setStep("PAY");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPaid(method: "CASH" | "PAYNOW") {
    if (!visitId) return;
    setLoading(true);
    try {
      await rpcStartVisit({
        visitId,
        hours,
        bufferMinutes,
        method,
      });

      window.location.href = "/";
    } catch (e: any) {
      alert(e.message ?? "Failed to start visit");
    } finally {
      setLoading(false);
    }
  }

  async function cancelDraft() {
    if (!visitId) {
      setStep("FORM");
      return;
    }

    setLoading(true);
    try {
      await supabase.from("visits").delete().eq("id", visitId);
      setVisitId(null);
      setStep("FORM");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-md">
      <h1 className="text-xl font-semibold mb-4">New check-in</h1>

      {step === "FORM" && (
        <div className="space-y-3">
          <input
            className="w-full border rounded p-2"
            placeholder="Visitor / group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="flex gap-3">
            <input
              className="w-full border rounded p-2"
              type="number"
              min={1}
              value={pax}
              onChange={(e) => setPax(Math.max(1, +e.target.value))}
            />
            <input
              className="w-full border rounded p-2"
              type="number"
              min={1}
              value={hours}
              onChange={(e) => setHours(Math.max(1, +e.target.value))}
            />
          </div>

          <button
            className="w-full bg-black text-white rounded p-2"
            disabled={loading || !name.trim()}
            onClick={createDraftVisit}
          >
            Next
          </button>
        </div>
      )}

      {step === "PAY" && (
        <div className="space-y-3">
          <div className="border rounded p-3">
            <div className="text-sm opacity-70">Please collect</div>
            <div className="text-3xl font-bold">${total}</div>
          </div>

          <button
            className="w-full border rounded p-2"
            onClick={() => setStep("FORM")}
          >
            Back
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="border rounded p-2"
              onClick={() => confirmPaid("CASH")}
              disabled={loading}
            >
              Cash
            </button>
            <button
              className="border rounded p-2"
              onClick={() => confirmPaid("PAYNOW")}
              disabled={loading}
            >
              PayNow
            </button>
          </div>

          <button
            className="w-full border rounded p-2"
            onClick={cancelDraft}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
