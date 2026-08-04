
import { randomUUID } from "node:crypto";

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export class RefRegistry {
  constructor({ ttlMs = DEFAULT_TTL_MS, clock = Date } = {}) {
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.entries = new Map();
  }

  put(value, prefix = "ref") {
    const ref = `${prefix}_${randomUUID()}`;
    this.entries.set(ref, { value, expiresAt: this.clock.now() + this.ttlMs });
    return ref;
  }

  get(ref) {
    const e = this.entries.get(ref);
    if (!e) return undefined;
    if (e.expiresAt <= this.clock.now()) {
      this.entries.delete(ref);
      return undefined;
    }
    return e.value;
  }

  forget(ref) {
    this.entries.delete(ref);
  }

  sweep() {
    const now = this.clock.now();
    for (const [ref, e] of this.entries) {
      if (e.expiresAt <= now) this.entries.delete(ref);
    }
  }

  get size() {
    return this.entries.size;
  }
}
