"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import { buildPayNowPayload } from "@/lib/paynow";

type Product = { id: string; name: string; price: number; active: boolean };

export default function NewSalePage() {
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [paynowUen, setPaynowUen] = useState<string | null>(null);
  const [showPaynow, setShowPaynow] = useState(false);
  const [donationAmount, setDonationAmount] = useState<number>(0);

  function clampMoneyInput(v: string) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    // optional: force 2dp
    return Math.round(n * 100) / 100;
  }

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase
        .from("settings")
        .select("paynow_uen")
        .eq("id", 1)
        .single();
      setPaynowUen(s?.paynow_uen ?? null);

      const { data: p } = await supabase
        .from("products")
        .select("id,name,price,active")
        .eq("active", true)
        .order("name", { ascending: true });

      const EXCLUDE_FROM_SALES = new Set([
        "First hour",
        "Subsequent hour",
        "Drink",
      ]);

      const list = (p ?? [])
        .filter((x: any) => !EXCLUDE_FROM_SALES.has(String(x.name)))
        .map((x: any) => ({
          id: x.id,
          name: x.name,
          price: Number(x.price ?? 0),
          active: !!x.active,
        }));

      setProducts(list);

      const init: Record<string, number> = {};
      for (const prod of list) init[prod.id] = 0;
      setQtyById(init);
    })().catch(console.error);
  }, []);

  const items = useMemo(() => {
    return products
      .map((p) => ({
        productId: p.id,
        name: p.name,
        unitPrice: p.price,
        qty: Math.max(0, Math.trunc(qtyById[p.id] ?? 0)),
      }))
      .filter((x) => x.qty > 0);
  }, [products, qtyById]);

  const total = useMemo(() => {
    const itemsTotal = items.reduce(
      (sum, it) => sum + it.qty * it.unitPrice,
      0,
    );
    return itemsTotal + Math.max(0, Number(donationAmount || 0));
  }, [items, donationAmount]);

  const canPay = total > 0 && !busy;

  async function submit(method: "CASH" | "PAYNOW") {
    if (busy) return;

    const donation = Math.max(0, Number(donationAmount || 0));
    if (items.length === 0 && donation <= 0) {
      return alert("Select at least 1 item.");
    }

    setBusy(true);
    try {
      const r = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, items, donationAmount }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Sale failed");

      window.location.href = "/";
    } catch (e: any) {
      alert(e.message ?? "Sale failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <div className="max-w-xl mx-auto space-y-4">
        {/* header */}
        <div className="mb-2 flex items-center justify-between">
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
            <h1 className="text-2xl font-semibold">New sale</h1>
          </div>

          <Link
            href="/"
            className="rounded border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10"
          >
            Back
          </Link>
        </div>

        {/* products */}
        <div className="rounded-lg border border-white/15 bg-white/5 p-4 space-y-3">
          <div className="text-sm text-white/60">Select items</div>
          <div className="mt-3 rounded border border-white/10 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Donation</div>
                <div className="text-xs text-white/60">Any amount</div>
              </div>

              <div className="flex items-center w-28 rounded border border-white/20 bg-black px-3 py-2">
                <span className="text-white/50 mr-2">$</span>
                <input
                  className="w-full bg-transparent text-right text-sm outline-none [appearance:textfield]"
                  inputMode="decimal"
                  value={donationAmount ? String(donationAmount) : "0"}
                  onChange={(e) =>
                    setDonationAmount(clampMoneyInput(e.target.value))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {[2, 5, 10, 20].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className="rounded border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                  onClick={() =>
                    setDonationAmount((prev) => (prev === amt ? 0 : amt))
                  }
                >
                  ${amt}
                </button>
              ))}

              <button
                type="button"
                className="rounded border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                onClick={() => setDonationAmount(0)}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded border border-white/10 p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-white/60">
                    ${Number(p.price).toFixed(2)}
                  </div>
                </div>

                <input
                  className="w-20 rounded border border-white/20 bg-black px-3 py-2 text-right text-sm outline-none [appearance:textfield]"
                  inputMode="numeric"
                  value={String(qtyById[p.id] ?? 0)}
                  onChange={(e) => {
                    const n = Math.max(
                      0,
                      Math.trunc(Number(e.target.value || 0)),
                    );
                    setQtyById((prev) => ({ ...prev, [p.id]: n }));
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* total + pay */}
        <div className="rounded-lg border border-white/15 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <div className="text-white/70">Total</div>
            <div className="text-2xl font-bold tabular-nums">
              ${total.toFixed(2)}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              disabled={!canPay}
              onClick={() => submit("CASH")}
              className="rounded border border-white/20 bg-white/5 px-4 py-4 text-lg font-semibold hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5"
            >
              Cash
            </button>

            <button
              disabled={!canPay || !paynowUen}
              onClick={() => setShowPaynow(true)}
              className="rounded border border-white/20 bg-white/5 px-4 py-4 text-lg font-semibold hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5"
            >
              PayNow
            </button>
          </div>
        </div>

        {/* paynow modal */}
        {showPaynow && paynowUen && total > 0 && (
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
                Scan to pay ${total.toFixed(2)}
              </div>

              <div className="mt-4 rounded bg-white p-4 flex justify-center">
                <QRCodeSVG
                  value={buildPayNowPayload({
                    uen: paynowUen,
                    amount: total,
                    editable: false,
                    merchantName: "PATACAT",
                    merchantCity: "Singapore",
                  })}
                  size={240}
                />
              </div>

              <button
                disabled={busy}
                onClick={() => submit("PAYNOW")}
                className="mt-4 w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-base font-semibold hover:bg-white/10 disabled:opacity-50"
              >
                Confirm PayNow received
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
