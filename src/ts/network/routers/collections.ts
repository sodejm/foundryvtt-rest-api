import { Router } from './baseRouter';
import { collectionSnapshots, SnapshotError } from '../../utils/collectionSnapshots';
import { hasPermission } from '../../utils/permissions';

export const router = new Router('collectionRouter');

/** Resolve only live documents; never reuse unverified source data as a fallback. */
export function serializeCallerDocument(document: any, user: User, root = true): Record<string, any> | null {
  if (!document || !hasPermission(document, user, 'OBSERVER') || typeof document.toObject !== 'function') return null;
  try {
    const data = JSON.parse(JSON.stringify(document.toObject(true)));
    if (typeof data._id !== 'string' || (root && (typeof data.name !== 'string' || typeof data.type !== 'string'))) return null;
    const embedded = document.constructor?.metadata?.embedded ?? {};
    for (const field of Object.values(embedded)) {
      if (typeof field !== 'string' || !Array.isArray(data[field])) continue;
      data[field] = data[field].flatMap((source: any) => {
        const child = document[field]?.get?.(source._id);
        const record = serializeCallerDocument(child, user, false);
        return record ? [record] : [];
      });
    }
    return data;
  } catch { return null; }
}

for (const collection of ['actors', 'items'] as const) {
  for (const detail of [false, true]) {
    const actionType = detail ? `${collection}-detail` : collection;
    router.addRoute({ actionType, handler: (data, context) => {
      const send = (body: Record<string, any>): void => { context?.socketManager?.send({ type: `${actionType}-result`, requestId: data.requestId, ...body }); };
      try {
        // _caller is authenticated relay metadata, never a caller-supplied query parameter.
        const user = typeof data.userId === 'string' ? game.users?.get(data.userId) : undefined;
        if (!user || typeof data._caller !== 'string' || !data._caller || !game.world?.id)
          throw new SnapshotError('CALLER_IDENTITY_REQUIRED');
        if (!Array.isArray(data._scopes) || !data._scopes.includes('entity:read')) throw new SnapshotError('READ_SCOPE_REQUIRED');
        const documents = (game as any)[collection];
        if (!documents) throw new SnapshotError('COLLECTION_UNAVAILABLE');
        if (detail) {
          const document = typeof data.id === 'string' ? documents.get(data.id) : undefined;
          const record = serializeCallerDocument(document, user);
          if (!record) throw new SnapshotError('DOCUMENT_NOT_FOUND');
          send({ success: true, data: record });
        } else {
          const result = collectionSnapshots.page({ caller: data._caller, user: user.id!, world: game.world.id,
            collection, query: data.query ?? '', type: data.filterType ?? '', limit: data.limit ?? 100 },
            data.page ?? 1, data.snapshotId, () => Array.from(documents.contents ?? documents.values()).flatMap(document => {
              const record = serializeCallerDocument(document, user); return record ? [record] : [];
            }));
          const { records, ...metadata } = result;
          send({ ...metadata, [collection]: records });
        }
      } catch (error) { send({ error: error instanceof SnapshotError ? error.code : 'COLLECTION_READ_FAILED' }); }
    }});
  }
}
router.addRoute({ actionType: 'world', handler: (data, context) => {
  const user = typeof data.userId === 'string' ? game.users?.get(data.userId) : undefined;
  if (!user || typeof data._caller !== 'string' || !data._caller || !game.world?.id) {
    context?.socketManager?.send({ type: 'world-result', requestId: data.requestId, error: 'CALLER_IDENTITY_REQUIRED' }); return;
  }
  if (!Array.isArray(data._scopes) || !data._scopes.includes('entity:read')) {
    context?.socketManager?.send({ type: 'world-result', requestId: data.requestId, error: 'READ_SCOPE_REQUIRED' }); return;
  }
  context?.socketManager?.send({ type: 'world-result', requestId: data.requestId,
    world: { id: game.world.id, title: (game.world as any).title }, system: { id: game.system.id, version: (game.system as any).version },
    foundryVersion: (game as any).version });
}});
