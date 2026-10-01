/** Process-local only: no shared user responses, disk or paid cache service. */
export class BoundedCache {
  private entries = new Map<string, { value: unknown; expires: number; bytes: number }>();
  private pending = new Map<string, Promise<unknown>>();
  private bytes = 0;
  constructor(private limits = { entries: 100, bytes: 16 * 1024 * 1024, itemBytes: 250_000 }) {}
  get size() { return this.entries.size; }
  get byteSize() { return this.bytes; }
  delete(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes;
    this.entries.delete(key);
    this.pending.delete(key);
  }
  async read<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    for (const [id, entry] of this.entries) if (entry.expires <= now) this.delete(id);
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key); this.entries.set(key, hit);
      return hit.value as T;
    }
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    if (this.pending.size >= this.limits.entries) return loader();
    const request = Promise.resolve().then(loader).then(value => {
      if (this.pending.get(key) !== request) return value;
      const serialized = JSON.stringify(value);
      const bytes = serialized == null ? 0 : Buffer.byteLength(serialized, 'utf8');
      if (ttlMs > 0 && bytes > 0 && bytes <= Math.min(this.limits.itemBytes, this.limits.bytes)) {
        while (this.entries.size >= this.limits.entries || this.bytes + bytes > this.limits.bytes) {
          const first = this.entries.keys().next().value;
          if (first === undefined) break;
          this.delete(first);
        }
        this.entries.set(key, { value, bytes, expires: Date.now() + ttlMs }); this.bytes += bytes;
      }
      return value;
    }).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request);
    return request;
  }
}

// One shared allocation budget for all small process-local read-through views.
export const sharedReadCache = new BoundedCache();
