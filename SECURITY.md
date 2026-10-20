# Security policy

Shinrai AI is a paper-only engineering sandbox. It holds no real money, wallets or exchange credentials.

## Reporting

Please report a vulnerability privately through GitHub's **Report a vulnerability** (Security tab → Advisories). Do not open a public issue. Include the affected commit, steps to reproduce and any correlation IDs. You should get an acknowledgement within 7 days.

## Secrets

- Never commit `.env` files, provider keys or credentials. `.env.example` holds safe placeholders only.
- The `dev-*-local-only` bearer tokens are local development identities. The API refuses them when `SHINRAI_PROFILE=aws`.
- If you find a real secret in the history, report it privately so it can be rotated; do not paste it into an issue.

## Safety boundaries

Agents are untrusted. They reach the system only through five typed tools, and every state change goes through deterministic policy, the matching core and the double-entry ledger. Reports that bypass any of those boundaries are in scope and welcome.
