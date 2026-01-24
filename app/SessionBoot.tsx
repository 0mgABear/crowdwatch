"use client";

import { useEffect } from "react";
import { ensureSession } from "@/lib/ensureSession";

export function SessionBoot() {
  useEffect(() => {
    ensureSession().catch(console.error);
  }, []);

  return null;
}
