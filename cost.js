/**
 * DeepSeek list-price arithmetic for the token ball.
 *
 * Prices are CNY per one million tokens. Each route has three prices:
 * cache-hit input, cache-miss input, and output. DeepSeek doubles the
 * off-peak price during weekday peak windows (09:00-12:00 and
 * 14:00-18:00 Beijing time, Monday through Friday).
 *
 * The adapter reports `inputTokens` for cache-miss prompt tokens and
 * `cacheReadTokens` separately; `totalTokens` is their sum plus output.
 */

const DEFAULT_PRICES = Object.freeze({
  'deepseek-flash': Object.freeze({
    cacheHit: Object.freeze([0.02, 0.04]),
    cacheMiss: Object.freeze([1, 2]),
    output: Object.freeze([4, 8]),
  }),
  'deepseek-v4-pro': Object.freeze({
    cacheHit: Object.freeze([0.15, 0.3]),
    cacheMiss: Object.freeze([4.5, 9]),
    output: Object.freeze([13.5, 27]),
  }),
});

const MODEL_ALIASES = Object.freeze({
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
});

const PEKING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Normalize a configured price table while ignoring malformed entries. */
export function normalizePrices(configured) {
  const result = {};
  for (const [name, value] of Object.entries(DEFAULT_PRICES)) {
    result[name] = {
      cacheHit: [...value.cacheHit],
      cacheMiss: [...value.cacheMiss],
      output: [...value.output],
    };
  }
  if (configured && typeof configured === 'object') {
    for (const [name, value] of Object.entries(configured)) {
      if (!value || typeof value !== 'object') continue;
      const read = (field) => {
        const pair = value[field];
        if (!Array.isArray(pair) || pair.length !== 2) return undefined;
        const off = Number(pair[0]);
        const peak = Number(pair[1]);
        return Number.isFinite(off) && off >= 0 && Number.isFinite(peak) && peak >= 0
          ? [off, peak]
          : undefined;
      };
      const cacheHit = read('cacheHit');
      const cacheMiss = read('cacheMiss');
      const output = read('output');
      if (cacheHit && cacheMiss && output) result[name] = { cacheHit, cacheMiss, output };
    }
  }
  return result;
}

/** Resolve the model key, canonicalizing the names DeepSeek still accepts. */
export function canonicalModel(model) {
  if (typeof model !== 'string' || model.length === 0) return 'deepseek-flash';
  return MODEL_ALIASES[model] ?? model;
}

/** True inside DeepSeek's published weekday peak windows (Beijing time). */
export function isPeak(timeMs) {
  const shifted = new Date((Number.isFinite(timeMs) ? timeMs : Date.now()) + PEKING_OFFSET_MS);
  const day = shifted.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return (minutes >= 9 * 60 && minutes < 12 * 60)
    || (minutes >= 14 * 60 && minutes < 18 * 60);
}

/** Resolve the price pair for one route; unknown routes fall back to Flash. */
export function resolvePrice(prices, provider, model) {
  const canonical = canonicalModel(model);
  if (prices[canonical]) return { key: canonical, price: prices[canonical], unknown: false };
  if (provider === 'deepseek-account' || provider === 'deepseek') {
    return { key: 'deepseek-flash', price: prices['deepseek-flash'], unknown: true };
  }
  return { key: 'deepseek-flash', price: prices['deepseek-flash'], unknown: true };
}

/**
 * Add one provider usage record to a running total.
 *
 * `cacheWriteTokens` is billed at the cache-miss rate because DeepSeek's
 * published table exposes only cache-hit and cache-miss input prices.
 * Returns a new totals object so the caller can fold events purely.
 */
export function addUsage(totals, usage, provider, model, timeMs, prices) {
  if (!usage || typeof usage !== 'object') return totals;
  const read = (field) => {
    const value = usage[field];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  };
  const input = read('inputTokens');
  const output = read('outputTokens');
  const cacheRead = read('cacheReadTokens');
  const cacheWrite = read('cacheWriteTokens');
  const reasoning = read('reasoningTokens');
  const total = input + output + cacheRead + cacheWrite;

  const resolved = resolvePrice(prices, provider, model);
  const index = isPeak(timeMs) ? 1 : 0;
  const costCny = (
    (input + cacheWrite) * resolved.price.cacheMiss[index]
    + cacheRead * resolved.price.cacheHit[index]
    + output * resolved.price.output[index]
  ) / 1_000_000;

  return {
    ...totals,
    inputTokens: totals.inputTokens + input,
    outputTokens: totals.outputTokens + output,
    cacheReadTokens: totals.cacheReadTokens + cacheRead,
    cacheWriteTokens: totals.cacheWriteTokens + cacheWrite,
    reasoningTokens: totals.reasoningTokens + reasoning,
    totalTokens: totals.totalTokens + total,
    promptTokens: totals.promptTokens + input + cacheRead + cacheWrite,
    costCny: totals.costCny + costCny,
    pricedCalls: totals.pricedCalls + 1,
    unpricedCalls: totals.unpricedCalls + (resolved.unknown ? 1 : 0),
    lastModel: typeof model === 'string' && model.length > 0 ? model : totals.lastModel,
    lastProvider: typeof provider === 'string' && provider.length > 0 ? provider : totals.lastProvider,
  };
}

/** Empty accumulator used for a conversation with no billable calls yet. */
export function emptyTotals() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    promptTokens: 0,
    costCny: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
    turns: 0,
    lastTurn: null,
    lastModel: null,
    lastProvider: null,
  };
}
