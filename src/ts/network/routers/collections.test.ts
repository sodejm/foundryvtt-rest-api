import { router, serializeCallerDocument } from './collections';
import { collectionSnapshots } from '../../utils/collectionSnapshots';
import { webcrypto } from 'crypto';

const player = { id: 'player', name: 'Player' } as User;
function document(id: string, level: number, embedded?: Map<string, any>): any {
  return {
    constructor: { metadata: { embedded: { Item: 'items' } } },
    items: embedded,
    testUserPermission: (user: User, required: number) => user.id === player.id && level >= required,
    toObject: () => ({ _id: id, name: id, type: 'npc', system: { secret: id },
      items: embedded ? [...embedded.keys()].map(_id => ({ _id, secret: 'unverified source' })) : [] })
  };
}
function call(actionType: string, extra: Record<string, any> = {}): any {
  const send = jest.fn();
  router.routes.find(route => route.actionType === actionType)!.handler({
    requestId: 'request', userId: player.id, _caller: 'key:1', _scopes: ['entity:read'], ...extra
  }, { socketManager: { send } } as any);
  expect(send).toHaveBeenCalledTimes(1);
  return send.mock.calls[0][0];
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  const owned = document('Owned', 3), shared = document('Shared', 2), limited = document('Limited', 1), hidden = document('Hidden', 0);
  const contents = [hidden, shared, limited, owned];
  (globalThis as any).game = { users: new Map([[player.id, player]]), world: { id: 'world', title: 'World' },
    system: { id: 'dnd5e', version: '6' }, version: '14',
    actors: { contents, get: (id: string) => contents.find(doc => doc.toObject()._id === id) } };
  collectionSnapshots.invalidate();
});
test('permission filtering precedes collection counts, sorting and paging', () => {
  const first = call('actors', { limit: 1 });
  expect(first).toMatchObject({ total: 2, page: 1, limit: 1, actors: [{ _id: 'Owned' }] });
  expect(call('actors', { limit: 1, page: 2, snapshotId: first.snapshotId }).actors[0]._id).toBe('Shared');
  expect(call('actors', { query: 'hidden' }).total).toBe(0);
});
test.each(['Hidden', 'Limited', 'missing'])('detail does not disclose %s documents', id => {
  expect(call('actors-detail', { id }).error).toBe('DOCUMENT_NOT_FOUND');
});
test.each(['actors', 'actors-detail', 'world'])('missing and unresolved caller identity fails closed for %s', action => {
  for (const extra of [{ userId: undefined }, { userId: 'Player' }, { userId: 'missing' }, { _caller: '' }, { _caller: undefined }]) {
    expect(call(action, extra).error).toBe('CALLER_IDENTITY_REQUIRED');
  }
  expect(call(action, { _scopes: ['search'] }).error).toBe('READ_SCOPE_REQUIRED');
});
test('embedded records must resolve live and independently pass permissions', () => {
  const parent = document('Parent', 3, new Map([
    ['shared', document('shared', 2)], ['hidden', document('hidden', 0)], ['missing', undefined]
  ]));
  expect(serializeCallerDocument(parent, player)?.items.map((item: any) => item._id)).toEqual(['shared']);
  expect(serializeCallerDocument(parent, player)?.items[0].system.secret).toBe('shared');
  parent.items.get('shared').testUserPermission = () => { throw new Error('resolution failed'); };
  expect(serializeCallerDocument(parent, player)?.items).toEqual([]);
});
test('world identity includes the actual system and runtime versions', () => {
  expect(call('world')).toMatchObject({ world: { id: 'world', title: 'World' }, system: { id: 'dnd5e', version: '6' }, foundryVersion: '14' });
});
