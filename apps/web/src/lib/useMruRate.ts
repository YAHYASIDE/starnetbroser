"use client";

import { useEffect, useState } from "react";
import { getCurrency, loadCurrencyStore } from "./currencyStore";

/** Today's registered MRU-per-USD rate (read after mount), or undefined when none is set. */
export function useMruRate(): number | undefined {
  const [rate, setRate] = useState<number | undefined>(undefined);
  useEffect(() => setRate(getCurrency(loadCurrencyStore(), "MRU")?.rateFromUsd), []);
  return rate;
}
