"use client";

import { useEffect, useMemo, useState } from "react";

import {
  assertCapabilityProvider,
  capabilitySource,
  PipCapabilityWorker,
  resolveCapabilitySet,
} from "../runtime/pip-capabilities";
import { readHostCatalog, readHostPackage } from "../runtime/pip-host-client";
import { decodePip, type PipPackageRef } from "../runtime/pip";
import { entryMatchesRef } from "../runtime/pip-profile";
import type { PipProjectSession } from "./document-io";

export type PipCapabilityState = {
  capability: string;
  provider?: string;
  status: "loading" | "ready" | "missing" | "error";
  error?: string;
};

export const usePipCapabilitySession = (project: PipProjectSession | null) => {
  const [states, setStates] = useState<PipCapabilityState[]>([]);
  const required = useMemo(
    () => project?.manifest.requiredAuthoringCapabilities ?? [],
    [project],
  );

  useEffect(() => {
    if (!project || required.length === 0) return;
    let cancelled = false;
    const workers: PipCapabilityWorker[] = [];
    queueMicrotask(() => {
      if (!cancelled) setStates(required.map((capability) => ({ capability, status: "loading" })));
    });
    void readHostCatalog().then(async (catalog) => {
      const defaults: Record<string, PipPackageRef> = {};
      for (const capability of required) {
        const matches = catalog.packages.filter((entry) =>
          entry.valid && entry.origin === "system" && entry.layer === "a3" &&
          entry.providedCapabilities.includes(capability) && entry.packageId &&
          entry.packageVersion && entry.releaseDate && entry.sha256,
        );
        if (matches.length === 1) {
          const [entry] = matches;
          defaults[capability] = {
            origin: "system",
            packageId: entry.packageId!,
            version: entry.packageVersion!,
            releaseDate: entry.releaseDate!,
            sha256: entry.sha256!,
          };
        }
      }
      const resolutions = resolveCapabilitySet({
        required,
        profile: catalog.profile,
        systemDefaults: defaults,
      });
      const next: PipCapabilityState[] = [];
      for (const resolution of resolutions) {
        if (!resolution.reference) {
          next.push({ capability: resolution.capability, status: "missing", error: resolution.error });
          continue;
        }
        try {
          const entry = catalog.packages.find((candidate) => entryMatchesRef(candidate, resolution.reference!));
          if (!entry) throw new Error("Capability package is not in the catalog");
          if (entry.origin === "user" && !entry.trustedForExecution) throw new Error("Capability package is not trusted");
          const bytes = await readHostPackage(entry);
          const pip = await decodePip(bytes);
          assertCapabilityProvider(resolution.capability, resolution.reference, pip.manifest, entry.sha256!);
          const worker = new PipCapabilityWorker(capabilitySource(pip), resolution.capability);
          workers.push(worker);
          await worker.ready();
          next.push({ capability: resolution.capability, provider: pip.manifest.packageId, status: "ready" });
        } catch (error) {
          next.push({
            capability: resolution.capability,
            provider: resolution.reference.packageId,
            status: "error",
            error: error instanceof Error ? error.message : "Capability failed",
          });
        }
      }
      if (!cancelled) setStates(next);
    }).catch((error) => {
      if (!cancelled) setStates(required.map((capability) => ({
        capability,
        status: "error",
        error: error instanceof Error ? error.message : "Capability catalog unavailable",
      })));
    });
    return () => {
      cancelled = true;
      workers.forEach((worker) => worker.dispose());
    };
  }, [project, required]);

  return required.length === 0 ? [] : states;
};
