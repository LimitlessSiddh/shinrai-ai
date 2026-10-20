-- Shinrai V1 core schema. PostgreSQL facts are authoritative; projections are rebuildable.
-- Every table is tenant-scoped. Constraints here duplicate application checks on purpose.

CREATE FUNCTION shinrai_forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

-- Reproducibility --------------------------------------------------------------------------
CREATE TABLE fixture_versions (
  tenant_id       text NOT NULL,
  fixture_version text NOT NULL,
  manifest        jsonb NOT NULL,
  loaded_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fixture_version)
);

-- Market definition ------------------------------------------------------------------------
CREATE TABLE markets (
  tenant_id       text NOT NULL,
  market_id       text NOT NULL,
  fixture_version text NOT NULL,
  definition      jsonb NOT NULL,
  status          text NOT NULL CHECK (status IN ('open', 'resolved')),
  winning_outcome text CHECK (winning_outcome IN ('YES', 'NO')),
  next_sequence   bigint NOT NULL CHECK (next_sequence > 0),
  opened_at       timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, market_id),
  CHECK ((status = 'resolved') = (winning_outcome IS NOT NULL))
);

CREATE TABLE outcomes (
  tenant_id text NOT NULL,
  market_id text NOT NULL,
  outcome   text NOT NULL CHECK (outcome IN ('YES', 'NO')),
  label     text NOT NULL,
  PRIMARY KEY (tenant_id, market_id, outcome),
  FOREIGN KEY (tenant_id, market_id) REFERENCES markets
);

CREATE TABLE market_rules (
  tenant_id text NOT NULL,
  market_id text NOT NULL,
  rule_no   int NOT NULL CHECK (rule_no > 0),
  body      text NOT NULL,
  PRIMARY KEY (tenant_id, market_id, rule_no),
  FOREIGN KEY (tenant_id, market_id) REFERENCES markets
);

-- One resolution per market, ever. This is the database half of exactly-once settlement.
CREATE TABLE market_resolutions (
  tenant_id       text NOT NULL,
  market_id       text NOT NULL,
  winning_outcome text NOT NULL CHECK (winning_outcome IN ('YES', 'NO')),
  source          text NOT NULL,
  event_id        text NOT NULL,
  resolved_at     timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, market_id),
  FOREIGN KEY (tenant_id, market_id) REFERENCES markets
);
CREATE TRIGGER market_resolutions_append_only BEFORE UPDATE OR DELETE ON market_resolutions
  FOR EACH ROW EXECUTE FUNCTION shinrai_forbid_mutation();

-- Trading ----------------------------------------------------------------------------------
CREATE TABLE orders (
  tenant_id       text NOT NULL,
  order_id        text NOT NULL,
  market_id       text NOT NULL,
  owner_id        text NOT NULL,
  outcome         text NOT NULL CHECK (outcome IN ('YES', 'NO')),
  price           int NOT NULL CHECK (price BETWEEN 1 AND 99),
  quantity        int NOT NULL CHECK (quantity > 0),
  filled_quantity int NOT NULL CHECK (filled_quantity BETWEEN 0 AND quantity),
  status          text NOT NULL CHECK (status IN ('open', 'filled', 'cancelled')),
  sequence        bigint NOT NULL,
  correlation_id  text NOT NULL,
  created_at      timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, order_id),
  UNIQUE (tenant_id, market_id, sequence),
  FOREIGN KEY (tenant_id, market_id) REFERENCES markets,
  CHECK (status <> 'filled' OR filled_quantity = quantity)
);
CREATE INDEX orders_open_book ON orders (tenant_id, market_id, outcome, price DESC, sequence)
  WHERE status = 'open';
CREATE INDEX orders_by_owner ON orders (tenant_id, owner_id);

CREATE TABLE fills (
  tenant_id      text NOT NULL,
  fill_id        text NOT NULL,
  market_id      text NOT NULL,
  taker_order_id text NOT NULL,
  maker_order_id text NOT NULL,
  yes_order_id   text NOT NULL,
  no_order_id    text NOT NULL,
  yes_owner_id   text NOT NULL,
  no_owner_id    text NOT NULL,
  quantity       int NOT NULL CHECK (quantity > 0),
  yes_price      int NOT NULL CHECK (yes_price BETWEEN 1 AND 99),
  sequence       bigint NOT NULL,
  event_id       text NOT NULL,
  PRIMARY KEY (tenant_id, fill_id),
  UNIQUE (tenant_id, market_id, sequence),
  FOREIGN KEY (tenant_id, taker_order_id) REFERENCES orders,
  FOREIGN KEY (tenant_id, maker_order_id) REFERENCES orders
);
CREATE TRIGGER fills_append_only BEFORE UPDATE OR DELETE ON fills
  FOR EACH ROW EXECUTE FUNCTION shinrai_forbid_mutation();

CREATE TABLE positions (
  tenant_id text NOT NULL,
  owner_id  text NOT NULL,
  market_id text NOT NULL,
  outcome   text NOT NULL CHECK (outcome IN ('YES', 'NO')),
  quantity  int NOT NULL CHECK (quantity >= 0),
  cost      bigint NOT NULL CHECK (cost >= 0),
  PRIMARY KEY (tenant_id, owner_id, market_id, outcome),
  FOREIGN KEY (tenant_id, market_id) REFERENCES markets
);

CREATE TABLE idempotency_keys (
  tenant_id           text NOT NULL,
  scope               text NOT NULL,
  request_fingerprint text NOT NULL,
  result              jsonb NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- scope = tenant|actor|command type|key, so it is globally unique on its own
  PRIMARY KEY (scope)
);
CREATE TRIGGER idempotency_keys_append_only BEFORE UPDATE OR DELETE ON idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION shinrai_forbid_mutation();

-- Accounting -------------------------------------------------------------------------------
-- `balance` is maintained only by the ledger_entries trigger, never written by the application.
CREATE TABLE ledger_accounts (
  tenant_id  text NOT NULL,
  account_id text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('available', 'reserved', 'escrow', 'issuance')),
  balance    bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, account_id),
  CONSTRAINT ledger_accounts_non_negative CHECK (kind = 'issuance' OR balance >= 0)
);

CREATE TABLE ledger_transactions (
  tenant_id      text NOT NULL,
  tx_id          text NOT NULL,
  reason         text NOT NULL CHECK (reason IN ('grant', 'reserve', 'fill', 'release', 'settle')),
  order_id       text,
  event_id       text NOT NULL,
  correlation_id text NOT NULL,
  created_at     timestamptz NOT NULL,
  -- commit order, for equity curves and replay comparison
  seq            bigserial NOT NULL UNIQUE,
  PRIMARY KEY (tenant_id, tx_id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders
);

CREATE TABLE ledger_entries (
  tenant_id  text NOT NULL,
  tx_id      text NOT NULL,
  entry_no   int NOT NULL CHECK (entry_no > 0),
  account_id text NOT NULL,
  direction  text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount     bigint NOT NULL CHECK (amount > 0),
  PRIMARY KEY (tenant_id, tx_id, entry_no),
  FOREIGN KEY (tenant_id, tx_id) REFERENCES ledger_transactions,
  FOREIGN KEY (tenant_id, account_id) REFERENCES ledger_accounts
);

CREATE FUNCTION shinrai_apply_ledger_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ledger_accounts
     SET balance = balance + CASE NEW.direction WHEN 'credit' THEN NEW.amount ELSE -NEW.amount END
   WHERE tenant_id = NEW.tenant_id AND account_id = NEW.account_id;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_entries_apply AFTER INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION shinrai_apply_ledger_entry();

-- Checked at COMMIT: every transaction's debits equal its credits.
CREATE FUNCTION shinrai_assert_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE net bigint; n int;
BEGIN
  SELECT coalesce(sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END), 0), count(*)
    INTO net, n
    FROM ledger_entries WHERE tenant_id = NEW.tenant_id AND tx_id = NEW.tx_id;
  IF net <> 0 OR n < 2 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced (net %, entries %)', NEW.tx_id, net, n
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION shinrai_assert_balanced();

CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION shinrai_forbid_mutation();
CREATE TRIGGER ledger_transactions_append_only BEFORE UPDATE OR DELETE ON ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION shinrai_forbid_mutation();
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION shinrai_forbid_mutation();
CREATE TRIGGER ledger_transactions_no_truncate BEFORE TRUNCATE ON ledger_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION shinrai_forbid_mutation();

CREATE TABLE credit_reservations (
  tenant_id        text NOT NULL,
  order_id         text NOT NULL,
  owner_id         text NOT NULL,
  initial_amount   bigint NOT NULL CHECK (initial_amount > 0),
  remaining_amount bigint NOT NULL CHECK (remaining_amount BETWEEN 0 AND initial_amount),
  PRIMARY KEY (tenant_id, order_id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders
);

-- Agent controls ---------------------------------------------------------------------------
CREATE TABLE agent_policies (
  tenant_id  text NOT NULL,
  agent_id   text NOT NULL,
  policy     jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, agent_id)
);

CREATE TABLE agent_runs (
  tenant_id      text NOT NULL,
  run_id         text NOT NULL,
  agent_id       text NOT NULL,
  market_id      text NOT NULL,
  scenario       text NOT NULL,
  model          text NOT NULL,
  status         text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  correlation_id text NOT NULL,
  started_at     timestamptz NOT NULL,
  finished_at    timestamptz,
  conclusion     jsonb,
  PRIMARY KEY (tenant_id, run_id),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES agent_policies
);
CREATE INDEX agent_runs_by_correlation ON agent_runs (tenant_id, correlation_id);

CREATE TABLE agent_tool_calls (
  tenant_id       text NOT NULL,
  tool_call_id    text NOT NULL,
  run_id          text NOT NULL,
  seq             int NOT NULL,
  tool            text NOT NULL,
  input           jsonb,
  output          jsonb,
  ok              boolean NOT NULL,
  policy_decision text NOT NULL
    CHECK (policy_decision IN ('approved', 'blocked', 'approval_required', 'not_applicable')),
  reasons         jsonb NOT NULL,
  command_correlation_id text,
  created_at      timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, tool_call_id),
  UNIQUE (tenant_id, run_id, seq),
  FOREIGN KEY (tenant_id, run_id) REFERENCES agent_runs
);
CREATE TRIGGER agent_tool_calls_append_only BEFORE UPDATE OR DELETE ON agent_tool_calls
  FOR EACH ROW EXECUTE FUNCTION shinrai_forbid_mutation();

CREATE TABLE approval_requests (
  tenant_id    text NOT NULL,
  approval_id  text NOT NULL,
  run_id       text NOT NULL,
  tool_call_id text NOT NULL,
  request      jsonb NOT NULL,
  status       text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by   text,
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, approval_id),
  FOREIGN KEY (tenant_id, tool_call_id) REFERENCES agent_tool_calls
);

-- Eventing and audit -----------------------------------------------------------------------
CREATE TABLE outbox_events (
  id             bigserial PRIMARY KEY,
  tenant_id      text NOT NULL,
  event_id       text NOT NULL UNIQUE,
  type           text NOT NULL,
  aggregate_id   text NOT NULL,
  correlation_id text NOT NULL,
  causation_id   text NOT NULL,
  event          jsonb NOT NULL,
  occurred_at    timestamptz NOT NULL,
  published_at   timestamptz
);
CREATE INDEX outbox_unpublished ON outbox_events (id) WHERE published_at IS NULL;
CREATE INDEX outbox_by_correlation ON outbox_events (tenant_id, correlation_id);

-- Events are immutable; only the relay may stamp published_at, once.
CREATE FUNCTION shinrai_outbox_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.published_at IS NOT NULL
     OR (to_jsonb(NEW) - 'published_at') IS DISTINCT FROM (to_jsonb(OLD) - 'published_at') THEN
    RAISE EXCEPTION 'outbox_events is append-only (only published_at may be set once)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbox_events_guard BEFORE UPDATE OR DELETE ON outbox_events
  FOR EACH ROW EXECUTE FUNCTION shinrai_outbox_guard();

CREATE TABLE event_deliveries (
  consumer     text NOT NULL,
  event_id     text NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, event_id)
);

CREATE TABLE dead_letters (
  id         bigserial PRIMARY KEY,
  consumer   text NOT NULL,
  event_id   text NOT NULL,
  attempts   int NOT NULL,
  error      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (consumer, event_id)
);

CREATE TABLE audit_log (
  id                bigserial PRIMARY KEY,
  tenant_id         text NOT NULL,
  actor             jsonb NOT NULL,
  command_type      text NOT NULL,
  idempotency_scope text NOT NULL,
  correlation_id    text NOT NULL,
  causation_id      text NOT NULL,
  outcome           text NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  policy            jsonb NOT NULL,
  rejection_code    text,
  event_id          text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_by_correlation ON audit_log (tenant_id, correlation_id);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION shinrai_forbid_mutation();

-- Dashboard projections (rebuildable from outbox_events + source facts) --------------------
CREATE TABLE market_snapshots (
  tenant_id      text NOT NULL,
  market_id      text NOT NULL,
  view           jsonb NOT NULL,
  applied_events int NOT NULL DEFAULT 0,
  last_event_id  text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, market_id)
);

CREATE TABLE portfolio_snapshots (
  tenant_id      text NOT NULL,
  owner_id       text NOT NULL,
  view           jsonb NOT NULL,
  applied_events int NOT NULL DEFAULT 0,
  last_event_id  text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_id)
);

CREATE TABLE activity_feed (
  tenant_id      text NOT NULL,
  event_id       text NOT NULL PRIMARY KEY,
  outbox_id      bigint NOT NULL,
  type           text NOT NULL,
  correlation_id text NOT NULL,
  actor_id       text NOT NULL,
  status         text NOT NULL CHECK (status IN ('accepted', 'rejected', 'blocked', 'info')),
  summary        text NOT NULL,
  occurred_at    timestamptz NOT NULL
);
CREATE INDEX activity_by_tenant ON activity_feed (tenant_id, outbox_id DESC);

-- Evidence and evaluation ------------------------------------------------------------------
CREATE TABLE evidence_items (
  tenant_id       text NOT NULL,
  evidence_id     text NOT NULL,
  market_id       text NOT NULL,
  fixture_version text NOT NULL,
  item            jsonb NOT NULL,
  PRIMARY KEY (tenant_id, evidence_id)
);

CREATE TABLE evaluation_runs (
  evaluation_id   text PRIMARY KEY,
  tenant_id       text NOT NULL,
  fixture_version text NOT NULL,
  replay_tenant   text NOT NULL,
  report          jsonb NOT NULL,
  report_hash     text NOT NULL,
  correlation_id  text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evaluation_results (
  evaluation_id text NOT NULL REFERENCES evaluation_runs,
  metric        text NOT NULL,
  value         double precision,
  PRIMARY KEY (evaluation_id, metric)
);
