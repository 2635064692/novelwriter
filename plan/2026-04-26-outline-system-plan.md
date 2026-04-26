# 大纲体系（卷纲/章纲）实现计划

> 基于需求边界文档 `2026-04-26` 讨论产出，白话文 + 伪代码形式。

---

## 一、总览

本次在现有 WorldSystem 体系（list / hierarchy / timeline）基础上，新增第四种展示类型 **outline（大纲体系）**。核心链路：

```
世界观设定(WorldSystem) ─→ LLM规划卷划分 ─→ 卷纲生成(SSE流式) ─→ 用户审核 ─→ 章纲生成(SSE流式) ─→ 用户审核 ─→ 续写时注入上下文
```

所有产物存入 `world_systems` 表（`display_type='outline'`），走 `origin=worldgen, status=draft` 路线，与现有体系确认机制完全一致。

---

## 二、分步实施计划

### Step 1: Schema 层 —— 新增 outline 展示类型

**做什么**：在前后端的类型定义中，让 `outline` 成为合法的 `SystemDisplayType`。

**后端 `app/schemas.py`**：

```
1. SystemDisplayType 从 Literal["hierarchy", "timeline", "list"]
   改为 Literal["hierarchy", "timeline", "list", "outline"]

2. 新增 _OutlineChapterBrief Pydantic 模型:
   - chapter_number: int
   - chapter_title: str
   - brief_text: str (章纲正文)
   - suspense_level: str | None (悬念密度)
   - twist_level: str | None (认知颠覆等级)
   - foreshadowing: str | None (伏笔操作描述)

3. 新增 _OutlineVolume Pydantic 模型:
   - volume_number: int
   - volume_title: str
   - outline_text: str (卷纲正文)
   - chapter_start: int
   - chapter_end: int
   - chapters: list[_OutlineChapterBrief]

4. 新增 _OutlineData Pydantic 模型:
   - total_volumes: int (LLM 决定的总卷数)
   - volumes: list[_OutlineVolume]

5. 在 _SYSTEM_DATA_ADAPTERS 字典中注册:
   "outline": TypeAdapter(_OutlineData)
```

**前端 `web/src/types/api.ts`**：

```
SystemDisplayType 联合类型追加 'outline'
```

**前端 `web/src/lib/worldSystemDisplay.ts`**：

```
getSystemDisplayTypeLabel 函数追加 outline case → 返回 "大纲体系"
```

**前端 `web/src/components/atlas/systems/SystemNavigator.tsx`**：

```
DISPLAY_TYPES 数组追加 'outline'
INITIAL_DATA 字典追加 outline: { volumes: [] }
```

**影响范围**：类型系统层面，不涉及数据库迁移（JSON 列天然兼容）。

---

### Step 2: PromptKey —— 注册新提示词

**做什么**：在提示词模块中新增两个 key，数据库自动 seed 默认模板。

**`app/core/text/catalog.py`**：

```
PromptKey 枚举新增:
  OUTLINE_VOLUME = "outline_volume"     # 卷纲生成
  OUTLINE_CHAPTER = "outline_chapter"   # 章纲生成
```

**提示词模板来源**：参照 `/mnt/d/haizh/下载/小说提示词/book/` 下的阶段 D（三幕式情节架构师）和阶段 E（章节悬念节奏设计师），改写为适配 NovelWriter placeholder 体系的模板。

**`outline_volume` 提示词核心逻辑**（伪代码）：

```
系统提示词: "你是三幕式情节架构师，基于世界观设定规划卷划分..."

用户提示词模板:
  输入变量:
    {world_context}      ← 所有已审核 WorldSystem 的摘要拼合
    {chapter_list}       ← 已有章节列表（编号+标题）
    {total_chapters}     ← 总章节数
    {user_guidance}      ← 用户额外指导（可选）
    {total_volumes_hint} ← 用户建议总卷数（可选，如"6卷"）

  输出要求:
    LLM 返回结构化 JSON:
    {
      "total_volumes": 6,
      "volumes": [
        {
          "volume_number": 1,
          "volume_title": "...",
          "outline_text": "...",
          "chapter_start": 1,
          "chapter_end": 25,
          "chapters": []  ← 此时为空，仅划定范围
        },
        ...
      ]
    }
```

**`outline_chapter` 提示词核心逻辑**（伪代码）：

```
系统提示词: "你是章节悬念节奏设计师，基于卷纲逐章生成章纲..."

用户提示词模板:
  输入变量:
    {world_context}      ← 同上
    {volume_outline}     ← 当前卷纲全文
    {volume_number}      ← 当前卷号
    {chapter_start}      ← 当前卷起始章
    {chapter_end}        ← 当前卷结束章
    {chapter_contents}   ← 该卷内已有章节内容摘要（若有）
    {user_guidance}      ← 可选

  输出要求:
    LLM 返回结构化 JSON (逐章输出):
    {"op": "set_chapter", "chapter": {...}}  ← 单章纲
    {"op": "done"}                           ← 当前批次完成
```

**`app/core/text/zh.py`**：以阶段 D/E 原文为蓝本写入默认模板字符串。

**自动 seed**：`prompt_service.py` 的 `seed_defaults()` 在启动时自动检测并插入新 key（无需手动 SQL）。

---

### Step 3: 生成引擎 —— SSE 流式输出

**做什么**：实现核心生成函数，驱动 LLM → SSE 事件流。

**新增函数位置**：`app/core/generator.py`

#### 3.1 顶层入口：`generate_outline_system_stream()`

```
async def generate_outline_system_stream(db, novel_id, step, ...) -> AsyncGenerator[dict, None]:
    """
    step: "volume" | "chapter"
    统一入口，根据 step 分发到不同子流程。
    """

    1. 校验前置条件:
       novel = db.query(Novel).get(novel_id)
       检查 novel 是否存在且有 WorldSystem 数据
       若无 → yield error 事件 → return

    2. 组装 world_context:
       查询该 novel 下所有 status=approved 的 WorldSystem
       拼合为结构化文本摘要

    3. 根据 step 分发:
       if step == "volume":
           async for event in _generate_volumes(...): yield event
       elif step == "chapter":
           async for event in _generate_chapter_briefs(...): yield event
    """
```

#### 3.2 卷纲生成：`_generate_volumes()`

```
async def _generate_volumes(db, novel_id, world_context, ...) -> AsyncGenerator[dict, None]:

    # --- Phase 1: 获取章节列表 ---
    chapters = db.query(Chapter).filter(novel_id=novel_id).order_by(chapter_number).all()
    total = len(chapters)

    # --- Phase 2: 构建 prompt ---
    prompt = get_prompt(OUTLINE_VOLUME).format(
        world_context=world_context,
        chapter_list=格式化章节列表(chapters),
        total_chapters=total,
        user_guidance=user_guidance,
        total_volumes_hint=total_volumes_hint,  # 可选
    )

    # --- Phase 3: 调用 LLM (structured output) ---
    yield {"type": "start", "phase": "volume_outline", "total_chapters": total}

    result = await ai_client.generate_structured(
        prompt=prompt,
        response_model=VolumeOutlineLLMOutput,  # 定义 LLM 返回结构
        system_prompt=...,
        temperature=0.3,  # 结构化输出用低温度
    )

    # --- Phase 4: 逐卷 yield SSE 事件 ---
    for vol in result.volumes:
        yield {
            "type": "volume_outline",
            "volume_number": vol.volume_number,
            "volume_title": vol.volume_title,
            "outline_text": vol.outline_text,
            "chapter_start": vol.chapter_start,
            "chapter_end": vol.chapter_end,
            "total_volumes": result.total_volumes,
        }

    # --- Phase 5: 写入数据库 ---
    _upsert_outline_system(
        db, novel_id,
        display_type="outline",
        data={
            "total_volumes": result.total_volumes,
            "volumes": [
                {vol..., "chapters": []}  # chapters 此时为空
                for vol in result.volumes
            ]
        },
        origin="worldgen",
        status="draft",
    )

    yield {"type": "done", "phase": "volume_outline", "volumes_generated": len(result.volumes)}
```

#### 3.3 章纲生成：`_generate_chapter_briefs()`

```
async def _generate_chapter_briefs(db, novel_id, volume_number, world_context, ...) -> AsyncGenerator[dict, None]:
    """
    基于已审核的卷纲，逐卷生成章纲。
    支持单卷重生成：指定 volume_number 则只生成该卷。
    """

    # --- Phase 1: 加载卷纲 ---
    outline_system = 查询该 novel 的 outline 类型 WorldSystem (status=approved 或 draft)
    if not outline_system: yield error("请先生成并审核卷纲") → return

    volumes_to_gen = [v for v in outline_system.data.volumes
                      if volume_number is None or v.volume_number == volume_number]

    yield {"type": "start", "phase": "chapter_brief",
           "volumes_to_generate": len(volumes_to_gen)}

    # --- Phase 2: 逐卷生成 ---
    for vol in volumes_to_gen:
        yield {
            "type": "volume_start",
            "volume_number": vol.volume_number,
            "volume_title": vol.volume_title,
            "chapter_start": vol.chapter_start,
            "chapter_end": vol.chapter_end,
        }

        # 2a. 判断是否需要分批
        chapter_count = vol.chapter_end - vol.chapter_start + 1
        batch_size = 25  # 可配置
        batches = 按 batch_size 将 [chapter_start, chapter_end] 切片

        all_chapter_briefs = []

        for batch_idx, (batch_start, batch_end) in enumerate(batches):
            # 2b. 获取该批次章节内容（若有已写内容，取其摘要）
            chapter_summaries = 获取 [batch_start, batch_end] 的章节摘要

            # 2c. 构建 prompt
            prompt = get_prompt(OUTLINE_CHAPTER).format(
                world_context=world_context,
                volume_outline=vol.outline_text,
                volume_number=vol.volume_number,
                chapter_start=batch_start,
                chapter_end=batch_end,
                chapter_contents=chapter_summaries,
                carry=上一批次最后章节的章纲,  # carry 承接
            )

            # 2d. 流式调用 LLM
            async for chunk in ai_client.generate_stream(prompt=prompt, ...):
                # 解析 chunk，提取 JSON 指令或自然语言
                parsed = 尝试解析为章纲事件(chunk)
                if parsed:
                    yield parsed  # {"type": "chapter_brief", ...}
                    all_chapter_briefs.append(parsed)

            # 2e. 批次结束，yield 进度
            yield {"type": "progress", "volume_number": vol.volume_number,
                   "chapters_done": batch_end - vol.chapter_start + 1,
                   "chapters_total": chapter_count}

        # 2f. 当前卷完成，写入数据库
        _upsert_volume_chapters_in_system(db, novel_id, vol.volume_number, all_chapter_briefs)
        yield {"type": "volume_done", "volume_number": vol.volume_number,
               "chapters_generated": len(all_chapter_briefs)}

    yield {"type": "done", "phase": "chapter_brief"}
```

---

### Step 4: 数据库持久化 —— 幂等写入

**核心理念**：复用 `world_systems` 表，不需要新表。在一个 `display_type='outline'` 的 System 行中存储全部卷纲+章纲。

**幂等写入函数（伪代码）**：

```
def _upsert_outline_system(db, novel_id, data, origin, status):
    """
    一个 novel 只有一条 display_type='outline' 的 WorldSystem 记录。
    每次生成覆盖更新。
    """

    existing = db.query(WorldSystem).filter(
        novel_id=novel_id, display_type='outline'
    ).first()

    if existing:
        existing.data = data
        existing.origin = origin
        existing.status = status
        existing.updated_at = now()
    else:
        db.add(WorldSystem(
            novel_id=novel_id,
            name="大纲体系",
            display_type="outline",
            data=data,
            origin=origin,
            status=status,
            visibility="active",
        ))

    db.commit()
```

**卷纲生成后**：写入完整 `{total_volumes, volumes: [{..., chapters: []}]}`（chapters 为空，仅卷级信息）。

**章纲生成后**：找到对应 volume，填充 `chapters` 数组。

---

### Step 5: API 端点 —— 暴露 SSE 流

**位置**：`app/api/novels.py` 或 `app/api/outline.py`（视模块大小决定是否拆新文件）。

```
POST /api/novels/{novel_id}/outline/generate/stream

Request Body:
  step: "volume" | "chapter"               ← 必填
  volume_number: int | None                 ← 仅 step="chapter" 时有效，null=全部卷
  total_volumes_hint: int | None            ← 可选，用户建议的总卷数
  user_guidance: str | None                 ← 可选

Response: Content-Type: application/x-ndjson
  逐行 JSON，每行一个事件（见 Step 3 的事件类型）。
```

**端点实现（伪代码）**：

```
@router.post("/{novel_id}/outline/generate/stream")
async def generate_outline_stream(
    novel_id: int,
    req: OutlineGenerateRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_or_default),
):
    novel = db.query(Novel).get(novel_id)
    _verify_novel_access(novel, current_user)

    return StreamingResponse(
        generate_outline_system_stream(
            db, novel_id,
            step=req.step,
            volume_number=req.volume_number,
            total_volumes_hint=req.total_volumes_hint,
            user_guidance=req.user_guidance,
            user_id=current_user.id,
        ),
        media_type="application/x-ndjson",
    )
```

**其他辅助 API**：

```
GET  /api/novels/{novel_id}/outline           → 返回当前大纲体系数据（供前端展示/审核页）
POST /api/novels/{novel_id}/outline/approve   → 将 status 从 draft 改为 approved（确认审核）
```

---

### Step 6: 续写注入 —— 消费大纲数据

**做什么**：在 `_build_continuation_prompt()` 中，额外查询当前章节所在的卷纲和章纲，注入 prompt 上下文。

**现有函数**：`app/core/generator.py:_build_continuation_prompt()`

**新增逻辑（伪代码）**：

```
async def _build_continuation_prompt(db, novel_id, ...):
    # ... 现有逻辑：组装章节内容、lorebook、world_context ...

    # === 新增：查询大纲体系 ===
    outline_system = db.query(WorldSystem).filter(
        novel_id=novel_id, display_type='outline', status='approved'
    ).first()

    if outline_system:
        next_chapter = 计算下一章节编号(...)

        # 找到当前章节所在的卷
        current_volume = find_volume_by_chapter(outline_system.data, next_chapter)

        # 找到当前章节的章纲
        current_chapter_brief = find_chapter_brief(outline_system.data, next_chapter)

        # 拼接到 prompt 中
        if current_volume:
            volume_context = f"""
            【当前卷信息】
            卷{current_volume.volume_number}: {current_volume.volume_title}
            {current_volume.outline_text}
            """
            # 注入到系统提示词或用户提示词前半部分

        if current_chapter_brief:
            chapter_context = f"""
            【本章章纲】
            {current_chapter_brief.brief_text}
            悬念密度: {current_chapter_brief.suspense_level}
            """
```

**查找函数（纯数据操作）**：

```
def find_volume_by_chapter(data: _OutlineData, chapter_number: int) -> _OutlineVolume | None:
    遍历 data.volumes，找到 chapter_start <= chapter_number <= chapter_end 的卷

def find_chapter_brief(data: _OutlineData, chapter_number: int) -> _OutlineChapterBrief | None:
    遍历所有 volumes[].chapters[]，找到 chapter_number 匹配的章纲
```

---

### Step 7: 前端适配

**涉及页面**：

1. **WorldSystem 创建/编辑面板**：`display_type` 下拉新增 "大纲体系" 选项
2. **大纲体系详情页**（新页面或系统详情页的 outline 分支）：
   - 展示卷列表 + 每卷章纲列表
   - "生成大纲" 按钮 → 调 SSE API
   - SSE 事件实时渲染（进度条 + 逐条追加卷纲/章纲）
   - 审核确认按钮
3. **SystemNavigator**：sidebar 筛选支持 outline 类型

**前端 SSE 消费（伪代码）**：

```
async function generateOutline(step, volumeNumber?) {
  const response = await fetch(`/api/novels/${novelId}/outline/generate/stream`, {
    method: 'POST',
    body: JSON.stringify({ step, volume_number: volumeNumber }),
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const lines = decoder.decode(value).split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line)

      switch (event.type) {
        case 'volume_outline':
          appendVolumeCard(event)     // UI: 追加一张卷纲卡片
          break
        case 'chapter_brief':
          appendChapterRow(event)     // UI: 在对应卷下追加一行章纲
          break
        case 'volume_done':
          markVolumeComplete(event)   // UI: 标记该卷生成完成
          break
        case 'progress':
          updateProgressBar(event)    // UI: 更新进度条
          break
        case 'done':
          showSuccessToast()
          break
        case 'error':
          showErrorToast(event.message)
          break
      }
    }
  }
}
```

---

## 三、实施顺序

| 序号 | 步骤 | 预估依赖 | 可并行？ |
|---|---|---|---|
| 1 | Schema 层 —— 新增 outline 类型（前后端） | 无 | 可 |
| 2 | PromptKey + 提示词模板入库 | 步骤 1 | 可 |
| 3 | 生成引擎 —— 卷纲生成 + SSE | 步骤 1, 2 | 否 |
| 4 | 生成引擎 —— 章纲生成 + SSE + 分批 | 步骤 3 | 否 |
| 5 | 数据库持久化（幂等写入） | 步骤 3 | 与 3 同步 |
| 6 | API 端点 | 步骤 3, 4 | 否 |
| 7 | 续写注入 | 步骤 5 | 可 |
| 8 | 前端适配 | 步骤 6 | 可 |

---

## 四、风险与对策

| 风险 | 级别 | 对策 |
|---|---|---|
| LLM 卷划分不合理（如 150 章分成 2 卷） | 中 | 卷划分后必须用户确认，前端展示划分方案清晰可见 |
| 单卷章纲过多导致 LLM 输出截断 | 中 | 分批策略（默认 25 章/批），carry 机制衔接上下文 |
| `world_systems` 单行 JSON 过大（150 章 × 200 字 = 30KB+） | 低 | SQLite/PostgreSQL 的 JSON/JSONB 列均支持 MB 级别，30KB 不是问题 |
| 前端 SSE 解析不完整（TCP 分片导致 JSON 跨 chunk） | 低 | 前端按换行分割（NDJSON），residual 行暂存拼接；后端 `StreamingResponse` 保证逐行 flush |
