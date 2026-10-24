window.__ModuleLoader__.load({
  id: '@local/dsh-token-ball',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const POSITION_KEY = 'dsh-token-ball:position';
    const BALL_SIZE = 64;
    const EDGE = 12;
    const POLL_MS = 1200;
    const CONTEXT_POLL_MS = 10_000;
    const CONTEXT_RING_RADIUS = 30;
    const CONTEXT_RING_LENGTH = 2 * Math.PI * CONTEXT_RING_RADIUS;

    const DICT = {
      en: {
        title: 'This conversation',
        balance: 'Account balance',
        recharge: 'Recharge',
        bonus: 'Bonus',
        input: 'Input',
        output: 'Output',
        cacheHit: 'Cache hit',
        requests: 'Requests',
        tokens: 'tokens',
        loading: 'Reading usage…',
        error: 'Usage read failed',
        retry: 'Retry',
        newChat: 'New conversation',
        signedOut: 'Not signed in',
        unavailable: 'Balance unavailable',
        failed: 'Balance unavailable',
        peak: 'Peak pricing',
        offPeak: 'Off-peak pricing',
        estimate: 'Estimated with DeepSeek list prices',
        dragHint: 'Drag to move, click to expand',
        noUsage: 'No billable requests yet',
        context: 'Context',
        contextOpen: 'Details',
        contextSent: 'Sent',
        contextSaved: 'Compression saved',
        contextBlocks: 'compressed blocks',
        contextSysprompt: 'System prompt',
        contextTool: 'Tools',
        contextText: 'Messages',
        contextCode: 'Code',
        contextSummaries: 'Summaries',
        contextSystem: 'System',
        contextOther: 'Other',
      },
      zh: {
        title: '本对话',
        balance: '账户余额',
        recharge: '充值余额',
        bonus: '赠金',
        input: '输入',
        output: '输出',
        cacheHit: '缓存命中',
        requests: '请求数',
        tokens: 'tokens',
        loading: '正在读取用量…',
        error: '用量读取失败',
        retry: '重试',
        newChat: '新对话',
        signedOut: '未登录',
        unavailable: '余额不可用',
        failed: '余额获取失败',
        peak: '高峰价',
        offPeak: '空闲价',
        estimate: '按 DeepSeek 官方价目估算',
        dragHint: '拖动移动，点击展开',
        noUsage: '还没有产生用量',
        context: '上下文',
        contextOpen: '详情',
        contextSent: '发送',
        contextSaved: '压缩节省',
        contextBlocks: '个压缩块',
        contextSysprompt: '系统提示',
        contextTool: '工具',
        contextText: '消息',
        contextCode: '代码',
        contextSummaries: '摘要',
        contextSystem: '系统',
        contextOther: '其他',
      },
    };

    let activeSessionId = null;
    const sessionListeners = new Set();

    function publishSession(id) {
      if (activeSessionId === id) return;
      activeSessionId = id;
      for (const listener of sessionListeners) listener();
    }

    function useActiveSession() {
      const [id, setId] = useState(activeSessionId);
      useEffect(() => {
        const listener = () => setId(activeSessionId);
        sessionListeners.add(listener);
        listener();
        return () => sessionListeners.delete(listener);
      }, []);
      return id;
    }

    function SessionTracker({ sessionId }) {
      useEffect(() => {
        if (!sessionId) return undefined;
        publishSession(sessionId);
        return () => {
          if (activeSessionId === sessionId) publishSession(null);
        };
      }, [sessionId]);
      return null;
    }

    function clampPosition(x, y) {
      const width = typeof window === 'undefined' ? 1024 : window.innerWidth;
      const height = typeof window === 'undefined' ? 768 : window.innerHeight;
      return {
        x: Math.min(Math.max(EDGE, Number.isFinite(x) ? x : width - BALL_SIZE - 24), width - BALL_SIZE - EDGE),
        y: Math.min(Math.max(EDGE, Number.isFinite(y) ? y : height - BALL_SIZE - 190), height - BALL_SIZE - EDGE),
      };
    }

    function readPosition() {
      const fallback = {
        x: (typeof window === 'undefined' ? 1024 : window.innerWidth) - BALL_SIZE - 24,
        y: (typeof window === 'undefined' ? 768 : window.innerHeight) - BALL_SIZE - 190,
      };
      try {
        const raw = window.localStorage.getItem(POSITION_KEY);
        if (!raw) return clampPosition(fallback.x, fallback.y);
        const value = JSON.parse(raw);
        return clampPosition(Number(value.x), Number(value.y));
      } catch {
        return clampPosition(fallback.x, fallback.y);
      }
    }

    function writePosition(position) {
      try {
        window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
      } catch {
        /* localStorage may be unavailable in a hardened browser profile. */
      }
    }

    function formatTokens(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '0';
      return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(number)));
    }

    function formatCompactTokens(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '0';
      const absolute = Math.abs(number);
      if (absolute >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
      if (absolute >= 1e6) return `${(number / 1e6).toFixed(2)}M`;
      if (absolute >= 1e4) return `${(number / 1e3).toFixed(1)}K`;
      return formatTokens(number);
    }

    function formatPercent(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '—';
      if (number > 0 && number < 10) return `${number.toFixed(1)}%`;
      return `${Math.round(number)}%`;
    }

    function formatMoney(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) return '—';
      if (number > 0 && number < 0.0001) return '<0.0001';
      if (number < 1) return number.toFixed(4);
      return number.toFixed(2);
    }

    function currencySymbol(currency) {
      return currency === 'USD' ? '$' : '¥';
    }

    function walletAmount(wallets) {
      if (!Array.isArray(wallets) || wallets.length === 0) return null;
      const wallet = wallets.find((item) => item && item.currency === 'CNY') ?? wallets[0];
      if (!wallet) return null;
      return `${currencySymbol(wallet.currency)}${formatMoney(Number(wallet.balance))}`;
    }

    function bonusAmount(wallets) {
      if (!Array.isArray(wallets) || wallets.length === 0) return null;
      const totals = new Map();
      for (const wallet of wallets) {
        if (!wallet) continue;
        const amount = Number(wallet.balance);
        if (!Number.isFinite(amount) || amount === 0) continue;
        totals.set(wallet.currency, (totals.get(wallet.currency) ?? 0) + amount);
      }
      if (totals.size === 0) return null;
      return [...totals.entries()]
        .map(([currency, amount]) => `${currencySymbol(currency)}${formatMoney(amount)}`)
        .join(' + ');
    }

    const CONTEXT_CATEGORY_LABELS = {
      sysprompt: 'contextSysprompt',
      tool: 'contextTool',
      text: 'contextText',
      code: 'contextCode',
      summaries: 'contextSummaries',
      system: 'contextSystem',
    };

    const CONTEXT_CATEGORY_COLORS = {
      sysprompt: 'var(--dsw-alias-brand-primary)',
      tool: '#7c5cff',
      text: '#2ea44f',
      code: '#e05d8a',
      summaries: '#f5a623',
      system: '#8a94a6',
    };

    function contextCategoryLabel(translate, key) {
      return translate(CONTEXT_CATEGORY_LABELS[key] ?? 'contextOther');
    }

    function contextCategoryColor(key) {
      return CONTEXT_CATEGORY_COLORS[key] ?? 'var(--dsw-alias-border-l2)';
    }

    function contextPressureColor(percent) {
      if (percent >= 85) return 'var(--dsw-alias-state-error-primary)';
      if (percent >= 60) return '#f5a623';
      return 'var(--dsw-alias-state-success-primary)';
    }

    function normalizeContext(status, expectedSessionId) {
      if (!status || status.ok !== true) return null;
      const actualSessionId = typeof status.sessionId === 'string'
        ? status.sessionId
        : (typeof status.conversationId === 'string' ? status.conversationId : '');
      if (expectedSessionId && actualSessionId && actualSessionId !== expectedSessionId) return null;
      const view = status.contextView && typeof status.contextView === 'object'
        ? status.contextView
        : {};
      const limit = Number(status.contextLimit);
      const anchorTokens = Number(view.anchor?.tokens);
      const rawUsed = status.contextTokens ?? (Number.isFinite(anchorTokens) ? anchorTokens : view.sentTotal);
      const used = Number(rawUsed);
      if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(used) || used < 0) return null;

      const categories = Array.isArray(view.categories)
        ? view.categories
          .map((category) => ({
            key: typeof category?.key === 'string' ? category.key : 'other',
            tokens: Number(category?.tokens) || 0,
            pct: Number(category?.pct) || 0,
          }))
          .filter((category) => category.tokens > 0)
        : [];

      const folds = Array.isArray(view.folds) ? view.folds : [];
      let saved = 0;
      for (const fold of folds) {
        const value = Number(fold?.reclaimed);
        if (Number.isFinite(value) && value > 0) saved += value;
      }
      if (saved === 0) {
        for (const fold of folds) {
          const value = Number(fold?.savedSoFar);
          if (Number.isFinite(value)) saved = Math.max(saved, value);
        }
      }

      const blocks = Array.isArray(status.blocks)
        ? status.blocks.filter((block) => block && block.active === true).length
        : 0;
      const sent = Number(view.sentTotal);
      const webUrl = typeof status.webUrl === 'string'
        && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(status.webUrl)
        ? status.webUrl
        : null;

      return {
        used,
        limit,
        sent: Number.isFinite(sent) && sent >= 0 ? sent : used,
        percent: Math.max(0, Math.min(100, (used / limit) * 100)),
        categories,
        saved,
        blocks,
        webUrl,
      };
    }

    function useContextStatus(sessionId) {
      const [context, setContext] = useState(null);

      useEffect(() => {
        let disposed = false;
        let busy = false;
        let timer;
        const controller = new AbortController();

        const read = async () => {
          if (busy) return;
          busy = true;
          try {
            const originResponse = await fetch('/bili/origin', {
              signal: controller.signal,
              headers: { accept: 'application/json' },
            });
            if (!originResponse.ok) throw new Error('context-plugin-absent');
            const originValue = await originResponse.json();
            const origin = typeof originValue?.origin === 'string'
              ? originValue.origin.replace(/\/+$/, '')
              : '';
            if (!origin) throw new Error('context-origin-missing');

            const query = new URLSearchParams({
              conversationId: sessionId || 'dsh',
              fallback: 'latest',
            });
            const response = await fetch(`${origin}/__bili/plugin/status?${query}`, {
              signal: controller.signal,
              headers: { accept: 'application/json' },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const status = await response.json();
            if (disposed) return;
            const next = normalizeContext(status, sessionId);
            if (next) setContext(next);
          } catch {
            /* The context plugin is optional; keep the ball working without it. */
          } finally {
            busy = false;
          }
        };

        setContext(null);
        read();
        timer = window.setInterval(() => {
          if (!document.hidden) read();
        }, CONTEXT_POLL_MS);
        const onVisibility = () => {
          if (!document.hidden) read();
        };
        window.addEventListener('focus', read);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
          disposed = true;
          window.clearInterval(timer);
          controller.abort();
          window.removeEventListener('focus', read);
          document.removeEventListener('visibilitychange', onVisibility);
        };
      }, [sessionId]);

      return context;
    }

    const CSS = `
      .dshtb-root {
        position: fixed;
        z-index: 780;
        pointer-events: none;
        color: var(--dsw-alias-label-primary);
        -webkit-user-select: none;
        user-select: none;
        touch-action: none;
      }
      .dshtb-ball,
      .dshtb-card { pointer-events: auto; }
      .dshtb-ball {
        width: ${BALL_SIZE}px;
        height: ${BALL_SIZE}px;
        border: 0;
        border-radius: 999px;
        padding: 0;
        cursor: grab;
        color: #fff;
        background:
          radial-gradient(circle at 32% 24%, rgba(255,255,255,.42), transparent 34%),
          linear-gradient(145deg, var(--dsw-alias-brand-primary) 4%, #7c5cff 96%);
        box-shadow:
          0 12px 34px rgba(30, 41, 80, .32),
          0 2px 8px rgba(30, 41, 80, .22),
          inset 0 0 0 1px rgba(255,255,255,.26);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        transition: transform .18s ease, box-shadow .18s ease;
      }
      .dshtb-ball:hover {
        transform: translateY(-2px) scale(1.03);
        box-shadow:
          0 16px 40px rgba(30, 41, 80, .38),
          0 3px 10px rgba(30, 41, 80, .24),
          inset 0 0 0 1px rgba(255,255,255,.32);
      }
      .dshtb-ball:active { cursor: grabbing; transform: scale(.98); }
      .dshtb-ball:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 3px;
      }
      .dshtb-currency {
        font-size: 14px;
        font-weight: 500;
        line-height: 1;
        opacity: .92;
      }
      .dshtb-amount {
        font-size: 11px;
        font-weight: 650;
        line-height: 1.15;
        letter-spacing: -.2px;
        max-width: 52px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dshtb-live {
        position: absolute;
        top: 3px;
        right: 3px;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--dsw-alias-state-success-primary);
        border: 2px solid var(--dsw-alias-bg-overlay);
        box-shadow: 0 0 0 2px rgba(46, 204, 113, .14);
        animation: dshtb-pulse 2.2s ease-in-out infinite;
      }
      .dshtb-ring {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .dshtb-ring-track {
        stroke: rgba(255, 255, 255, .18);
      }
      .dshtb-ctx-badge {
        position: absolute;
        left: 50%;
        bottom: 4px;
        transform: translateX(-50%);
        padding: 1px 5px;
        border-radius: 999px;
        background: rgba(16, 18, 35, .28);
        color: #fff;
        font-size: 8px;
        font-weight: 650;
        line-height: 11px;
        letter-spacing: .1px;
        font-variant-numeric: tabular-nums;
        pointer-events: none;
      }
      .dshtb-card {
        position: absolute;
        width: 304px;
        max-width: calc(100vw - 24px);
        max-height: calc(100vh - 96px);
        overflow-y: auto;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 16px;
        background: var(--dsw-alias-bg-overlay);
        box-shadow: 0 24px 64px rgba(18, 24, 45, .28), 0 4px 16px rgba(18, 24, 45, .14);
        padding: 15px 16px 13px;
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        animation: dshtb-in .16s ease-out;
        color: var(--dsw-alias-label-primary);
      }
      .dshtb-card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .dshtb-kicker {
        color: var(--dsw-alias-label-secondary);
        font-size: 11px;
        font-weight: 500;
        letter-spacing: .4px;
        text-transform: uppercase;
        line-height: 16px;
      }
      .dshtb-model {
        display: block;
        margin-top: 2px;
        color: var(--dsw-alias-label-secondary);
        font-size: 10px;
        line-height: 14px;
        opacity: .8;
        max-width: 196px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dshtb-refresh {
        border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-secondary);
        border-radius: 8px;
        width: 26px;
        height: 26px;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        display: grid;
        place-items: center;
        padding: 0;
      }
      .dshtb-refresh:hover {
        color: var(--dsw-alias-label-primary);
        border-color: var(--dsw-alias-border-l2);
      }
      .dshtb-refresh:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 1px;
      }
      .dshtb-total {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-top: 8px;
      }
      .dshtb-cost {
        font-size: 27px;
        font-weight: 560;
        line-height: 34px;
        letter-spacing: -.9px;
        font-variant-numeric: tabular-nums;
      }
      .dshtb-total-tokens {
        color: var(--dsw-alias-label-secondary);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
      }
      .dshtb-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 12px;
      }
      .dshtb-stat {
        border-radius: 10px;
        background: var(--dsw-alias-bg-layer-1);
        padding: 7px 9px;
        min-width: 0;
      }
      .dshtb-stat-label {
        color: var(--dsw-alias-label-secondary);
        font-size: 10px;
        line-height: 14px;
      }
      .dshtb-stat-value {
        font-size: 13px;
        font-weight: 550;
        line-height: 18px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dshtb-stat-sub {
        color: var(--dsw-alias-label-secondary);
        font-size: 9px;
        line-height: 12px;
        font-variant-numeric: tabular-nums;
      }
      .dshtb-context {
        margin-top: 12px;
        padding: 9px 10px 10px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 10px;
        background: var(--dsw-alias-bg-layer-1);
      }
      .dshtb-context-head {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .dshtb-context-title {
        font-size: 11px;
        font-weight: 600;
        line-height: 15px;
      }
      .dshtb-context-pct {
        margin-left: auto;
        font-size: 13px;
        font-weight: 650;
        line-height: 16px;
        font-variant-numeric: tabular-nums;
      }
      .dshtb-context-link {
        border: 0;
        background: transparent;
        color: var(--dsw-alias-brand-primary);
        font-size: 10px;
        line-height: 14px;
        padding: 0;
        cursor: pointer;
        white-space: nowrap;
      }
      .dshtb-context-link:hover { text-decoration: underline; }
      .dshtb-context-link:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 1px;
        border-radius: 2px;
      }
      .dshtb-context-bar {
        height: 5px;
        margin-top: 7px;
        border-radius: 999px;
        background: var(--dsw-alias-border-l1);
        overflow: hidden;
      }
      .dshtb-context-bar span {
        display: block;
        height: 100%;
        border-radius: inherit;
        transition: width .35s ease, background .35s ease;
      }
      .dshtb-context-meta {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-top: 5px;
        color: var(--dsw-alias-label-secondary);
        font-size: 10px;
        line-height: 13px;
        font-variant-numeric: tabular-nums;
      }
      .dshtb-context-saved {
        margin-top: 2px;
        color: var(--dsw-alias-label-secondary);
        font-size: 9px;
        line-height: 12px;
        font-variant-numeric: tabular-nums;
      }
      .dshtb-context-stack {
        display: flex;
        gap: 2px;
        height: 6px;
        margin-top: 7px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--dsw-alias-border-l1);
      }
      .dshtb-context-stack span {
        display: block;
        height: 100%;
        min-width: 2px;
      }
      .dshtb-context-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 3px 8px;
        margin-top: 6px;
        color: var(--dsw-alias-label-secondary);
        font-size: 9px;
        line-height: 12px;
      }
      .dshtb-context-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        white-space: nowrap;
      }
      .dshtb-context-dot {
        width: 5px;
        height: 5px;
        border-radius: 999px;
        flex: none;
      }
      .dshtb-divider {
        height: 1px;
        background: var(--dsw-alias-border-l1);
        margin: 12px 0 10px;
      }
      .dshtb-balance {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .dshtb-balance-label {
        color: var(--dsw-alias-label-secondary);
        font-size: 11px;
        line-height: 16px;
      }
      .dshtb-balance-value {
        font-size: 17px;
        font-weight: 560;
        line-height: 22px;
        font-variant-numeric: tabular-nums;
      }
      .dshtb-bonus {
        color: var(--dsw-alias-label-secondary);
        font-size: 10px;
        line-height: 20px;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .dshtb-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 9px;
        color: var(--dsw-alias-label-secondary);
        font-size: 9px;
        line-height: 13px;
      }
      .dshtb-period {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      }
      .dshtb-period::before {
        content: '';
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: var(--dsw-alias-state-success-primary);
      }
      .dshtb-error {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 10px;
        padding: 8px 10px;
        border-radius: 9px;
        color: var(--dsw-alias-state-error-primary);
        background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
        font-size: 11px;
      }
      .dshtb-error button {
        color: inherit;
        background: transparent;
        border: 0;
        cursor: pointer;
        font-size: 11px;
        text-decoration: underline;
        padding: 0;
      }
      .dshtb-empty {
        color: var(--dsw-alias-label-secondary);
        font-size: 11px;
        margin-top: 7px;
      }
      @keyframes dshtb-in {
        from { opacity: 0; transform: translateY(5px) scale(.985); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes dshtb-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: .55; transform: scale(.82); }
      }
      @media (prefers-reduced-motion: reduce) {
        .dshtb-ball, .dshtb-card, .dshtb-live { animation: none; transition: none; }
      }
    `;

    function fallbackTranslate(key) {
      return DICT.zh[key] ?? key;
    }

    function TokenBall({ t }) {
      const translate = typeof t === 'function' ? t : fallbackTranslate;
      const sessionId = useActiveSession();
      const context = useContextStatus(sessionId);
      const [open, setOpen] = useState(false);
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const [tick, setTick] = useState(0);
      const [position, setPosition] = useState(readPosition);
      const positionRef = useRef(position);
      const dragRef = useRef(null);

      useEffect(() => {
        positionRef.current = position;
      }, [position]);

      useEffect(() => {
        const onResize = () => {
          setPosition((current) => {
            const next = clampPosition(current.x, current.y);
            positionRef.current = next;
            return next;
          });
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, []);

      useEffect(() => {
        let disposed = false;
        let busy = false;
        let timer;
        const controller = new AbortController();

        const read = async () => {
          if (busy) return;
          busy = true;
          const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
          try {
            const response = await fetch(`/dsh-token-ball/usage${query}`, {
              signal: controller.signal,
              headers: { accept: 'application/json' },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const value = await response.json();
            if (disposed) return;
            setData(value);
            setError(null);
          } catch (reason) {
            if (disposed || controller.signal.aborted) return;
            setError(reason instanceof Error ? reason.message : String(reason));
          } finally {
            busy = false;
          }
        };

        const start = () => {
          window.clearInterval(timer);
          timer = window.setInterval(() => {
            if (!document.hidden) read();
          }, POLL_MS);
        };

        read();
        start();
        const onVisibility = () => {
          if (!document.hidden) read();
        };
        window.addEventListener('focus', read);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
          disposed = true;
          window.clearInterval(timer);
          controller.abort();
          window.removeEventListener('focus', read);
          document.removeEventListener('visibilitychange', onVisibility);
        };
      }, [sessionId, tick]);

      const onPointerDown = (event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          origin: positionRef.current,
          moved: false,
        };
      };

      const onPointerMove = (event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
        if (!drag.moved) return;
        event.preventDefault();
        const next = clampPosition(drag.origin.x + dx, drag.origin.y + dy);
        positionRef.current = next;
        setPosition(next);
      };

      const onPointerUp = (event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (drag.moved) {
          writePosition(positionRef.current);
        } else {
          setOpen((value) => !value);
        }
      };

      const onKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setOpen((value) => !value);
        }
      };

      const totals = data?.totals ?? {
        totalTokens: 0,
        promptTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        costCny: 0,
        pricedCalls: 0,
      };
      const cost = formatMoney(totals.costCny);
      const balance = data?.balance;
      const wallet = balance?.status === 'ready' ? walletAmount(balance.wallets) : null;
      const bonus = balance?.status === 'ready' ? bonusAmount(balance.bonusWallets) : null;
      const period = data?.period === 'peak' ? translate('peak') : translate('offPeak');
      const cachePercent = totals.promptTokens > 0
        ? Math.round((totals.cacheReadTokens / totals.promptTokens) * 100)
        : 0;
      const contextColor = context ? contextPressureColor(context.percent) : null;
      const contextRingDash = context
        ? `${(context.percent / 100) * CONTEXT_RING_LENGTH} ${CONTEXT_RING_LENGTH}`
        : null;
      const contextTitle = context
        ? ` · ${translate('context')} ${formatPercent(context.percent)}`
        : '';
      const panelUp = position.y > window.innerHeight / 2;
      const panelRight = position.x > window.innerWidth / 2;
      const panelStyle = {
        [panelUp ? 'bottom' : 'top']: `${BALL_SIZE + 10}px`,
        [panelRight ? 'right' : 'left']: 0,
        transformOrigin: `${panelRight ? 'right' : 'left'} ${panelUp ? 'bottom' : 'top'}`,
      };

      const balanceText = (() => {
        if (!data) return translate('loading');
        if (!balance) return translate('loading');
        if (balance.status === 'ready') return wallet ?? translate('unavailable');
        if (balance.status === 'signed-out') return translate('signedOut');
        if (balance.status === 'failed') return translate('failed');
        if (balance.status === 'loading') return translate('loading');
        return translate('unavailable');
      })();

      return h('div', {
        className: 'dshtb-root',
        style: { left: `${position.x}px`, top: `${position.y}px` },
        'data-token-ball': 'root',
      }, [
        h('style', { key: 'style' }, CSS),
        open && h('section', {
          key: 'card',
          className: 'dshtb-card',
          style: panelStyle,
          role: 'dialog',
          'aria-label': translate('title'),
          onPointerDown: (event) => event.stopPropagation(),
        }, [
          h('div', { className: 'dshtb-card-head', key: 'head' }, [
            h('div', { key: 'headings' }, [
              h('span', { className: 'dshtb-kicker', key: 'kicker' }, translate('title')),
              h('span', { className: 'dshtb-model', key: 'model' },
                totals.lastModel ?? (data?.live ? translate('noUsage') : translate('newChat'))),
            ]),
            h('button', {
              key: 'refresh',
              type: 'button',
              className: 'dshtb-refresh',
              title: translate('retry'),
              'aria-label': translate('retry'),
              onClick: () => setTick((value) => value + 1),
            }, '↻'),
          ]),
          h('div', { className: 'dshtb-total', key: 'total' }, [
            h('span', { className: 'dshtb-cost', key: 'cost' }, `¥${cost}`),
            h('span', { className: 'dshtb-total-tokens', key: 'tokens' },
              `${formatTokens(totals.totalTokens)} ${translate('tokens')}`),
          ]),
          error && h('div', { className: 'dshtb-error', key: 'error' }, [
            h('span', { key: 'message' }, translate('error')),
            h('button', { key: 'retry', type: 'button', onClick: () => setTick((value) => value + 1) },
              translate('retry')),
          ]),
          h('div', { className: 'dshtb-grid', key: 'grid' }, [
            h('div', { className: 'dshtb-stat', key: 'input' }, [
              h('div', { className: 'dshtb-stat-label', key: 'label' }, translate('input')),
              h('div', { className: 'dshtb-stat-value', key: 'value' }, formatTokens(totals.promptTokens)),
            ]),
            h('div', { className: 'dshtb-stat', key: 'output' }, [
              h('div', { className: 'dshtb-stat-label', key: 'label' }, translate('output')),
              h('div', { className: 'dshtb-stat-value', key: 'value' }, formatTokens(totals.outputTokens)),
            ]),
            h('div', { className: 'dshtb-stat', key: 'cache' }, [
              h('div', { className: 'dshtb-stat-label', key: 'label' }, translate('cacheHit')),
              h('div', { className: 'dshtb-stat-value', key: 'value' }, formatTokens(totals.cacheReadTokens)),
              h('div', { className: 'dshtb-stat-sub', key: 'sub' }, `${cachePercent}%`),
            ]),
            h('div', { className: 'dshtb-stat', key: 'requests' }, [
              h('div', { className: 'dshtb-stat-label', key: 'label' }, translate('requests')),
              h('div', { className: 'dshtb-stat-value', key: 'value' }, formatTokens(totals.pricedCalls)),
            ]),
          ]),
          context && h('div', { className: 'dshtb-context', key: 'context' }, [
            h('div', { className: 'dshtb-context-head', key: 'head' }, [
              h('span', { className: 'dshtb-context-title', key: 'title' }, translate('context')),
              h('span', {
                className: 'dshtb-context-pct',
                key: 'pct',
                style: { color: contextColor },
              }, formatPercent(context.percent)),
              context.webUrl && h('a', {
                className: 'dshtb-context-link',
                key: 'open',
                href: context.webUrl,
                target: '_blank',
                rel: 'noreferrer noopener',
                title: translate('contextOpen'),
              }, translate('contextOpen')),
            ]),
            h('div', { className: 'dshtb-context-bar', key: 'bar' }, [
              h('span', {
                key: 'fill',
                style: {
                  width: `${Math.min(100, context.percent)}%`,
                  background: contextColor,
                },
              }),
            ]),
            h('div', { className: 'dshtb-context-meta', key: 'meta' }, [
              h('span', { key: 'usage' },
                `${formatCompactTokens(context.used)} / ${formatCompactTokens(context.limit)}`),
              h('span', { key: 'sent' },
                `${translate('contextSent')} ${formatCompactTokens(context.sent)}`),
            ]),
            (context.saved > 0 || context.blocks > 0) && h('div', {
              className: 'dshtb-context-saved',
              key: 'saved',
            }, [
              context.saved > 0
                ? `${translate('contextSaved')} ${formatCompactTokens(context.saved)}`
                : null,
              context.blocks > 0
                ? `${context.blocks} ${translate('contextBlocks')}`
                : null,
            ].filter(Boolean).join(' · ')),
            context.categories.length > 0 && h('div', {
              className: 'dshtb-context-stack',
              key: 'stack',
            }, context.categories.map((category) => h('span', {
              key: category.key,
              style: {
                width: `${Math.min(100, category.pct)}%`,
                background: contextCategoryColor(category.key),
              },
            }))),
            context.categories.length > 0 && h('div', {
              className: 'dshtb-context-legend',
              key: 'legend',
            }, context.categories.map((category) => h('span', {
              className: 'dshtb-context-legend-item',
              key: category.key,
            }, [
              h('span', {
                className: 'dshtb-context-dot',
                key: 'dot',
                style: { background: contextCategoryColor(category.key) },
              }),
              `${contextCategoryLabel(translate, category.key)} ${Math.round(category.pct)}%`,
            ]))),
          ]),
          h('div', { className: 'dshtb-divider', key: 'divider' }),
          h('div', { className: 'dshtb-balance', key: 'balance' }, [
            h('div', { key: 'left' }, [
              h('div', { className: 'dshtb-balance-label', key: 'label' }, translate('balance')),
              h('div', { className: 'dshtb-balance-value', key: 'value' }, balanceText),
            ]),
            bonus && h('div', { className: 'dshtb-bonus', key: 'bonus' },
              `${translate('bonus')} ${bonus}`),
          ]),
          h('div', { className: 'dshtb-footer', key: 'footer' }, [
            h('span', { key: 'estimate' }, translate('estimate')),
            h('span', { className: 'dshtb-period', key: 'period', title: period }, period),
          ]),
        ]),
        h('button', {
          key: 'ball',
          type: 'button',
          className: 'dshtb-ball',
          style: { position: 'relative' },
          title: `${translate('dragHint')} · ${translate('title')}: ¥${cost}${contextTitle}`,
          'aria-label': `${translate('title')} ¥${cost}${contextTitle}`,
          'aria-expanded': open,
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
          onKeyDown,
        }, [
          context && h('svg', {
            className: 'dshtb-ring',
            key: 'ring',
            viewBox: `0 0 ${BALL_SIZE} ${BALL_SIZE}`,
            'aria-hidden': true,
          }, [
            h('circle', {
              className: 'dshtb-ring-track',
              key: 'track',
              cx: BALL_SIZE / 2,
              cy: BALL_SIZE / 2,
              r: CONTEXT_RING_RADIUS,
              fill: 'none',
              strokeWidth: 3,
            }),
            context.percent > 0 && h('circle', {
              key: 'progress',
              cx: BALL_SIZE / 2,
              cy: BALL_SIZE / 2,
              r: CONTEXT_RING_RADIUS,
              fill: 'none',
              stroke: contextColor,
              strokeWidth: 3,
              strokeLinecap: 'round',
              strokeDasharray: contextRingDash,
              transform: `rotate(-90 ${BALL_SIZE / 2} ${BALL_SIZE / 2})`,
            }),
          ]),
          data?.live && h('span', { className: 'dshtb-live', key: 'live', 'aria-hidden': true }),
          h('span', { className: 'dshtb-currency', key: 'currency' }, '¥'),
          h('span', { className: 'dshtb-amount', key: 'amount' }, cost),
          context && h('span', { className: 'dshtb-ctx-badge', key: 'ctx' },
            formatPercent(context.percent)),
        ]),
      ]);
    }

    const en = DICT.en;
    const zh = DICT.zh;

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('tokenBall', { en, zh }), 'token-ball: dictionaries');
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'token-ball-session',
          order: 1000,
        }, SessionTracker));
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'token-ball',
          order: 60,
          locale: 'tokenBall',
        }, TokenBall));
      },
    };
  },
});
