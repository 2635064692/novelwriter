# AGENTS.md

本文件用于为代码智能体（如 Claude Code / Codex CLI / Cursor Agent）提供 **NovelWriter 项目级约束与环境说明**，确保构建、验证与部署流程一致。

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

## 本地开发环境

- 项目路径：`/home/opensource/python/novelwriter`（WSL2）。
- 配置文件：项目根目录 `.env`。
- 前端构建：`web/` 目录下直接执行 `npm run build`。
- 后端构建：项目根目录执行 `docker compose up -d --build` 重建容器。
- **禁止在本机安装后端依赖**（`pip install`、`uv sync` 等）；后端环境由 Docker 镜像内管理。

## 推荐工作流

1. 本机修改代码：`/home/opensource/python/novelwriter`。
2. 前端构建验证：`cd web && npm run build`。
3. 后端构建验证：`docker compose up -d --build`。
4. 本机完成 Git 提交。

## 常用 Docker 命令

所有命令均在项目根目录 `/home/opensource/python/novelwriter` 执行。

### 启动/重建服务

```bash
docker compose up -d --build
```

默认服务端口：`0.0.0.0:8000`。

### 查看服务状态与日志

```bash
docker compose ps
docker compose logs --tail=200 scngs
```

### 停止服务

```bash
docker compose down
```

## 构建与验证

### 后端（Docker）

后端测试、lint 等在 Docker 容器内执行：

```bash
docker exec -i novelwriter-scngs-1 bash -lc 'cd /app && scripts/uv_run.sh ruff check app tests scripts'
docker exec -i novelwriter-scngs-1 bash -lc 'cd /app && scripts/uv_run.sh pytest tests/'
```

### 前端（React/Vite）

前端构建直接在 WSL 本机 `web/` 目录执行：

```bash
cd /home/opensource/python/novelwriter/web
npm run build
```

## 代码约定与注意事项

- 后端所有常规命令通过 `scripts/uv_run.sh` 调用，避免绕过项目固定的 uv 环境。
- Ruff 配置位于 `ruff.toml`。
- Pytest 默认排除 `contract` 标记测试（见 `pyproject.toml` 的 `addopts`）。
- `e2e_llm` 标记测试会访问真实 LLM Provider，除非用户明确要求并提供环境配置，否则不要默认执行。
- `Novel.language` 发生变更时，必须调用 `invalidate_novel_language_caches()`，清理 lore automaton cache 并推进 window index revision。
- `LoreEntry` 的 priority 数字越小优先级越高（`1` 最高）。
- 项目内部历史代号 `SCNGS` 仍可能出现在环境变量、日志和 Compose 服务名中。
