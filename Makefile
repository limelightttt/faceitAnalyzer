.PHONY: install dev backend frontend build serve test lint sample-demo e2e

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

e2e:                ## browser smoke test against a running `make serve`
	node scripts/e2e_smoke.cjs http://localhost:8000
