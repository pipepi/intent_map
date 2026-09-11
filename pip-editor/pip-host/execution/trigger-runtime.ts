import { graphNodes, graphRevision } from "../../pip/pip-model.ts";
import type { JsonValue, Pip } from "../../pip/index.ts";
import type { NodeTypePluginRegistry } from "../activation/node-type-registry.ts";
import type { PipTriggerProvider } from "../contracts/package-types.ts";

type WorkspaceGraph = { id: string; graph: Pip;
};
type FireTrigger = (workspace: WorkspaceGraph, triggerNodeId: string, payload: JsonValue) => Promise<void>;
type CloseTrigger = (workspaceId: string, triggerNodeId: string) => void;
type ReportError = (error: unknown) => void;
type TriggerActivation = Exclude<ReturnType<NonNullable<PipTriggerProvider["activation"]>>, undefined>;
type ActiveTrigger = {
  key: string; signature: string; workspace: WorkspaceGraph; triggerNodeId: string;
  provider: PipTriggerProvider; timer?: ReturnType<typeof setInterval>; hookKey?: string;
};

/** A2 owns clocks and hook delivery; A4 providers interpret A5 trigger declarations. */
export class TriggerRuntime {
  readonly #registry: NodeTypePluginRegistry;
  readonly #fire: FireTrigger;
  readonly #close: CloseTrigger;
  readonly #error: ReportError;
  #active = new Map<string, ActiveTrigger>();

  constructor(input: {
    registry: NodeTypePluginRegistry;
    fire: FireTrigger;
    close: CloseTrigger;
    error: ReportError;
  }) { this.#registry = input.registry; this.#fire = input.fire; this.#close = input.close; this.#error = input.error; }

  sync(workspaces: WorkspaceGraph[]) {
    const desired = new Map<string, Omit<ActiveTrigger, "timer"> & { activation: TriggerActivation }>();
    for (const workspace of workspaces) for (const trigger of Object.values(graphNodes(workspace.graph))) {
      const provider = this.#registry.triggerProviders().find((item) => item.matches(trigger, workspace.graph));
      const activation = provider?.activation?.(trigger, workspace.graph); if (!provider || !activation) continue;
      const key = `${workspace.id}\u0000${trigger.id}`, signature = JSON.stringify([graphRevision(workspace.graph), activation]);
                desired.set(key, { key, signature, workspace, triggerNodeId: trigger.id, provider, activation, ...(activation.kind === "hook" ? { hookKey: activation.key } : {}) });
            }
        for (const [key, current] of this.#active)
            if (!desired.has(key) || desired.get(key)?.signature !== current.signature)
                this.#remove(key);
        for (const [key, item] of desired)
            if (!this.#active.has(key)) {
                if (item.activation.kind === "hook")
                    this.#active.set(key, item);
                else {
                    const activation = item.activation;
                    const tick = () => void this.#fire(item.workspace, item.triggerNodeId, activation.payload ?? {}).catch(this.#error);
                    this.#active.set(key, { ...item, timer: setInterval(tick, activation.intervalMs) });
                }
            }
    }
    async dispatchHook(hookKey: string, payload: JsonValue) {
    const targets = [...this.#active.values()].filter((item) => item.hookKey === hookKey);
    if (!targets.length) throw new Error(`Unknown pip hook ${hookKey}`);
    await Promise.all(targets.map((item) => this.#fire(item.workspace, item.triggerNodeId, payload)));
  }
    dispose() { for (const key of [...this.#active.keys()]) this.#remove(key); }
    #remove(key: string) {
    const current = this.#active.get(key); if (!current) return;
    if (current.timer) clearInterval(current.timer);
    this.#close(current.workspace.id, current.triggerNodeId); this.#active.delete(key);
  }
}
