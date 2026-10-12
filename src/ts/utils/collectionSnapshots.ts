/** Immutable, caller-scoped collection pages. No live entry is evicted to admit another. */
export class SnapshotError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export interface SnapshotContext {
  caller: string; user: string; world: string; collection: string;
  query: string; type: string; limit: number;
}
interface Snapshot {
  context: string; expires: number; records: readonly string[];
  bytes: number; invalidated: boolean;
}
const normalize = (value: string): string => value.normalize('NFKC').toLowerCase();
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export class CollectionSnapshots {
  private entries = new Map<string, Snapshot>();
  private bytes = 0;
  constructor(private readonly now: () => number = Date.now,
    private readonly id: () => string = () => crypto.randomUUID(),
    private readonly budget = 8 * 1024 * 1024) {}

  invalidate(): void {
    for (const entry of this.entries.values()) {
      entry.invalidated = true;
      this.bytes -= entry.bytes;
      entry.bytes = 0;
      entry.records = [];
    }
  }

  page(context: SnapshotContext, page: number, snapshotId?: string,
    load?: () => Record<string, any>[]): { snapshotId: string; total: number; page: number; limit: number; records: Record<string, any>[] } {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(context.limit) || context.limit < 1 || context.limit > 100)
      throw new SnapshotError('INVALID_PAGINATION');
    if (typeof context.query !== 'string' || typeof context.type !== 'string' || context.query.length > 1024 || context.type.length > 128) throw new SnapshotError('INVALID_FILTER');
    if (snapshotId !== undefined && (typeof snapshotId !== 'string' || !snapshotId || snapshotId.length > 1024)) throw new SnapshotError('INVALID_SNAPSHOT_ID');
    const key = JSON.stringify({ ...context, query: normalize(context.query), type: normalize(context.type) });
    const now = this.now();
    // Tombstones retain explicit expired/invalidated errors briefly, with a fixed entry bound.
    for (const [id, entry] of this.entries) {
      if (entry.expires <= now && entry.bytes) {
        this.bytes -= entry.bytes; entry.bytes = 0; entry.records = [];
      }
      if (entry.expires + 300000 <= now) this.entries.delete(id);
    }
    let entry: Snapshot | undefined;
    if (snapshotId) {
      entry = this.entries.get(snapshotId);
      if (!entry) throw new SnapshotError('SNAPSHOT_EXPIRED');
      if (entry.context !== key) throw new SnapshotError('SNAPSHOT_CONTEXT_MISMATCH');
      if (entry.invalidated) throw new SnapshotError('SNAPSHOT_INVALIDATED');
      if (entry.expires <= now) throw new SnapshotError('SNAPSHOT_EXPIRED');
    } else {
      if (page !== 1 || !load) throw new SnapshotError('SNAPSHOT_REQUIRED');
      const documents = load(); // Authorization must happen in load, before filtering, sorting or counting.
      const records = documents.filter(doc => (!context.query || normalize(doc.name).includes(normalize(context.query))) &&
        (!context.type || normalize(doc.type) === normalize(context.type)));
      if (records.length > 10000) throw new SnapshotError('SNAPSHOT_OVERSIZED');
      records.sort((a, b) => compare(normalize(a.name), normalize(b.name)) || compare(normalize(a.type), normalize(b.type)) || compare(a._id, b._id));
      const frozen: string[] = [];
      let bytes = 0;
      for (const record of records) {
        const serialized = JSON.stringify(record);
        bytes += new TextEncoder().encode(serialized).length;
        if (bytes > this.budget) throw new SnapshotError('SNAPSHOT_OVERSIZED');
        frozen.push(serialized);
      }
      if (this.bytes + bytes > this.budget || this.entries.size >= 128 ||
        [...this.entries.values()].filter(e => !e.invalidated && e.expires > now).length >= 32)
        throw new SnapshotError('SNAPSHOT_CACHE_FULL');
      snapshotId = this.id();
      entry = { context: key, expires: now + 300000, records: frozen, bytes, invalidated: false };
      this.entries.set(snapshotId, entry); this.bytes += bytes;
    }
    const start = (page - 1) * context.limit;
    if (!Number.isSafeInteger(start) || (start >= entry.records.length && !(page === 1 && entry.records.length === 0)))
      throw new SnapshotError('PAGE_OUT_OF_RANGE');
    return { snapshotId: snapshotId!, total: entry.records.length, page, limit: context.limit,
      records: entry.records.slice(start, start + context.limit).map(doc => JSON.parse(doc)) };
  }
}
export const collectionSnapshots = new CollectionSnapshots();
