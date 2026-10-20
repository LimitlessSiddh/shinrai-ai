'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePoll, type ApiFailure } from './api';
import type { FixtureInfo, MarketDetail, MarketRow, SystemDto } from './types';

export type ToastTone = 'success' | 'danger' | 'warning' | 'neutral';
export type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
  href?: string;
  hrefLabel?: string;
};

type Workspace = {
  marketId: string | null;
  marketsLoading: boolean;
  marketsError: ApiFailure | null;
  detail: MarketDetail | null;
  detailError: ApiFailure | null;
  fixture: FixtureInfo | null;
  system: SystemDto | null;
  systemError: ApiFailure | null;
  /** Re-poll everything now (after a command). */
  refresh: () => void;
  toasts: Toast[];
  notify: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
};

const Ctx = createContext<Workspace | null>(null);

/** One polling source for the shell and every view, so screens never disagree. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const markets = usePoll<MarketRow[]>('/markets', 4000);
  const marketId = markets.data?.[0]?.market_id ?? null;
  const detail = usePoll<MarketDetail>(
    marketId ? `/markets/${encodeURIComponent(marketId)}` : null,
    2000,
  );
  const fixtures = usePoll<FixtureInfo[]>('/fixtures', 60_000);
  const system = usePoll<SystemDto>('/system', 3000);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const { refresh: refreshMarkets } = markets;
  const { refresh: refreshDetail } = detail;
  const { refresh: refreshSystem } = system;
  const refresh = useCallback(() => {
    refreshMarkets();
    refreshDetail();
    refreshSystem();
  }, [refreshMarkets, refreshDetail, refreshSystem]);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === 'danger' ? 8000 : 5000);
    },
    [dismiss],
  );

  const value = useMemo<Workspace>(
    () => ({
      marketId,
      marketsLoading: markets.loading,
      marketsError: markets.error,
      detail: detail.data,
      detailError: detail.error,
      fixture: fixtures.data?.[0] ?? null,
      system: system.data,
      systemError: system.error,
      refresh,
      toasts,
      notify,
      dismiss,
    }),
    [
      marketId,
      markets.loading,
      markets.error,
      detail.data,
      detail.error,
      fixtures.data,
      system.data,
      system.error,
      refresh,
      toasts,
      notify,
      dismiss,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Workspace {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return v;
}
