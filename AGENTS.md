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

## 开发与验证环境（强制）

- 后端、Docker 镜像、Docker Compose 服务的依赖安装、测试、构建与运行必须发生在远端 Docker 环境中。
- 前端 `web/` 的构建与开发验证例外：直接在远端宿主机 `web/` 目录执行 `npm run build` 或 `npm run dev -- --host 0.0.0.0`，不使用 Node 容器。执行任何 `npm` 相关命令前，必须先运行 `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"` 加载 `nvm` 环境。
- **禁止在本机安装任何依赖**（如 `apt`、`npm`、`pip`、`uv` 等 install 操作）。
- **禁止在远端宿主机直接安装后端项目依赖**。后端依赖安装、测试、构建应发生在已有的 NovelWriter Docker 容器内（例如 `novelwriter_scngs_1`），不要再创建一次性 Python 容器作为验证环境。
- 本机仅用于代码读取与修改；后端运行、构建、测试、lint、服务启动等操作统一在远端 Docker 环境中执行；前端构建与 dev server 按上一条在远端宿主机执行。
- 编译/验证前置门禁：先阅读本文件与 `CLAUDE.md`，确认后端 Docker 边界与前端宿主机 npm 边界；前端验收前需先 `source` 对应 `nvm` 脚本，再开始执行验证命令。

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

默认服务端口：`0.0.0.0:8000`（宿主机对外监听，按需用防火墙或反向代理收口）。

### 查看服务状态与日志

当前 Docker Compose 服务名为 `scngs`，远端默认容器名为 `novelwriter_scngs_1`。

```bash
docker compose ps
docker compose logs --tail=200 scngs
docker exec -it novelwriter_scngs_1 bash
```

### 停止服务

```bash
docker compose down
```

### 开发模式与源码挂载

- 默认 `docker compose up -d --build` 使用生产镜像运行：镜像内包含后端 Python 环境与已构建的前端 `/app/static`，运行时只启动 `uvicorn`，由 FastAPI 同进程托管 API 与前端静态资源。
- 生产镜像可以挂载后端代码到 `/app/app`，但默认命令没有 `--reload`，代码变更后需要重启容器才生效。
- 生产镜像可以挂载已构建前端产物到 `/app/static`；直接挂载 `web/src` 不会自动构建为浏览器可访问页面。
- 若需要前后端源码热更新，应使用开发模式：后端在 Docker 环境内以 `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` 启动，前端在远端宿主机 `web/` 目录先执行 `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`，再运行 `npm run dev -- --host 0.0.0.0`，并通过 Vite 代理 `/api` 到后端。
- 开发模式中的后端依赖安装、测试、构建仍必须发生在远端 Docker 容器内；前端构建与 dev server 直接在远端宿主机执行，不使用 Node 容器。

## 构建与验证（远端 Docker 环境）

### 后端（Python）

项目约定 Python 版本为 `>=3.13,<3.14`，依赖由 `uv` 管理。常用命令来自 `CLAUDE.md`：

```bash
scripts/setup_python_env.sh
scripts/uv_run.sh pytest tests/
scripts/uv_run.sh ruff check app tests scripts
scripts/uv_run.sh novwr --help
```

执行这些命令时必须放在已有的 NovelWriter Docker 容器中完成，不能回退到远端宿主机，也不要再使用一次性 `python:*` 容器作为后端验证环境。优先复用正在运行的 `novelwriter_scngs_1` 容器。

推荐命令：

```bash
docker exec -i novelwriter_scngs_1 bash -lc 'cd /app && scripts/uv_run.sh ruff check app tests scripts'
docker exec -i novelwriter_scngs_1 bash -lc 'cd /app && scripts/uv_run.sh pytest tests/'
docker exec -i novelwriter_scngs_1 bash -lc 'cd /app && scripts/uv_run.sh novwr --help'
```

若容器内尚未准备好开发依赖，应先基于该容器/镜像补齐项目环境，再在同一容器内继续验证；不得改用宿主机安装依赖，也不得改用一次性 Python 容器兜底。

### 前端（React/Vite）

前端构建验证与开发服务直接在远端宿主机执行，不使用 Node 容器；执行前先加载 `nvm`：

```bash
cd /home/haizh/software/novelwriter/web
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
npm run build
npm run dev -- --host 0.0.0.0
```

如需前端 lint 或单测，也在远端宿主机 `web/` 目录执行对应 npm script；不得在本机执行前端验证命令。

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
- 本项目后端验证不再使用一次性 `docker run --rm` Python 容器；如历史遗留此类容器，验证后应主动确认其已退出并清理。
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
