"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Product = { id: string; name: string; price: number; active: boolean };

const HIDE_NAMES = new Set(["Subsequent hour"]); // keep in DB, hide in UI

function toMoneyInput(v: number) {
  // keep stable for UI; allow 0, ints, decimals
  if (!Number.isFinite(v)) return "0";
  return String(v);
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  const [newName, setNewName] = useState("");
  const [newPriceStr, setNewPriceStr] = useState("0");
  const [newActive, setNewActive] = useState(true);

  async function loadMe() {
    const r = await fetch("/api/admin/me", { cache: "no-store" });
    const j = await r.json();
    setAuthed(!!j.authed);
  }

  async function loadProducts() {
    const r = await fetch("/api/admin/products", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? "Failed to load products");

    const list: Product[] = (j.products ?? []).filter(
      (p: Product) => !HIDE_NAMES.has(p.name),
    );

    // sort: active first, then name
    list.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    setProducts(list);
  }

  useEffect(() => {
    loadMe().catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed) loadProducts().catch((e) => setMsg(e.message));
  }, [authed]);

  async function saveProducts() {
    if (busy) return;
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

      setMsg("Saved ✓");
      await loadProducts();
    } catch (e: any) {
      setMsg(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(id: string, name: string) {
    if (busy) return;
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    setMsg(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Delete failed");

      setProducts((prev) => prev.filter((p) => p.id !== id));
      setMsg("Deleted ✓");
    } catch (e: any) {
      setMsg(e.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function addProduct() {
    if (busy) return;
    setMsg(null);

    const name = newName.trim();
    if (!name) return setMsg("Name required");
    if (HIDE_NAMES.has(name)) return setMsg("That product name is reserved");

    const price = Number(newPriceStr);
    if (!Number.isFinite(price) || price < 0) return setMsg("Invalid price");

    setBusy(true);
    try {
      const r = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          price,
          active: !!newActive,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Add failed");

      setNewName("");
      setNewPriceStr("0");
      setNewActive(true);

      await loadProducts();
      setMsg("Added ✓");
    } catch (e: any) {
      setMsg(e.message ?? "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (busy) return;
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
      setMsg("Password changed ✓");
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
  if (!authed) return <div className="p-6 opacity-70">Unauthorized.</div>;

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

      {/* PRODUCTS */}
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

        <div className="space-y-2">
          {products.map((p, idx) => (
            <div key={p.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{p.name}</div>
              </div>

              {/* Price (decimal), no spinner */}
              <input
                className="w-28 rounded border border-white/20 bg-black px-3 py-2 text-right text-sm outline-none"
                type="text"
                inputMode="decimal"
                value={toMoneyInput(p.price)}
                onChange={(e) => {
                  const raw = e.target.value;
                  // allow typing ".", "1.", etc. without blowing up
                  const cleaned = raw.replace(/[^0-9.]/g, "");
                  const n = Number(cleaned);
                  setProducts((prev) => {
                    const copy = [...prev];
                    copy[idx] = {
                      ...copy[idx],
                      price: Number.isFinite(n) ? n : copy[idx].price,
                    };
                    return copy;
                  });
                }}
              />

              {/* Active toggle (sold out) */}
              <button
                type="button"
                className={`w-[96px] rounded border px-3 py-2 text-sm ${
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

              {/* Delete */}
              <button
                disabled={busy}
                onClick={() => deleteProduct(p.id, p.name)}
                className="w-[90px] rounded border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        {/* ADD PRODUCT */}
        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="text-base font-semibold opacity-80">Add product</div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_110px] gap-3">
            <input
              className="w-full rounded border border-white/20 bg-black px-4 py-3 text-white text-sm outline-none"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="w-full rounded border border-white/20 bg-black px-4 py-3 text-white text-sm outline-none text-right"
              type="text"
              inputMode="decimal"
              value={newPriceStr}
              onChange={(e) =>
                setNewPriceStr(e.target.value.replace(/[^0-9.]/g, ""))
              }
            />
            <button
              type="button"
              onClick={() => setNewActive((x) => !x)}
              className={`rounded border px-3 py-3 text-sm ${
                newActive
                  ? "border-green-500/40 text-green-300"
                  : "border-white/20 text-white/70"
              }`}
            >
              {newActive ? "Active" : "Inactive"}
            </button>
          </div>

          <button
            disabled={busy}
            onClick={addProduct}
            className="w-full rounded border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* PASSWORD */}
      <div className="rounded-lg border border-white/15 bg-white/5 p-4 space-y-3">
        <div className="text-base font-semibold">Change password</div>

        <input
          className="w-full rounded border border-white/20 bg-black px-4 py-3 text-white text-sm outline-none"
          type="password"
          placeholder="New password"
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
