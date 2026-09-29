import { useEffect, useState } from "react";
import { api, type LocalStore } from "../api";

export function useFundData() {
  const [data, setData] = useState<LocalStore | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await api.getSimulationData();
        if (active) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    window.addEventListener("fund-dashboard-refresh", load);
    return () => {
      active = false;
      window.removeEventListener("fund-dashboard-refresh", load);
    };
  }, []);
  return { data, error };
}
