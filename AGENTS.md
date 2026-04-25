# AGENTS.md

本文件用于为代码智能体（如 Claude Code / Codex CLI / Cursor Agent）提供 **NovelWriter 项目级约束与环境说明**，避免在错误的机器、宿主机或容器环境中执行操作，并确保 Git 工作流一致。

## 项目概述

- 本仓库是 **NovelWriter (NovWr)**：面向长篇小说创作的世界模型驱动写作引擎。
- 技术栈：
  - 后端：Python 3.13 + FastAPI + SQLAlchemy + Alembic + uv
  - 前端：React 19 + TypeScript + Vite + Tailwind CSS + React Query
  - 部署/开发环境：Docker / Docker Compose
- 主要目录：
  - `app/`：FastAPI 后端核心代码
  - `app/api/`：HTTP API 路由
  - `app/core/`：生成、上下文组装、Copilot、世界模型等核心逻辑
  - `app/models.py`：SQLAlchemy 数据模型
  - `alembic/`：数据库迁移
  - `web/`：React 前端
  - `tests/`：后端测试
  - `scripts/`：开发维护脚本

## 远端开发环境（SSH）

- 远端 SSH 开发主机通过 SSH MCP 连接，connection name 固定使用：`default`。
- 远端项目路径：`/home/haizh/software/novelwriter`。
- **所有远端命令必须通过 SSH MCP 工具 `mcp__mcp-router__execute-command` 执行**。
- SSH MCP 执行建议：一次批次不要超过 **5 条命令**，按步骤分批执行，便于定位失败点并避免超长会话。

## Docker 开发环境（强制）

- 本项目在远端使用 **Docker / Docker Compose** 作为开发、构建与验证环境。
- **禁止在本机安装任何依赖**（如 `apt`、`npm`、`pip`、`uv` 等 install 操作）。
- **禁止在远端宿主机直接安装项目依赖**。依赖安装、测试、构建应发生在 Docker 容器或一次性 Docker 容器内。
- 本机仅用于代码读取与修改；涉及运行、构建、测试、lint、服务启动等操作，统一在远端 Docker 环境中执行。
- 编译/验证前置门禁：先阅读本文件与 `CLAUDE.md`，确认 Docker/远端路径/命令边界后，再开始执行验证命令。

## 推荐工作流

1. 本机修改代码：`/home/opensource/python/novelwriter`。
2. 本机完成 Git 提交与推送。
3. 远端宿主机仅执行 `git pull` 同步代码：
   ```bash
   cd /home/haizh/software/novelwriter
   git pull
   ```
4. 在远端 Docker 环境中执行构建、测试、lint 或启动验证。
5. 验证结束后清理临时容器/测试进程，保持远端环境干净。

## Git 约束（强制）

远端宿主机 `/home/haizh/software/novelwriter` 通过 Git 管理，但远端 Git 操作有严格限制：

- **远端宿主机仅允许执行 `git pull`**。
- 严禁在远端执行 `git push`、`git commit`、`git reset --hard`、`git checkout -- <file>` 等写入性或破坏性 Git 操作。
- 严禁在 Docker 容器内部执行任何 Git 写入操作。
- 所有代码变更、提交、推送必须在本地完成后，再由远端宿主机 `git pull` 同步。

## 常用 Docker 命令（远端执行）

所有命令均在远端宿主机项目根目录执行：

```bash
cd /home/haizh/software/novelwriter
```

### 启动/重建服务

```bash
docker compose up -d --build
```

默认服务端口：`127.0.0.1:8000`。

### 查看服务状态与日志

```bash
docker compose ps
docker compose logs --tail=200 scngs
```

### 停止服务

```bash
docker compose down
```

## 构建与验证（远端 Docker 环境）

### 后端（Python）

项目约定 Python 版本为 `>=3.13,<3.14`，依赖由 `uv` 管理。常用命令来自 `CLAUDE.md`：

```bash
scripts/setup_python_env.sh
scripts/uv_run.sh pytest tests/
scripts/uv_run.sh ruff check app tests scripts
scripts/uv_run.sh novwr --help
```

执行这些命令时必须放在 Docker 环境中。若现有 `docker-compose.yml` 的运行镜像不包含开发依赖（例如 `pytest`、`ruff`），应使用远端的一次性开发容器或专用 dev compose 服务执行，不能回退到远端宿主机直接安装依赖。

示例（一次性开发容器，仅在远端 Docker 内安装依赖）：

```bash
docker run --rm \
  -v "$PWD:/workspace" \
  -w /workspace \
  python:3.13-slim \
  bash -lc 'apt-get update && apt-get install -y --no-install-recommends curl ca-certificates build-essential && scripts/setup_python_env.sh && scripts/uv_run.sh ruff check app tests scripts && scripts/uv_run.sh pytest tests/'
```

> 注意：上述 `apt-get` 发生在一次性容器内，不得在远端宿主机或本机执行。

### 前端（React/Vite）

前端命令必须在 Docker 环境中执行，常用命令：

```bash
cd web
npm ci
npm run lint
npm run test:run
npm run build
```

示例（一次性 Node 容器）：

```bash
docker run --rm \
  -v "$PWD:/workspace" \
  -w /workspace/web \
  node:20-slim \
  bash -lc 'npm ci && npm run lint && npm run test:run && npm run build'
```

### Docker 镜像构建验证

```bash
docker compose build
```

或完整启动验证：

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=200 scngs
```

## 测试进程与容器清理（强制）

- 执行调测指令后，必须清理临时容器和测试进程，确保远端环境还原到初始状态。
- 使用 `docker run --rm` 创建的一次性容器会自动删除。
- 使用 `docker compose up -d` 启动的服务，验证结束后如无继续保留需求，应执行：
  ```bash
  docker compose down
  ```
- 若启动了临时后台进程，需使用 `docker compose ps`、`docker ps`、`ps aux` 等确认无残留。

## 代码约定与注意事项

- 后端所有常规命令通过 `scripts/uv_run.sh` 调用，避免绕过项目固定的 uv 环境。
- Ruff 配置位于 `ruff.toml`。
- Pytest 默认排除 `contract` 标记测试（见 `pyproject.toml` 的 `addopts`）。
- `e2e_llm` 标记测试会访问真实 LLM Provider，除非用户明确要求并提供环境配置，否则不要默认执行。
- `Novel.language` 发生变更时，必须调用 `invalidate_novel_language_caches()`，清理 lore automaton cache 并推进 window index revision。
- `LoreEntry` 的 priority 数字越小优先级越高（`1` 最高）。
- 项目内部历史代号 `SCNGS` 仍可能出现在环境变量、日志和 Compose 服务名中。
