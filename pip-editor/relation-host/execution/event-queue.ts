/** A bounded FIFO used by execution ingress and port fan-out. */
export class ExecutionEventQueue<T> {
  readonly capacity: number;
  #items: T[] = [];
  #space: Array<() => void> = [];

  constructor(capacity = 64) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4096) throw new Error("Execution queue capacity must be between 1 and 4096");
    this.capacity = capacity;
  }

  get length() { return this.#items.length; }
  get full() { return this.#items.length >= this.capacity; }

  async push(value: T, signal?: AbortSignal) {
    while (this.full) await new Promise<void>((resolve, reject) => {
      const done = () => { signal?.removeEventListener("abort", aborted); resolve(); };
      const aborted = () => { this.#space = this.#space.filter((item) => item !== done); reject(signal?.reason ?? new Error("Execution cancelled")); };
      this.#space.push(done); signal?.addEventListener("abort", aborted, { once: true });
    });
    this.#items.push(value);
  }

  shift() {
    const value = this.#items.shift();
    this.#space.shift()?.();
    return value;
  }
}
