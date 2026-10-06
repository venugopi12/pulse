# Browser load test

Three tenants open at once (one Chromium context each), 100 events/sec/tenant at peak
(~240–300 events/sec total), delivered as ~100 small WebSocket frames
per second per tenant. Production build with the Profiler API enabled (`build:profile`).
15s measured per scenario after 3s warm-up; values are the mean of the three tabs.

| Scenario | React commits/s | Widget renders/s | Render ms/s | FPS | p95 frame ms | Long tasks ms/s | DOM nodes | JS heap MB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Dashboard: naive (no buffer, no memo) | 56 | 227.7 | 515.7 | 7.9 | 188.9 | 166.3 | 562 | 63.2 |
| Dashboard: + 250ms buffer only | 10.1 | 44.6 | 71.3 | 52.1 | 33.4 | 14.5 | 549 | 34.7 |
| Dashboard: + selectors/memo only | 84.7 | 178.9 | 106 | 41.4 | 66.7 | 30.9 | 551 | 30.2 |
| Dashboard: optimized (both) | 11 | 29.3 | 27.3 | 56.1 | 33.3 | 4.2 | 551 | 22.3 |
| Events 10k: not virtualized | 1.3 | – | 249.5 | 1.4 | 972.2 | 986.9 | 82484 | 104.7 |
| Events 10k: virtualized | 8 | – | 3.3 | 60 | 16.7 | 0 | 293 | 11.7 |

- **React commits/s**: React render passes that touched the page (the "commits" bar in React DevTools' Profiler).
- **Widget renders/s**: renders of individual widget bodies, summed across the dashboard.
- **Render ms/s**: main-thread time React spent rendering, per second.
- **Long tasks ms/s**: time the main thread was blocked in chunks over 50ms.

Run on: linux x64, Node v22.22.0, 2026-10-06T02:57Z
