import type { PipManifest, PipPackage, PipPackageRef, PipRuntimeProfile } from "./pip";

export const PIP_CAPABILITY_ABI = "pip-capability/1" as const;

export type PipCapabilityDescriptor = {
  abi: typeof PIP_CAPABILITY_ABI;
  capabilities: string[];
  commands: string[];
};

export type PipCapabilityRequest = {
  id: string;
  command: string;
  payload?: unknown;
};

export type PipCapabilityResolution = {
  capability: string;
  reference?: PipPackageRef;
  source: "profile" | "system-default" | "missing";
  error?: string;
};

export const resolveCapabilitySet = ({
  required,
  profile,
  systemDefaults,
}: {
  required: string[];
  profile?: Pick<PipRuntimeProfile, "capabilities">;
  systemDefaults: Record<string, PipPackageRef>;
}): PipCapabilityResolution[] => [...new Set(required)].map((capability) => {
  const selected = profile?.capabilities[capability];
  if (selected) return { capability, reference: selected, source: "profile" };
  const fallback = systemDefaults[capability];
  if (fallback) return { capability, reference: fallback, source: "system-default" };
  return { capability, source: "missing", error: `Missing capability provider: ${capability}` };
});

export const assertCapabilityProvider = (
  capability: string,
  reference: PipPackageRef,
  manifest: PipManifest,
  sha256: string,
) => {
  if (manifest.layer !== "a3") throw new Error(`${reference.packageId} is not an a3 package`);
  if (manifest.packageId !== reference.packageId || manifest.packageVersion !== reference.version) {
    throw new Error(`${reference.packageId} does not match its profile reference`);
  }
  if (manifest.releaseDate !== reference.releaseDate || sha256 !== reference.sha256) {
    throw new Error(`${reference.packageId} content identity changed`);
  }
  if (!manifest.providedCapabilities.includes(capability)) {
    throw new Error(`${reference.packageId} does not provide ${capability}`);
  }
};

export class PipCapabilityWorker {
  #worker: Worker;
  #url: string;
  #nextId = 0;
  #pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  #ready: Promise<void>;

  constructor(source: string, expectedCapability: string) {
    const bootstrap = `
let moduleUrl;
self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      moduleUrl = URL.createObjectURL(new Blob([message.source], { type: "text/javascript" }));
      const provider = await import(moduleUrl);
      if (provider.descriptor?.abi !== "pip-capability/1") throw new Error("Unsupported capability ABI");
      if (!provider.descriptor.capabilities?.includes(message.expectedCapability)) throw new Error("Capability identity mismatch");
      self.provider = provider;
      self.postMessage({ type: "ready", descriptor: provider.descriptor });
      return;
    }
    if (message.type === "invoke") {
      const result = await self.provider.invoke({ command: message.command, payload: message.payload });
      self.postMessage({ type: "result", id: message.id, result });
    }
  } catch (error) {
    self.postMessage({ type: "error", id: message.id, error: error instanceof Error ? error.message : String(error) });
  }
};`;
    this.#url = URL.createObjectURL(new Blob([bootstrap], { type: "text/javascript" }));
    this.#worker = new Worker(this.#url);
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    this.#ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    this.#worker.onmessage = (event) => {
      if (event.data?.type === "ready") {
        resolveReady();
        return;
      }
      if (event.data?.type === "error" && !event.data?.id) {
        rejectReady(new Error(event.data.error ?? "Capability worker initialization failed"));
        return;
      }
      const id = event.data?.id;
      if (!id) return;
      const pending = this.#pending.get(id);
      if (!pending) return;
      this.#pending.delete(id);
      if (event.data.type === "result") pending.resolve(event.data.result);
      else pending.reject(new Error(event.data.error ?? "Capability worker failed"));
    };
    this.#worker.onerror = () => this.dispose(new Error("Capability worker crashed"));
    this.#worker.postMessage({ type: "init", source, expectedCapability });
  }

  invoke(command: string, payload?: unknown): Promise<unknown> {
    const id = `capability_${this.#nextId += 1}`;
    return this.#ready.then(() => new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage({ type: "invoke", id, command, payload });
    }));
  }

  ready() {
    return this.#ready;
  }

  dispose(reason = new Error("Capability worker disposed")) {
    this.#worker.terminate();
    URL.revokeObjectURL(this.#url);
    this.#pending.forEach(({ reject }) => reject(reason));
    this.#pending.clear();
  }
}

export const capabilitySource = (pip: PipPackage) => {
  const asset = pip.assets.find((candidate) => candidate.path === "capability.mjs");
  if (!asset) throw new Error(`${pip.manifest.packageId} has no capability.mjs asset`);
  return new TextDecoder("utf-8", { fatal: true }).decode(asset.bytes);
};
