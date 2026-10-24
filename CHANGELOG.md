# Changelog

## 1.1.0 — 2026-10-24

Context-panel integration.

- Detect the optional `billion-context` (“上下文” / `bili-context`) panel through
  the Host's `/bili/origin` route.
- Add a context-pressure ring and percentage badge around the floating ball.
- Add a context card section with used/limit, sent tokens, compression savings,
  active compression blocks, and the system/tool/message/code/summary breakdown.
- Poll context status every 10 seconds, pause while the page is hidden, and
  refresh immediately on focus.
- Open the matching context panel from a “详情 / Details” link when available.
- Hide the entire context UI when the optional plugin is absent or unreachable.
- Context integration reads aggregate numbers only; conversation text is not
  copied into Token Ball.

## 1.0.0 — 2026-10-23

First public release.

- Draggable floating ball on Harness `shell.overlay`.
- Current-session token totals: input, output, cache reads, cache writes.
- Estimated CNY cost with DeepSeek peak/off-peak list prices.
- DeepSeek account recharge balance and bonus balance.
- Detail card with token breakdown, cache-hit ratio, request count, and pricing window.
- Position persistence, light/dark theme tokens, keyboard toggle, reduced-motion support.
- Local Host route with incremental session-log folding and a 30-second balance cache.
- English and Chinese metadata.
