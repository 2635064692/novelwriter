---
mode: plan
cwd: /home/opensource/python/novelwriter
task: 基于 94ffa5d015cf438300f3eb458dbd253610cfc351 至今的提示词管理前后端功能验收回归与联调计划
complexity: complex
planning_method: builtin
created_at: 2026-04-26T00:00:00+08:00
---

# Plan: 提示词管理前后端验收回归与联调

🎯 任务概述
基于当前分支从 `94ffa5d015cf438300f3eb458dbd253610cfc351` 到 `HEAD` 的历史变更，对“提示词管理”前端页面、后端 PromptKey 模板入库、版本历史与回滚能力进行验收回归。验证必须遵循 `$verify-env`：前端在远端宿主机 `web/` 目录直接构建/必要时用 Chrome MCP 访问验证；后端在远端 Docker 环境中构建、重启、测试与接口验证；最后以前端对接后端 API 为目标输出联调结论和缺口。

📋 执行计划
1. 环境门禁与变更清单确认：重新阅读 `AGENTS.md`、`CLAUDE.md` 的验证边界，确认后端只能在远端 Docker/一次性容器验证、前端只能在远端宿主机 `web/` 验证；记录 `git diff --name-status 94ffa5d...HEAD` 涉及的前后端、迁移、测试文件。
2. 远端代码同步准备：如本地有未推送变更，先在本地完成 commit/push；远端宿主机 `/home/haizh/software/novelwriter` 仅执行 `git pull` 同步当前分支，严禁远端 commit/push/reset。若远端分支不一致，先停止并报告，而不是在容器内执行 Git 写操作。
3. 前端静态验收：在远端宿主机 `web/` 执行 `npm run build`，验证 `/prompts` 路由、Navbar Tab、PromptManagementPage 与 Prompt 组件的 TypeScript/Vite 构建可通过；若有 lint/test 脚本且成本可控，再补充 `npm run lint` 或项目既有前端测试命令。
4. 前端交互验收：启动远端前端 dev server 或完整服务后，用浏览器/Chrome MCP 检查“提示词管理”Tab 可见；进入 `/prompts` 后确认 3 列响应式卡片、4 类分类 Tab、搜索、编辑弹窗 3 个 Tab、内置只读/自定义可编辑的 mock 策略与薄荷绿玻璃态风格。Chrome MCP 从本机访问远端时统一使用 `http://192.168.201.148:<实际端口>`，端口根据当前启动方式自适应记录。
5. 后端迁移与容器构建验收：在远端 Docker 环境执行 `docker compose build` 或一次性 Python 3.13 容器内 `scripts/setup_python_env.sh` 后运行 Alembic/测试命令，确认 `prompt_templates`、`prompt_versions` 迁移可创建且不会破坏现有 schema。
6. 后端测试回归：在远端 Docker 环境运行 `scripts/uv_run.sh ruff check app tests scripts` 与 `scripts/uv_run.sh pytest tests/`（默认排除 contract/e2e_llm），重点观察 prompt catalog、API、CLI、release pipeline 相关测试；如失败，记录失败命令、关键错误与对应需求编号。
7. 后端运行时验收：通过 `docker compose up -d --build` 重启后端服务，检查启动日志无迁移/预热错误；调用 `/api/prompts/`、`/api/prompts/{key}`、`PUT /api/prompts/{key}`、`GET /api/prompts/{key}/versions`、`POST /api/prompts/{key}/rollback`、`DELETE /api/prompts/{key}` 验证 R1–R11，尤其是只插入不存在 key、不覆盖用户修改、占位符完整性、写后缓存刷新、built_in 可改不可删。
8. 消费方零改动回归：用最小 API 或单测路径触发续写、大纲、世界观生成相关 `get_prompt()` 消费链，确认 `get_prompt()` 签名/返回值不变、现有 API 出入参不变、Copilot 不受影响；对 `app/utils/prompts.py` 常量兼容性做一次导入验证。
9. 前后端对接差距分析：以前端后续替换 hook 为后端 API 为目标，对比 `web/src/types/prompts.ts`/mock 字段与 `app/schemas.py` 响应字段、分类枚举、版本历史字段、内置/自定义权限语义，形成“可直接对接/需适配/后端缺口/前端缺口”清单。
10. 收尾与交付：验证结束后按需 `docker compose down` 清理临时服务，确认无残留测试进程；输出验收报告，包含通过项、失败项、证据命令、日志摘录、截图路径、联调结论、建议修复顺序与回滚方案。

⚠️ 风险与注意事项
- 本机使用 Chrome MCP 做页面验收时，访问远端服务地址固定为 `192.168.201.148`，端口按实际启动服务自适应选择（例如前端 dev server、后端 compose 暴露端口或临时验证端口），截图/访问记录需在验收报告中标明完整 URL。
- 当前工具环境未暴露 SSH MCP 与 Chrome MCP 命名工具；实际执行阶段若仍不可用，需要停止远端验证并报告工具缺失，不能改在本机运行后端/前端构建来替代远端验收。
- 前端首期为纯 Mock 数据，而后端已提供真实 API；联调重点不是强行改代码，而是确认字段模型、分类、版本历史、编辑权限是否能无损映射。
- 后端 `built_in=True` 需求是“不可删除但可修改”，与“内置只读”的前端首期展示策略存在产品语义差异，需要在联调结论中明确谁是当前事实源。
- 启动种子策略必须只 INSERT 不存在的 key，任何重启覆盖用户修改都属于高优先级阻塞问题。
- 所有后端验证必须在远端 Docker/一次性容器内执行；前端构建必须在远端宿主机 `web/` 执行；不得在本机安装依赖或运行替代验证。

📎 参考
- `AGENTS.md:23`：远端 SSH 开发主机与项目路径说明。
- `AGENTS.md:30`：后端 Docker、前端远端宿主机验证边界。
- `AGENTS.md:44`：本地提交推送、远端仅 `git pull` 的推荐工作流。
- `AGENTS.md:53`：远端 Git 写入限制。
- `AGENTS.md:79`：远端 Docker Compose 服务与容器名说明。
- `web/src/App.tsx:19`：懒加载 `PromptManagementPage`。
- `web/src/App.tsx:77`：新增 `/prompts` 路由。
- `web/src/components/layout/Navbar.tsx:63`：Navbar 提示词管理入口。
- `web/src/pages/PromptManagementPage.tsx:14`：提示词管理页面入口组件。
- `web/src/hooks/prompts/usePromptTemplates.ts:6`：当前前端 hook 使用 mock 数据。
- `app/models.py:516`：`PromptTemplate` 模型。
- `app/models.py:532`：`PromptVersion` 模型。
- `alembic/versions/033_add_prompt_template_tables.py:1`：提示词表迁移。
- `app/api/prompts.py:23`：提示词管理 API 路由前缀。
- `app/api/prompts.py:43`：更新模板接口。
- `app/api/prompts.py:73`：按版本回滚接口。
- `app/core/text/prompt_service.py:1`：提示词数据库服务与缓存逻辑入口。
- Chrome MCP 页面验收访问约定：远端地址 `192.168.201.148`，端口自适应并记录完整 URL。
