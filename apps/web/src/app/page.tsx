'use client';

import { Database, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { ActionPanel, ApprovalQueue } from '@/components/market/ActionPanel';
import { ActivityTimeline, Balances } from '@/components/market/Activity';
import {
  EdgeMeter,
  Fills,
  MarketStrip,
  OrderBook,
  ThesisCard,
} from '@/components/market/MarketPanels';
import { Empty, ErrorState, LoadingPanel } from '@/components/ui';
import { api, ApiFailure } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

function SeedFixture() {
  const { fixture, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const seed = async () => {
    if (!fixture) return;
    setBusy(true);
    try {
      await api(`/fixtures/${fixture.fixtureVersion}/seed`, { method: 'POST' });
      notify({
        tone: 'success',
        title: 'Fixture seeded',
        detail: `${fixture.fixtureVersion}: market opened, accounts funded, liquidity placed`,
      });
      refresh();
    } catch (e) {
      notify({
        tone: 'danger',
        title: e instanceof ApiFailure ? e.code : 'Seed failed',
        detail: e instanceof ApiFailure ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel">
      <Empty icon={Database} title="No paper market yet">
        <p className="muted" style={{ maxWidth: '52ch' }}>
          Seed the versioned NBA fixture to open a market, fund four paper accounts and place
          scripted liquidity. Nothing leaves this machine.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={seed}
          disabled={!fixture || busy}
        >
          {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null}
          {busy ? 'Seeding…' : `Seed fixture ${fixture?.fixtureVersion ?? ''}`}
        </button>
      </Empty>
    </div>
  );
}

export default function Overview() {
  const { marketId, marketsLoading, marketsError, detail, detailError, refresh } = useWorkspace();

  if (marketsError) return <ErrorState error={marketsError} onRetry={refresh} />;
  if (marketsLoading) return <LoadingPanel label="markets" rows={5} />;
  if (!marketId) return <SeedFixture />;
  if (detailError) return <ErrorState error={detailError} onRetry={refresh} />;
  if (!detail) return <LoadingPanel label="market" rows={5} />;

  return (
    <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
      <MarketStrip detail={detail} />
      <ApprovalQueue detail={detail} />
      <div className="grid cols-main">
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <ThesisCard detail={detail} />
          <EdgeMeter detail={detail} />
          <div className="grid cols-2">
            <OrderBook detail={detail} />
            <Fills detail={detail} />
          </div>
        </div>
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <ActionPanel detail={detail} />
          <Balances />
        </div>
      </div>
      <ActivityTimeline />
    </div>
  );
}
