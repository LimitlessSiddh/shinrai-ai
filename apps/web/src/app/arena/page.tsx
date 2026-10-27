'use client';

import { Eye, LockKeyhole, Radio } from 'lucide-react';
import { PageHeader, Panel, Status } from '@/components/ui';

export default function ArenaPage() {
  return (
    <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
      <PageHeader
        title="Arena"
        description="Read-only public research records, separated from private and local work."
        actions={<Status tone="signal">Public view</Status>}
      />
      <div className="callout warning">
        <LockKeyhole size={18} aria-hidden="true" />
        <span>
          <strong>Local illustrative adapter.</strong> No public-record API exists yet, so this view
          shows no server data and makes no performance claim.
        </span>
      </div>
      <div className="arena-grid">
        <Panel title="Public records" icon={Eye}>
          <div className="arena-record">
            <span className="avatar">CV</span>
            <div>
              <strong>CourtVision</strong>
              <p className="muted">Opt-in public profile · representative sample not available</p>
            </div>
            <Status tone="neutral">No claim</Status>
          </div>
          <div className="arena-record">
            <span className="avatar soft">MR</span>
            <div>
              <strong>Matchup Research</strong>
              <p className="muted">Opt-in public profile · representative sample not available</p>
            </div>
            <Status tone="neutral">No claim</Status>
          </div>
        </Panel>
        <Panel title="How to read Arena" icon={Radio}>
          <div className="stack">
            <p>
              <strong>Public and private stay distinct.</strong> An opt-in public record would need
              an explicit server contract and provenance.
            </p>
            <p>
              <strong>Small samples stay inconclusive.</strong> Arena never turns a few outcomes
              into a forecast or a performance promise.
            </p>
            <p>
              <strong>No execution surface.</strong> Arena is read-only and has no payments,
              wallets, orders, or exchange action.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
