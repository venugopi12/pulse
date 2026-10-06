# WebSocket load test

300 clients (100 per tenant), 100 events/sec/tenant at peak, 15s per run.
"Server batch" is `WS_FLUSH_MS`: how long the server collects a tenant's events before sending one frame.

| Server batch | Clients | Frames/s (all clients) | Events delivered/s | Latency p50 | Latency p95 | Latency p99 | Server CPU | Server RSS | Cross-tenant deliveries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 ms | 300 | 22,740 | 22,740 | 2 ms | 5 ms | 8 ms | 21% | 147 MB | 0 |
| 50 ms | 300 | 5,980 | 22,522 | 27 ms | 49 ms | 52 ms | 8% | 142 MB | 0 |

- **Latency**: from the event being created on the server to a client parsing it (same machine clock).
- **Cross-tenant deliveries** must be 0: every event a client receives belongs to its own tenant.

Run on: linux x64, Node v22.22.0, 2026-10-06T02:54Z
