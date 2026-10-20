'use client';

import { useState } from 'react';
import { ActivityFeed, Portfolios } from '@/components/Ledger';
import { MarketHero } from '@/components/MarketHero';
import { OperatorConsole } from '@/components/OperatorConsole';
import { Announce, Empty, ErrorState, Loading, Status } from '@/components/ui';
import { api, ApiFailure, time, usePoll } from '@/lib/api';
import type { ActivityRow, FixtureInfo, MarketDetail, MarketRow } from '@/lib/types';

function SeedFixture({ fixture, onDone }: { fixture: FixtureInfo | null; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | ApiFailure>('idle');
  const seed = async () => {
    if (!fixture) return;
    setState('busy');
    try {
      await api(`/fixtures/${fixture.fixtureVersion}/seed`, { method: 'POST' });
      setState('idle');
      onDone();
    } catch (e) {
      setState(e instanceof ApiFailure ? e : new ApiFailure(0, 'UNKNOWN', String(e), null));
    }
  };
  return (
    <Empty title="No paper market yet">
      <p className="secondary">
        Seed the versioned NBA fixture to open a market, fund paper accounts and place scripted
        liquidity.
      </p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={seed}
        disabled={!fixture || state === 'busy'}
      >
        {state === 'busy' ? 'Seeding…' : `Seed fixture ${fixture?.fixtureVersion ?? ''}`}
      </button>
      <Announce>
        {state instanceof ApiFailure ? (
          <Status tone="danger">{`${state.code}: ${state.message}`}</Status>
        ) : null}
      </Announce>
    </Empty>
  );
}

function LatestStrip() {
  const a = usePoll<ActivityRow[]>('/activity?limit=1', 2000);
  const r = a.data?.[0];
  if (!r) return null;
  return (
    <section
      className="card section row"
      aria-label="Latest event"
      style={{ justifyContent: 'space-between' }}
    >
      <span className="meta">{time(r.occurred_at)}</span>
      <span style={{ flex: '1 1 320px' }}>{r.summary}</span>
      <span className="meta" style={{ textTransform: 'none' }}>
        trace {r.correlation_id}
      </span>
    </section>
  );
}

export default function MarketPage() {
  const markets = usePoll<MarketRow[]>('/markets', 3000);
  const fixtures = usePoll<FixtureInfo[]>('/fixtures', 60_000);
  const marketId = markets.data?.[0]?.market_id ?? null;
  const detail = usePoll<MarketDetail>(
    marketId ? `/markets/${encodeURIComponent(marketId)}` : null,
    2000,
  );
  const fixture = fixtures.data?.[0] ?? null;

  if (markets.error) return <ErrorState error={markets.error} onRetry={markets.refresh} />;
  if (markets.loading) return <Loading label="markets" />;
  if (!marketId) return <SeedFixture fixture={fixture} onDone={markets.refresh} />;
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.refresh} />;
  if (!detail.data) return <Loading label="market" />;

  return (
    <>
      <MarketHero detail={detail.data} />
      <LatestStrip />
      <OperatorConsole detail={detail.data} fixture={fixture} onChange={detail.refresh} />
      <section className="grid grid-2 section">
        <Portfolios />
        <ActivityFeed />
      </section>
    </>
  );
}
