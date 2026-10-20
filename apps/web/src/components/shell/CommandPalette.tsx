'use client';

import { useRouter } from 'next/navigation';
import { Bot, CornerDownLeft, History, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, ApiFailure } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';
import { NAV } from './nav';

type Command = {
  id: string;
  group: string;
  label: string;
  hint: string;
  icon: typeof Bot;
  run: () => void | Promise<void>;
};

/** ⌘K / Ctrl+K: jump anywhere or launch a fixture scenario without leaving the keyboard. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const { fixture, notify, refresh } = useWorkspace();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQuery('');
      setActive(0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = NAV.map((n) => ({
      id: `nav-${n.href}`,
      group: 'Go to',
      label: n.label,
      hint: n.description,
      icon: n.icon,
      run: () => router.push(n.href),
    }));
    const runs: Command[] = (fixture?.scenarios ?? []).map((s) => ({
      id: `run-${s.scenarioId}`,
      group: 'Run agent scenario',
      label: s.title,
      hint: s.agentId,
      icon: Bot,
      run: async () => {
        try {
          const r = await api<{ runId: string; status: string }>('/agent-runs', {
            method: 'POST',
            body: { fixtureVersion: fixture?.fixtureVersion, scenarioId: s.scenarioId },
          });
          notify({
            tone: 'success',
            title: `Run ${r.data.status}`,
            detail: s.title,
            href: `/dossier/?run=${r.data.runId}`,
            hrefLabel: 'Open dossier',
          });
          refresh();
        } catch (e) {
          notify({
            tone: 'danger',
            title: 'Run failed',
            detail: e instanceof ApiFailure ? `${e.code}: ${e.message}` : String(e),
          });
        }
      },
    }));
    const replay: Command = {
      id: 'replay',
      group: 'Evaluate',
      label: 'Run deterministic replay',
      hint: fixture?.fixtureVersion ?? '',
      icon: History,
      run: () => router.push('/replay/'),
    };
    return [...nav, replay, ...runs];
  }, [fixture, notify, refresh, router]);

  const filtered = commands.filter((c) =>
    `${c.label} ${c.hint} ${c.group}`.toLowerCase().includes(query.toLowerCase().trim()),
  );

  const choose = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    void c.run();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(filtered[active]);
    }
  };

  let lastGroup = '';
  return (
    <dialog
      ref={ref}
      className="palette"
      aria-label="Command palette"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="row" style={{ gap: 0 }}>
        <Search
          size={18}
          style={{ marginLeft: 20, color: 'var(--color-steel)' }}
          aria-hidden="true"
        />
        <input
          className="palette-input"
          placeholder="Search pages and actions…"
          aria-label="Search commands"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={filtered[active] ? `cmd-${filtered[active].id}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          autoFocus
        />
      </div>
      <ul className="palette-list" id="palette-list" role="listbox" aria-label="Commands">
        {filtered.length === 0 ? (
          <li className="palette-group muted">No matching command.</li>
        ) : null}
        {filtered.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          const Icon = c.icon;
          return (
            <li key={c.id} role="presentation">
              {header ? <p className="palette-group label">{header}</p> : null}
              <div
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === active}
                className="palette-item"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
              >
                <Icon size={16} aria-hidden="true" />
                <span style={{ color: 'var(--color-text-primary)' }}>{c.label}</span>
                <span className="faint" style={{ marginLeft: 'auto', fontSize: 'var(--text-sm)' }}>
                  {i === active ? <CornerDownLeft size={14} aria-hidden="true" /> : c.hint}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
