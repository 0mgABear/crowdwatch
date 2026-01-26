"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Product = { id: string; name: string; price: number; active: boolean };

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  async function loadMe() {
    const r = await fetch("/api/admin/me", { cache: "no-store" });
    const j = await r.json();
    setAuthed(!!j.authed);
  }

  async function loadProducts() {
    const r = await fetch("/api/admin/products", { cache: "no-store" });
    if (!r.ok)
      throw new Error((await r.json())?.error ?? "Failed to load products");
    const j = await r.json();
    setProducts(j.products ?? []);
  }

  useEffect(() => {
    loadMe().catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed) loadProducts().catch((e) => setMsg(e.message));
  }, [authed]);

  const dirtyCount = useMemo(() => {
    // simple UI: always allow save (no diff tracking) – keep it reliable
    return 0;
  }, [products]);

  async function saveProducts() {
    setMsg(null);
    setBusy(true);
    try {
      const updates = products.map((p) => ({
        id: p.id,
        price: Number(p.price),
        active: !!p.active,
      }));
      const r = await fetch("/api/admin/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Save failed");
      setMsg("Saved.");
    } catch (e: any) {
      setMsg(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setMsg(null);
    if (newPw !== newPw2) return setMsg("Passwords do not match");
    setBusy(true);
    try {
      const r = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: newPw }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Failed to change password");
      setNewPw("");
      setNewPw2("");
      setMsg("Password changed.");
    } catch (e: any) {
      setMsg(e.message ?? "Failed to change password");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/";
  }

  if (authed === null) return <div className="p-6 opacity-70">Loading…</div>;
  if (!authed)
    return <div className="p-6 opacity-70">Unauthorized. Go back.</div>;

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 space-y-6 max-w-3xl mx-auto">
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
          <div>
            <div className="text-lg font-semibold">Admin</div>
            <div className="text-sm text-white/60">Products & password</div>
          </div>
        </div>

        <button
          onClick={logout}
          className="rounded border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
        >
          Log out
        </button>
      </div>

      {msg && <div className="text-sm text-white/70">{msg}</div>}

      <div className="rounded-lg border border-white/15 bg-white/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">Products</div>
          <button
            disabled={busy}
            onClick={saveProducts}
            className="rounded border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
          >
            Save
          </button>
        </div>

        <div className="space-y-3">
          {products.map((p, idx) => (
            <div key={p.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-white/50">{p.id}</div>
              </div>

              <input
                className="w-28 rounded border border-white/20 bg-black px-3 py-2 text-right text-sm outline-none"
                value={String(p.price)}
                inputMode="decimal"
                onChange={(e) => {
                  const v = e.target.value;
                  setProducts((prev) => {
                    const copy = [...prev];
                    copy[idx] = { ...copy[idx], price: Number(v || 0) };
                    return copy;
                  });
                }}
              />

              <button
                className={`rounded border px-3 py-2 text-sm ${
                  p.active
                    ? "border-green-500/40 text-green-300"
                    : "border-white/20 text-white/70"
                }`}
                onClick={() => {
                  setProducts((prev) => {
                    const copy = [...prev];
                    copy[idx] = { ...copy[idx], active: !copy[idx].active };
                    return copy;
                  });
                }}
              >
                {p.active ? "Active" : "Inactive"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-white/15 bg-white/5 p-4 space-y-3">
        <div className="text-base font-semibold">Change password</div>

        <input
          className="w-full rounded border border-white/20 bg-black px-4 py-3 text-white text-sm outline-none"
          type="password"
          placeholder="New password (min 8 chars)"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />
        <input
          className="w-full rounded border border-white/20 bg-black px-4 py-3 text-white text-sm outline-none"
          type="password"
          placeholder="Repeat new password"
          value={newPw2}
          onChange={(e) => setNewPw2(e.target.value)}
        />

        <button
          disabled={busy}
          onClick={changePassword}
          className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
        >
          Update password
        </button>
      </div>
    </div>
  );
}
