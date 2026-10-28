# FACEIT Intelligence — notes for Claude Code

Personal CS2/FACEIT analytics: Match Scout (pre-match briefing from a room link), player analytics, stack map pool,
demo analysis, coaching, prediction tracking. The owner talks Russian; answer in Russian.

## Layout
- `backend/` — FastAPI + SQLAlchemy (SQLite), `uv`. Entry `app/main.py`; FACEIT client `app/providers/faceit_api.py`;
  scout `app/scout/` (service, stack, chemistry, risk, briefing); background jobs `app/tracking.py`.
- `frontend/` — React 18 + TS + Vite + Tailwind v4, Feature-Sliced Design (`app → pages → widgets → features →
  entities → shared`). Rules that live in one place — reuse them, do not re-implement:
  errors `shared/api/errors.ts`, connectivity `shared/api/network.ts`, toasts `shared/lib/notify.ts`,
  query/mutation policy `app/providers/query-client.ts` (mutation `meta`: `success`, `errorContext`, `inlineError`),
  loading/error/offline `shared/ui/async-view.tsx`, motion tokens `app/styles/index.css` (`--dur-*`, `--ease-*`).
- `windows/*.ps1` + root `*.cmd` — Windows launcher (ASCII only: Windows PowerShell 5.1).
- `scripts/` — browser E2E (Playwright) against a mock FACEIT API (`backend/tests/support/mock_faceit.py`).

## Commands
- Windows: `setup.cmd` (deps + build + `backend\.env`), `start.cmd`, `stop.cmd`, `status.cmd`,
  `share.cmd` / `unshare.cmd` (Tailscale, see below). Data: `%LOCALAPPDATA%\FaceitIntelligence\data`, logs next to it.
- macOS/Linux: `make install`, `make serve` (http://localhost:8000).
- Checks: `make test`, `make lint`; browser E2E `make e2e-beta`, `make e2e-ux` (self-contained, mock FACEIT).

## Sharing with friends (Tailscale) — what to do when the owner asks
1. `tailscale status` must show this PC connected. If Tailscale is missing or signed out, tell the owner to install
   it / sign in (tailscale.com/download) — do not try to sign in for them.
2. Ask for the friends' SteamID64 (17 digits, `7656119…`; from the Steam profile URL or steamid.io) or FACEIT
   nicknames, plus the owner's own — with an allowlist only listed accounts can sign in.
3. Run `share.cmd -Allow <id1>,<id2>,...` from the repo root. It runs `tailscale serve --bg <port>` (tailnet-only
   HTTPS, never Funnel), writes `APP_BASE_URL=https://<pc>.<tailnet>.ts.net` and `BETA_ALLOWLIST` into
   `backend\.env`, restarts the app and opens the address. If Serve/HTTPS is not enabled for the tailnet,
   Tailscale prints a link to enable it — the owner clicks it once.
4. Verify: `status.cmd`, `tailscale serve status`, and that `https://<pc>.<tailnet>.ts.net/api/health` answers.
   The owner signs in with Steam at that address first.
5. Sharing the machine with a friend is done by the owner in the Tailscale admin (Machines → this PC → Share…);
   the friend installs Tailscale, accepts, opens the same address.
6. Undo: `unshare.cmd` (Serve off, `APP_BASE_URL` back to localhost; allowlist kept).
Never print or commit `backend\.env` contents, keys or session tokens; never enable Funnel or change router/firewall.

## Conventions
- Never invent data: only FACEIT Data API and uploaded demos; mark facts / estimates / hypotheses.
- No "dodge" advice; risk signals are statistical, never accusations; toxicity is never inferred.
- Each fix comes with a regression test; keep FSD layer boundaries; no dead code.
