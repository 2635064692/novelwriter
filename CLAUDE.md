# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NovelWriter (NovWr) is a long-form novel writing engine with world-model-driven generation. It provides an AI Copilot for novel authors to maintain world consistency across long-form fiction. Full-stack: FastAPI backend + React 19 frontend.

## Build & Run Commands

### Backend

```bash
# Setup (first time)
scripts/setup_python_env.sh
cp .env.example .env  # then edit .env with your OPENAI_API_KEY

# Run dev server
scripts/uv_run.sh uvicorn app.main:app --reload --port 8000

# Run all tests
scripts/uv_run.sh pytest tests/

# Run a single test file
scripts/uv_run.sh pytest tests/test_ai_client.py

# Run a single test by name
scripts/uv_run.sh pytest tests/test_ai_client.py::test_function_name -v

# Lint
scripts/uv_run.sh ruff check app tests scripts

# CLI tool (selfhost lifecycle management)
scripts/uv_run.sh novwr --help
```

### Frontend

```bash
cd web
npm install
npm run dev           # Dev server at http://localhost:5173
npm run build         # Production build
npm run lint          # ESLint
npm run test:run      # Vitest unit tests
npm run test:e2e      # Playwright E2E
```

### Docker

```bash
docker compose up -d  # All services, serves at http://localhost:8000
```

## Architecture

### Backend (`app/`)

**Entry point**: `app/main.py` — FastAPI app with lifespan, CORS, rate limiting, SPA static file serving.

**API routes** (`app/api/`):
- `auth.py` — JWT auth, user management, GitHub OAuth
- `novels.py` — Novel CRUD, chapter management, continuation generation (largest module)
- `lorebook.py` — Lorebook entries with keyword-triggered context injection
- `world.py` — World model CRUD and generation from text
- `copilot.py` — Async AI research assistant with tool loop
- `llm.py` — LLM API configuration and health checks
- `dashboard.py`, `usage.py` — Statistics and token metering

**Core logic** (`app/core/`):
- `generator.py` — Main text continuation engine
- `context_assembly.py` — Builds context from recent chapters + lorebook
- `ai_client.py` — OpenAI-compatible API wrapper (streaming + non-streaming)
- `lore_manager.py` — Aho-Corasick automaton for keyword matching, priority-based lore injection
- `continuation_text.py` — Text generation with post-processing
- `bootstrap.py` — Extracts world info from raw text via LLM
- `copilot/` — Tool-augmented AI: `tool_loop.py` (orchestrator), `research_tools.py`, `prompting.py`, `suggestions.py`
- `indexing/` — Window index (sliding window of recent chapters for fast context lookup)
- `world/` — World model application layer: CRUD, generation, worldpack import
- `text/` — Language-specific text processing: `zh.py` (Chinese), `en.py`, `ja.py`, `ko.py`

**Models** (`app/models.py`): SQLAlchemy models — `Novel`, `Chapter`, `Outline`, `Continuation`, `LoreEntry`/`LoreKey`, `WorldEntity`/`WorldEntityAttribute`/`WorldRelationship`/`WorldSystem`, `CopilotSession`/`CopilotRun`, `User`, `TokenUsage`, etc.

**Config** (`app/config.py`): Pydantic Settings with `.env` support. Two deployment modes:
- `selfhost` — Single-user, no auth required, `.env` overrides OS env vars
- `hosted` — Multi-tenant, JWT required, OS env overrides `.env` (security)

**Database** (`app/database.py`): SQLite (dev) or PostgreSQL (prod). WAL mode for SQLite. Migrations in `alembic/`.

### Frontend (`web/src/`)

React 19 + TypeScript + Tailwind CSS + React Query. Key areas:
- `pages/` — Route components (Studio, Atlas, Library, etc.)
- `components/` — Reusable UI (uses Radix UI + @xyflow/react for world graph visualization)
- `hooks/` — Custom React hooks
- `services/` — API client layer

### Key Data Flow

1. **Continuation generation**: User prompt → `context_assembly.py` (recent chapters + lorebook) → `generator.py` → `ai_client.py` → LLM → `continuation_text.py` (post-processing)
2. **Lorebook injection**: Chapter text → `lore_manager.py` (Aho-Corasick keyword match) → matched entries sorted by priority → injected into context
3. **Copilot research**: User question → `copilot/tool_loop.py` → tool calls (read chapters, search lorebook) → synthesized answer
4. **World bootstrap**: Raw text → chunking → LLM extraction → `WorldEntity`/`WorldRelationship` records

## Key Conventions

- **Python**: 3.13, managed by `uv` (version pinned in `pyproject.toml`). All backend commands go through `scripts/uv_run.sh`.
- **Linting**: `ruff` with config in `ruff.toml`
- **Tests**: `pytest` with autouse fixtures in `conftest.py` that force selfhost mode and bypass auth. Test markers: `contract` (deferred), `e2e_llm` (real provider). Contract tests excluded by default (`-m 'not contract'`).
- **Language support**: Multi-language text processing (zh/en/ja/ko) via `app/core/text/` and `app/language.py`. Language code normalization throughout.
- **Novel.language mutation**: If `Novel.language` is changed, must call `invalidate_novel_language_caches()` to clear lore automaton cache and advance window index revision.
- **LoreEntry priority**: Lower number = higher priority (1 = protagonist).
- **World entities**: `WorldEntity` has `status` (draft/approved), `origin` (manual/bootstrap/worldpack/worldgen), `visibility` (active/hidden).
- **Internal project codename**: "SCNGS" appears in env vars and log messages.
