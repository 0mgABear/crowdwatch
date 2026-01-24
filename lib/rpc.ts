"use client";

import { supabase } from "@/lib/supabaseClient";

export async function rpcStartVisit(params: {
  visitId: string;
  hours: number;
  bufferMinutes?: number;
  method: "CASH" | "PAYNOW";
}) {
  const { data, error } = await supabase.rpc(
    "start_visit_and_collect_payment",
    {
      p_visit_id: params.visitId,
      p_hours: params.hours,
      p_buffer_minutes: params.bufferMinutes ?? 10,
      p_method: params.method,
    },
  );

  if (error) throw error;
  return data as string;
}

export async function rpcExtendVisit(params: {
  visitId: string;
  addHours: number;
  method: "CASH" | "PAYNOW";
}) {
  const { data, error } = await supabase.rpc(
    "extend_visit_and_collect_payment",
    {
      p_visit_id: params.visitId,
      p_add_hours: params.addHours,
      p_method: params.method,
    },
  );

  if (error) throw error;
  return data as string;
}

export async function rpcPurchaseItems(params: {
  visitId: string;
  items: Array<{ productId: string; qty: number }>;
  method: "CASH" | "PAYNOW";
}) {
  const { data, error } = await supabase.rpc(
    "purchase_items_and_collect_payment",
    {
      p_visit_id: params.visitId,
      p_items: params.items.map((i) => ({
        product_id: i.productId,
        qty: i.qty,
      })),
      p_method: params.method,
    },
  );

  if (error) throw error;
  return data as string;
}

export async function rpcCollectDrink(params: {
  visitId: string;
  qty?: number;
}) {
  const { data, error } = await supabase.rpc("collect_drink", {
    p_visit_id: params.visitId,
    p_qty: params.qty ?? 1,
  });
  if (error) throw error;
  return data as number; // new drinks collected
}

export async function rpcExtendVisitPartial(params: {
  visitId: string;
  people: number;
  addHours: number;
  method: "CASH" | "PAYNOW";
}) {
  const { data, error } = await supabase.rpc(
    "extend_visit_partial_and_collect_payment",
    {
      p_visit_id: params.visitId,
      p_people: params.people,
      p_add_hours: params.addHours,
      p_method: params.method,
    },
  );
  if (error) throw error;
  return data as string;
}
