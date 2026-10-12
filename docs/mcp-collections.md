# MCP collection contract (3.4.2-mcp.1)

The maintained fork adds GET `/api/actors`, `/api/actors/{id}`, `/api/items`,
`/api/items/{id}`, and `/api/world`. Use a scoped API key with `entity:read`,
a permitted client and a live bound Foundry user. Missing identity, scope,
client or document resolution fails closed; it never falls back to a GM.
Collections and embedded data require OBSERVER permission for that user.

Collections return `snapshotId`, `total`, `page`, `limit` and `actors` or `items`.
Start at page 1 (default limit 100, maximum 100); reuse the returned `snapshotId`
for subsequent pages. Optional `query` and `type` filter authorized records before
sorting by NFKC lowercase name, type and case-sensitive ID. Snapshots bind the
caller key, user, world, collection, filters and page size. Records are serialized
once; mutation and permission hooks invalidate snapshots, as do world changes
and relay reconnects. The relay injects caller identity from the live scoped key
and rejects spoofed context.

Snapshots expire after five minutes, contain at most 10,000 records, and share
an 8 MiB serialized-data budget with at most 32 active snapshots. Oversized data
is rejected without truncation. Bounded tombstones retain explicit invalidation
errors. Errors include `SNAPSHOT_EXPIRED`, `SNAPSHOT_INVALIDATED`,
`SNAPSHOT_CONTEXT_MISMATCH`, `SNAPSHOT_OVERSIZED`, `SNAPSHOT_CACHE_FULL`,
`SNAPSHOT_REQUIRED`, and `PAGE_OUT_OF_RANGE`. An unknown snapshot fails as expired.

Local acceptance used Foundry 14.369, dnd5e 6.0.6 and disposable `test1world`.
Four caller roles, owned/shared/hidden data, duplicate-name 251-record traversal,
MCP tools/resources, invalidation, actual five-minute expiry, oversized data and
cache exhaustion passed. This is not Foundry 13 or hosted integration evidence.
The MCP repository records reproducible local commands and sanitized results.

Module checks: `npm test -- --runInBand`, `npm run build`.
Relay checks (in `go-relay`): `go test ./...`, `go build ./cmd/server`.
