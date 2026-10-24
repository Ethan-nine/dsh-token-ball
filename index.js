import { addUsage, emptyTotals, isPeak, normalizePrices } from './cost.js';

const ROUTE_PATH = '/dsh-token-ball/usage';
const BALANCE_TTL_MS = 30_000;
const BALANCE_RETRY_MS = 5_000;
const BALANCE_WAIT_MS = 2_500;

/** Per-session fold state. The session log remains the source of truth. */
const sessions = new Map();
/** Last account balance read, shared by every conversation. */
let balanceCache = { at: 0, value: undefined };
let balancePending;

function readSession(session, prices) {
  let state = sessions.get(session.id);
  if (state === undefined) {
    state = { nextSeq: 0, totals: emptyTotals() };
    sessions.set(session.id, state);
  }

  const end = session.seq;
  if (state.nextSeq < end) {
    const events = session.snapshotEvents(state.nextSeq);
    let totals = state.totals;
    for (const event of events) {
      if (event.seq >= end) break;
      if (event.type === 'assistant/message' && event.data.usage) {
        const source = event.data.message?.source;
        totals = addUsage(
          totals,
          event.data.usage,
          source?.provider,
          source?.model,
          event.time,
          prices,
        );
      } else if (event.type === 'turn/start') {
        const turn = event.data.turn;
        if (totals.lastTurn !== turn) {
          totals = { ...totals, turns: totals.turns + 1, lastTurn: turn };
        }
      }
    }
    state.totals = totals;
    state.nextSeq = end;
  }

  return state.totals;
}

function accountMetadata(req) {
  const header = String(req.headers['accept-language'] ?? '');
  const locale = header.toLowerCase().includes('zh') ? 'zh-CN' : 'en-US';
  return {
    version: '1.1.0',
    locale,
    timezoneOffsetSeconds: 8 * 60 * 60,
  };
}

function normalizeBalance(value) {
  if (value === null || value === undefined) return { status: 'signed-out' };
  if (value.status === 'failed') return { status: 'failed' };
  if (value.status !== 'ready') return { status: 'unavailable' };
  return {
    status: 'ready',
    wallets: Array.isArray(value.value) ? value.value : [],
    bonusWallets: Array.isArray(value.bonusWallets) ? value.bonusWallets : [],
  };
}

async function refreshBalance(ctx, req) {
  const account = ctx.get('deepseekAccount');
  if (account === undefined) {
    balanceCache = { at: Date.now(), value: { status: 'unavailable' } };
    return balanceCache.value;
  }
  try {
    const value = await account.getBalance(accountMetadata(req));
    balanceCache = { at: Date.now(), value: normalizeBalance(value) };
  } catch {
    balanceCache = { at: Date.now() - BALANCE_TTL_MS + BALANCE_RETRY_MS, value: { status: 'failed' } };
  }
  return balanceCache.value;
}

async function readBalance(ctx, req) {
  const age = Date.now() - balanceCache.at;
  if (balanceCache.value !== undefined && age >= 0 && age < BALANCE_TTL_MS) {
    return balanceCache.value;
  }
  if (balancePending === undefined) {
    balancePending = refreshBalance(ctx, req).finally(() => {
      balancePending = undefined;
    });
  }
  const pending = balancePending;
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(undefined), BALANCE_WAIT_MS);
  });
  const settled = await Promise.race([pending, timeout]);
  return settled ?? balanceCache.value ?? { status: 'loading' };
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(text);
}

function usagePayload(ctx, sessionId, req, prices) {
  const session = sessionId === undefined ? undefined : ctx.sessions.get(sessionId);
  const totals = session === undefined ? emptyTotals() : readSession(session, prices);
  return {
    sessionId: sessionId ?? null,
    live: session !== undefined,
    totals,
    balance: undefined,
    period: 'off-peak',
  };
}

/** Host half: owns a small authenticated-origin usage endpoint and balance cache. */
export function apply(ctx, config) {
  const prices = normalizePrices(config?.prices);
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    async handler(req, res) {
      if (req.method !== 'GET') {
        json(res, 405, { error: 'method-not-allowed' });
        return;
      }
      try {
        const url = new URL(req.url ?? ROUTE_PATH, 'http://127.0.0.1');
        const sessionId = url.searchParams.get('sessionId') || undefined;
        const payload = usagePayload(ctx, sessionId, req, prices);
        payload.balance = await readBalance(ctx, req);
        payload.period = isPeak(Date.now()) ? 'peak' : 'off-peak';
        json(res, 200, payload);
      } catch (error) {
        json(res, 500, { error: 'usage-read-failed', message: error instanceof Error ? error.message : String(error) });
      }
    },
  }), 'token-ball: usage route');

  ctx.effect(() => ctx.on('session/disposed', (session) => {
    sessions.delete(session.id);
  }), 'token-ball: session cache');
}

export const inject = ['webServer', 'sessions'];
export const name = 'dsh-token-ball';
