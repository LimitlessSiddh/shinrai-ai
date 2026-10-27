'use client';

import { CheckCircle2, FlaskConical, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { PageHeader, Panel, Status } from '@/components/ui';
import { useWorkspace } from '@/lib/workspace';

const templates = [
  ['NBA game analyst', 'Game-winner research with an evidence-completeness hold.'],
  ['Player research', 'Player-level research template; scope is not connected in this build.'],
  ['Blank policy', 'Start with a clearly documented purpose and permissions.'],
] as const;

export default function AgentsPage() {
  const { notify } = useWorkspace();
  const [template, setTemplate] = useState(0);
  const [name, setName] = useState('CourtVision');
  const [purpose, setPurpose] = useState(
    'Evaluate NBA game-winner markets with recorded evidence and hold when information is incomplete.',
  );
  const save = (test: boolean) =>
    notify({
      tone: 'warning',
      title: 'Configuration not persisted',
      detail: test
        ? 'A test was not queued because agent-version configuration has no confirmed API contract.'
        : 'Your local draft remains in this browser only; no policy or version was changed.',
    });
  return (
    <div className="stack settle" style={{ gap: 'var(--space-5)' }}>
      <PageHeader
        title="Agent setup"
        description="A saved agent version should make its job, scope, and policy boundary explicit."
        actions={<Status tone="neutral">Draft only</Status>}
      />
      <div className="callout warning">
        <ShieldCheck size={18} aria-hidden="true" />
        <span>
          <strong>Contract boundary.</strong> This frontend has no confirmed agent configuration
          endpoint. These controls are a local draft and cannot change a model, policy, permissions,
          or server state.
        </span>
      </div>
      <Panel title="Start with a clear job">
        <div className="template-grid">
          {templates.map(([title, detail], index) => (
            <button
              key={title}
              type="button"
              className="template-card"
              aria-pressed={template === index}
              onClick={() => setTemplate(index)}
            >
              <strong>{title}</strong>
              <span>{detail}</span>
            </button>
          ))}
        </div>
        <div className="agent-form">
          <label className="field">
            Agent name
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            Purpose
            <textarea
              className="input textarea"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </label>
          <div className="field">
            <span>Research permissions</span>
            <div className="permission-list">
              <span>
                Game and team statistics <Status tone="success">Available</Status>
              </span>
              <span>
                Recorded evidence <Status tone="success">Available</Status>
              </span>
              <span>
                External provider access <Status tone="neutral">Not configured</Status>
              </span>
              <span>
                Paper order command <Status tone="warning">Policy-gated</Status>
              </span>
            </div>
          </div>
          <label className="field">
            Model
            <select className="input" defaultValue="balanced">
              <option value="balanced">Configured model · balanced</option>
              <option value="concise">Configured model · concise</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
          <button type="button" className="btn" onClick={() => save(false)}>
            Save local draft
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save(true)}>
            Save and test <FlaskConical size={16} aria-hidden="true" />
          </button>
        </div>
      </Panel>
      <Panel title="Version safety">
        <div className="grid cols-3">
          <p>
            <CheckCircle2 size={16} aria-hidden="true" /> Changes must create a new version.
          </p>
          <p>
            <CheckCircle2 size={16} aria-hidden="true" /> Policy remains server-enforced.
          </p>
          <p>
            <CheckCircle2 size={16} aria-hidden="true" /> Recorded runs preserve their own version
            context.
          </p>
        </div>
      </Panel>
    </div>
  );
}
