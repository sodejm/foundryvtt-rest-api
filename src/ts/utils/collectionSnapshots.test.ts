import { CollectionSnapshots, SnapshotContext } from './collectionSnapshots';
const context: SnapshotContext = { caller:'key:1', user:'player', world:'test', collection:'actors', query:'', type:'', limit:2 };
const docs = Array.from({length:5}, (_,i)=>({_id:String(i), name:i<3?'Duplicate':'Z', type:'npc', system:{value:i}}));
function fixture(budget?:number) { let time=0,id=0; return {cache:new CollectionSnapshots(()=>time,()=>String(++id),budget), advance:(ms:number)=>time+=ms}; }
describe('caller-scoped immutable snapshots',()=> {
  test('empty, single and multiple pages have stable totals and duplicate-name ordering',()=> {
    const {cache}=fixture();
    expect(cache.page(context,1,undefined,()=>[])).toMatchObject({total:0,records:[]});
    const one=cache.page(context,1,undefined,()=>[docs[0]]);expect(one.total).toBe(1);
    const first=cache.page(context,1,undefined,()=>[...docs].reverse());
    expect(first.records.map(d=>d._id)).toEqual(['0','1']);
    expect(cache.page(context,3,first.snapshotId).records.map(d=>d._id)).toEqual(['4']);
    expect(()=>cache.page(context,4,first.snapshotId)).toThrow('PAGE_OUT_OF_RANGE');
  });
  test('source and response mutation cannot change cached pages',()=> {
    const {cache}=fixture();const source=JSON.parse(JSON.stringify(docs));
    const first=cache.page(context,1,undefined,()=>source);source[0].system.value=99;source.reverse();first.records[0].system.value=88;
    expect(cache.page(context,1,first.snapshotId).records[0].system.value).toBe(0);
  });
  test('filtering is normalized and total reflects filtered records',()=> {
    const {cache}=fixture();const filtered={...context,query:'ＤＵＰ',type:'NPC'};
    const first=cache.page(filtered,1,undefined,()=>docs);expect(first.total).toBe(3);
    expect(cache.page({...filtered,query:'dup'},2,first.snapshotId).records).toHaveLength(1);
  });
  test.each(['caller','user','world','collection','query','type','limit'] as const)('rejects changed %s',field=> {
    const {cache}=fixture();const first=cache.page(context,1,undefined,()=>docs);
    const altered={...context,[field]:field==='limit'?1:'other'};
    expect(()=>cache.page(altered,2,first.snapshotId)).toThrow('SNAPSHOT_CONTEXT_MISMATCH');
  });
  test('mutations/permissions invalidate explicitly and expiration is bounded',()=> {
    const {cache,advance}=fixture();const first=cache.page(context,1,undefined,()=>docs);cache.invalidate();
    expect(()=>cache.page(context,2,first.snapshotId)).toThrow('SNAPSHOT_INVALIDATED');
    const next=cache.page(context,1,undefined,()=>docs);advance(300000);
    expect(()=>cache.page(context,2,next.snapshotId)).toThrow('SNAPSHOT_EXPIRED');
    advance(300000);expect(()=>cache.page(context,2,next.snapshotId)).toThrow('SNAPSHOT_EXPIRED');
  });
  test('oversized records and collections fail without truncation',()=> {
    expect(()=>fixture(20).cache.page(context,1,undefined,()=>docs)).toThrow('SNAPSHOT_OVERSIZED');
    expect(()=>fixture().cache.page(context,1,undefined,()=>Array(10001).fill(docs[0]))).toThrow('SNAPSHOT_OVERSIZED');
    const {cache}=fixture(200);cache.page(context,1,undefined,()=>[docs[0],docs[1]]);
    expect(()=>cache.page(context,1,undefined,()=>[docs[0],docs[1]])).toThrow('SNAPSHOT_CACHE_FULL');
  });
  test('invalid paging never creates an implicit fresh page',()=> {
    const {cache}=fixture();expect(()=>cache.page(context,2,undefined,()=>docs)).toThrow('SNAPSHOT_REQUIRED');
    for(const page of [0,NaN,Infinity,1.1])expect(()=>cache.page(context,page,undefined,()=>docs)).toThrow('INVALID_PAGINATION');
    expect(()=>cache.page({...context,limit:101},1,undefined,()=>docs)).toThrow('INVALID_PAGINATION');
  });
});
