.PHONY: install dev backend frontend build serve test lint sample-demo radars mock-stack e2e live-check

install:            ## install backend (uv) and frontend (npm) dependencies
	cd backend && uv sync
	cd frontend && npm install

backend:            ## API on :8000 with autoreload
	cd backend && uv run uvicorn app.main:app --reload --port 8000

frontend:           ## Vite dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

build:              ## production build of the SPA (served by the backend)
	cd frontend && npm run build

serve: build        ## single process: API + built UI on http://localhost:8000
	cd backend && uv run uvicorn app.main:app --port 8000

test:               ## backend + frontend tests
	cd backend && uv run pytest -q
	cd frontend && npm test

lint:
	cd backend && uv run ruff check app tests scripts && uv run ruff format --check app tests scripts
	cd frontend && npx tsc -b && npx eslint .

sample-demo:        ## download a real CS2 demo for testing uploads
	./scripts/fetch_sample_demo.sh

radars:             ## optional radar images for the tactical map (not committed)
	./scripts/fetch_radars.sh

mock-stack: build   ## API+UI on :8000 against a MOCK FACEIT API on :8901 (test world, not real data)
	./scripts/run_mock_stack.sh

e2e:                ## browser E2E against a running `make mock-stack` (fresh stack per run)
	node scripts/e2e_phase2.cjs http://localhost:8000 http://127.0.0.1:8901

live-check:         ## verify the real FACEIT API with your key: make live-check NICK=yournick [ROOM=url]
	cd backend && uv run python scripts/faceit_live_check.py $(NICK) $(ROOM)
