import { useEffect, useState } from "react";
import { api } from "./api";
import type { PublicConfig } from "./types";

let cached: Promise<PublicConfig> | null = null;

/** Instance settings (support email, operator name, terms version). Fetched once per page load and shared; null until it arrives or if it fails. */
export function usePublicConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    let active = true;
    cached ??= api.get<PublicConfig>("/public-config");
    cached
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch(() => {
        cached = null;
      });
    return () => {
      active = false;
    };
  }, []);

  return config;
}
