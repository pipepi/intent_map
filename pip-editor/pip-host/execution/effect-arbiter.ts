import type { PipEffect, PipEffectHandler } from "../contracts/package-types.ts";
import type { JsonValue } from "../../pip/index.ts";

/** The arbiter is the only A2 component allowed to invoke effect handlers. */
export class EffectArbiter {
  #receipts = new Map<string, JsonValue>();

  async execute(effect: PipEffect, key: string, handlers: Map<string, PipEffectHandler>, signal: AbortSignal) {
    if (this.#receipts.has(key)) return this.#receipts.get(key)!;
    const handler = handlers.get(effect.type);
    if (!handler) throw new Error(`No effect handler is registered for ${effect.type}`);
    const result = await handler.execute(effect, { idempotencyKey: key, signal });
    this.#receipts.set(key, structuredClone(result));
    return result;
  }
}
