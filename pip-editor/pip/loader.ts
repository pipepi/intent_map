/** Input: loader source and immutable package data. Output: the loader result from an isolated Worker. */
import type { PipManifest } from "./types.ts";

export const DEFAULT_PIP_LOADER_SOURCE = `
export async function load(api) {
  const rootTree = api.readRootTree();
  if (!rootTree || typeof rootTree !== "object") throw new Error("PIP root tree must be an object");
  if (!rootTree.rootIntent || typeof rootTree.rootIntent.id !== "string") throw new Error("PIP root tree is missing rootIntent");
  api.emitDiagnostic({ level: "info", message: "Root tree loaded" });
  return { rootTree, rootNodeId: rootTree.rootIntent.id };
}`.trim();

export const runPipLoader = (loaderSource: string, manifest: PipManifest, rootTreeText: string, timeoutMs = 3000): Promise<unknown> =>
  new Promise((resolve, reject) => {
    // Loaders run in a disposable Worker so timeout and failure cannot retain host UI state.
    const workerSource = `
self.onmessage = async (event) => {
  let moduleUrl;
  try {
    moduleUrl = URL.createObjectURL(new Blob([event.data.loaderSource], { type: "text/javascript" }));
    const loader = await import(moduleUrl);
    if (typeof loader.load !== "function") throw new Error("PIP loader must export load()");
    const diagnostics = [];
    const rootTree = JSON.parse(event.data.rootTreeText);
    const result = await loader.load(Object.freeze({
      manifest: Object.freeze(event.data.manifest),
      readRootTree: () => structuredClone(rootTree),
      emitDiagnostic: (entry) => diagnostics.push(structuredClone(entry)),
    }));
    self.postMessage({ ok: true, result, diagnostics });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally { if (moduleUrl) URL.revokeObjectURL(moduleUrl); }
};`;
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" })), worker = new Worker(workerUrl);
    const timer = window.setTimeout(() => { worker.terminate(); URL.revokeObjectURL(workerUrl); reject(new Error("PIP loader timed out")); }, timeoutMs);
    worker.onmessage = (event) => { window.clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(workerUrl); if (event.data?.ok) resolve(event.data.result?.rootTree); else reject(new Error(event.data?.error ?? "PIP loader failed")); };
    worker.onerror = () => { window.clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(workerUrl); reject(new Error("PIP loader worker failed")); };
    worker.postMessage({ loaderSource, manifest, rootTreeText });
  });
