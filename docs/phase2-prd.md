# Crab-Science Phase 2 PRD — Session Trees + Skills 系统

> **文档版本**：v1.0
> **日期**：2026-07-20
> **作者**：许清楚（产品经理）
> **状态**：待评审
> **Phase**：Phase 2 — Session Trees + Skills 系统
> **预计周期**：2-3 周

---

## 1. 项目信息

| 维度 | 说明 |
|------|------|
| **项目名称** | crab-science |
| **Phase** | Phase 2 — Session Trees + Skills 系统 |
| **技术栈** | Turborepo + pnpm monorepo, TypeScript, Node.js, Ink 4.x |
| **语言** | 中文 |
| **原始需求** | 实现 session 分支探索 + 完善 skills 系统（Level 2/3 + 执行记录）+ Extensions 系统，让 agent 具备试错回退和按需加载完整能力 |

### Phase 2 范围边界

**包含**：
- Session 从线性结构升级为树形结构（分支 / 回退 / 跳转 / 摘要 / 持久化）
- Skills 系统增强：Progressive Disclosure Level 2（附加文件按需加载）+ Level 3（可执行脚本按需调用）
- Skill 执行记录与版本追踪
- 补齐 3 个预装科研 Skills（experiment-design、citation-management、research-workflow）
- Extensions 系统：hot-reload TypeScript extensions + 预装 extensions
- CLI 命令支持 Session Tree 操作

**不包含**（后续 Phase）：
- 进化机制（Skill/Subagent/Knowledge 进化）→ Phase 3
- 桌面应用（Tauri GUI）→ Phase 4
- Subagent 系统 → Phase 2/3
- SQLite 存储 → Phase 3（Phase 2 仍用 JSON 文件）

### Phase 1 → Phase 2 的关键变更

| 维度 | Phase 1 | Phase 2 |
|------|---------|---------|
| Session 结构 | 线性 `messages: Message[]` | 树形 `root: SessionNode` + `currentNodeId` |
| Skill 加载层级 | Level 0 + Level 1 | Level 0-3 完整 |
| Skill 执行记录 | 无 | 有（执行日志 + 效果指标） |
| 预装 Skills 数量 | 3 个 | 6 个 |
| Extensions | 无 | 有（hot-reload） |
| CLI 命令 | 基础（/model, /clear, /skills 等） | 增加 tree 操作命令 |

---

## 2. 产品目标

Phase 2 的核心使命是**让 agent 具备探索能力**——科研本身就是一个不断试错、分支探索的过程，session tree 让 agent 的思维路径也能分支和回退。

### 目标 1：实现 Session Tree，支持分支探索

将 Phase 1 的线性消息列表升级为树形结构，支持从任意节点 fork 新分支、回退到历史节点、在分支间跳转，以及将分支内容摘要后带回主分支。这让科研人员可以自由探索不同方案而不用担心"走错路"——失败的探索 fork 到侧分支不污染主 context。

**验收标准**：在 session 中 fork 一个分支探索方案 A，回到主分支继续探索方案 B，两方案互不干扰；可将方案 B 的摘要合并回主分支。

### 目标 2：完善 Skills 系统，实现完整 Progressive Disclosure

补齐 Progressive Disclosure 的 Level 2（SKILL.md 引用的附加文件按需加载）和 Level 3（可执行脚本按需调用），并增加 skill 执行记录与版本追踪。让 skill 不再只是一个静态文档，而是一个包含指令、参考文件、可执行脚本的完整能力包。

**验收标准**：literature-search skill 包含附加参考文件和检索脚本，agent 能按需加载附加文件和调用脚本完成检索任务；skill 的每次执行都有记录。

### 目标 3：建立 Extensions 系统，支持 hot-reload

实现 TypeScript extensions 的加载和 hot-reload 机制，预装 web-search 和 arxiv-search 等常用 extension。Extensions 扩展了 agent 的工具集，为 Phase 3 的"agent 自我修改 extensions"进化机制打下基础。

**验收标准**：预装的 web-search extension 能被 agent 调用执行网络搜索；修改 extension 文件后无需重启即可生效。

---

## 3. 用户故事

### US-1：分支探索不同实验方案

> **As a** 科研人员，
> **I want** 在和 agent 讨论实验设计时，fork 出多个分支分别探索方案 A（对照组设计）和方案 B（交叉设计），互不干扰，
> **so that** 我能并行比较不同方案的优劣，选出最优方案后将摘要合并回主线，而不需要开多个 session 重新输入背景信息。

**涉及能力**：Session Tree 分支 + 跳转 + 摘要合并

### US-2：回退到错误之前重新来过

> **As a** 科研人员，
> **I want** 当 agent 执行了一步错误操作（如删错了文件、跑了错误的分析参数）后，能回退到错误之前的状态重新指导 agent，
> **so that** 我不需要从头开始一个新的 session，保留之前有价值的前期讨论。

**涉及能力**：Session Tree 回退 + 从历史节点重新开始

### US-3：Skill 按需加载附加参考文件

> **As a** 科研人员，
> **I want** 当 agent 使用 literature-search skill 时，能根据具体检索需求加载 skill 目录下的附加参考文件（如各数据库的 API 文档），
> **so that** agent 能获得更精确的检索策略，而不是只靠 SKILL.md 主文件中的通用指导。

**涉及能力**：Skill Level 2 — 附加文件按需加载

### US-4：Skill 调用可执行脚本完成任务

> **As a** 科研人员，
> **I want** literature-search skill 内置的检索脚本能被 agent 直接调用，
> **so that** agent 不需要每次都临时写 Python 检索代码，而是调用已经调试好的脚本，提高成功率和效率。

**涉及能力**：Skill Level 3 — 可执行脚本按需调用

### US-5：使用 Extension 扩展 Agent 能力

> **As a** 科研人员，
> **I want** agent 能通过 web-search extension 搜索互联网上的最新信息，
> **so that** agent 不局限于本地文件和 API，能获取实时信息辅助科研决策。

**涉及能力**：Extensions 系统 + 预装 web-search extension

### US-6：查看 Session 的完整探索树

> **As a** 科研人员，
> **I want** 在 CLI 中看到当前 session 的树形结构概览，了解哪些节点 fork 了分支、当前位于哪个分支，
> **so that** 我能清晰地掌握整个探索路径，快速跳转到感兴趣的分支。

**涉及能力**：CLI `/tree` 命令 + Session Tree 可视化

---

## 4. 需求池

### P0：必须实现（核心功能）

| # | 需求 | 描述 | 验收标准 |
|---|------|------|---------|
| P0-1 | **Session 数据结构升级为树形** | 将 `Session.messages: Message[]` 升级为 `Session.root: SessionNode` + `Session.currentNodeId: string`。`SessionNode` 包含 `id`、`parentId`、`type`（user/assistant/tool_call/tool_result/summary）、`content`、`timestamp`、`children[]`、`metadata`（含 toolName、toolParams、toolResult、tokensUsed、branchReason） | 树形结构能表达完整的对话+工具调用+分支历史；JSON 序列化/反序列化正确 |
| P0-2 | **Phase 1 线性 Session 向后兼容** | 加载 Phase 1 的线性 session JSON 时，自动转换为树形结构（将 `messages[]` 转换为 `root → 线性链 → 叶子`） | 旧版 session 文件能被正确加载并转换为树形；转换后功能正常 |
| P0-3 | **Session 分支（Fork）** | 从当前节点（或指定节点）fork 出一个新分支，新分支继承父节点的所有历史，后续消息添加到新分支。需要记录 branchReason（用户手动 fork / agent 自动 fork） | fork 后新分支独立增长；父分支不受影响；分支原因可追溯 |
| P0-4 | **Session 回退（Rollback）** | 将 currentNodeId 设置为指定的历史节点，后续消息从该节点继续追加（自动 fork 新分支以保留原路径） | 回退后新消息不覆盖原有历史；原路径可通过跳转恢复 |
| P0-5 | **Session 跳转（Jump）** | 在不同分支间切换，将 currentNodeId 设置为目标分支的叶节点（或指定节点） | 跳转后能从目标分支继续对话；分支间切换不丢失数据 |
| P0-6 | **Session 分支摘要（Summarize）** | 将指定分支的内容用 LLM 总结为摘要节点，将摘要节点添加到主分支（或其他指定分支）的当前节点之后。摘要节点 type='summary'，包含原分支引用 | 摘要内容准确反映分支讨论要点；摘要节点可追溯到原分支；主分支 context 不被分支细节污染 |
| P0-7 | **Session Tree 持久化** | Session 以 JSON 格式持久化到 `~/.crab-science/sessions/{id}.json`，包含完整的树形结构。支持增量写入优化（仅追加新节点，不全量序列化） | 保存/加载 session 树形结构完整；大 session（100+ 节点）保存/加载性能可接受（<1s） |
| P0-8 | **Agent Loop 适配树形 Session** | 修改 Agent.run() 方法，从 `session.currentNodeId` 所在路径构建 context（从 root 到当前节点的路径消息），新消息追加为当前节点的子节点 | Agent 能在树形 session 上正常工作；context 构建只包含当前路径的消息 |
| P0-9 | **ContextBuilder 适配树形路径** | ContextBuilder.build() 从 root 到 currentNodeId 的路径提取消息，构建发送给 LLM 的 messages 数组。分支中的消息不进入主路径 context | context 只包含当前路径的消息；分支探索不膨胀主 context |
| P0-10 | **Skill Level 2 — 附加文件按需加载** | SkillLoader 增加 `loadAttachment(skillName, fileName)` 方法，加载 skill 目录下的附加文件（如 `search-strategy.md`、`api-docs.md`）。SKILL.md 中通过相对路径引用附加文件，agent 通过 read 工具按需加载 | Skill 目录可包含多个 .md 文件；agent 能读取附加文件；附加文件不进入系统提示 |
| P0-11 | **Skill Level 3 — 可执行脚本按需调用** | SkillLoader 增加 `getScriptPath(skillName, scriptName)` 方法，返回 skill 目录下可执行脚本的路径。Agent 通过 bash 工具执行脚本。脚本路径注入 SKILL.md 的说明中 | Skill 目录可包含 .py/.sh 脚本；agent 能通过 bash 调用脚本；脚本执行结果正确回注 |
| P0-12 | **Skill 执行记录** | 每次 agent 使用 skill 执行任务时，记录执行日志（时间、skill 名称、任务描述、执行步骤、耗时、结果状态）。存储为 skill 目录下的 `executions.jsonl`（追加写入） | 执行记录完整且可查询；记录文件为 JSONL 格式便于后续分析 |
| P0-13 | **Skill 版本追踪** | SkillMeta 增加 `lastUpdated`、`executionCount` 字段。SKILL.md 的 frontmatter 支持 `version` 字段（已存在）。每次 skill 内容变更时版本号 +1 | Skill 版本信息可查询；版本号随 SKILL.md 修改递增 |
| P0-14 | **SessionManager API 升级** | SessionManager 增加 `fork(session, nodeId?, reason?)`、`rollback(session, nodeId)`、`jump(session, branchLeafNodeId)`、`summarize(session, branchNodeId, targetNodeId?)`、`getPath(session, nodeId)`、`getTree(session)` 方法 | 所有方法功能正确；边界情况（不存在的 nodeId、根节点 fork 等）有合理处理 |

### P1：应该实现（重要功能）

| # | 需求 | 描述 | 验收标准 |
|---|------|------|---------|
| P1-1 | **预装 Skill：experiment-design** | 实验设计 skill，SKILL.md 包含实验设计方法论（对照/随机/重复原则）、样本量计算方法、变量控制策略。附带 `sample-size.py` 脚本和 `design-templates.md` 参考文件 | Agent 能辅助生成实验设计方案；能调用脚本计算样本量 |
| P1-2 | **预装 Skill：citation-management** | 引用管理 skill，SKILL.md 包含引用格式标准（APA/IEEE/Nature）、文献去重方法、BibTeX 管理流程。附带 `format-citation.py` 脚本 | Agent 能格式化引用；能管理 .bib 文件 |
| P1-3 | **预装 Skill：research-workflow** | 科研工作流管理 skill，SKILL.md 包含科研项目阶段管理、里程碑追踪、TODO 管理方法论 | Agent 能辅助规划科研工作流；能生成结构化的研究计划 |
| P1-4 | **Extensions 加载系统** | 实现 ExtensionLoader：扫描 `~/.crab-science/extensions/` 和项目级 `extensions/` 目录下的 `.ts` 文件，动态编译加载，注册为 Tool 或 CLI 命令 | Extension 文件能被正确发现和加载；注册的工具能被 agent 调用 |
| P1-5 | **Extensions Hot-Reload** | 监听 extensions 目录文件变化，文件修改后自动重新编译加载，无需重启 CLI。使用文件系统 watch（fs.watch 或 chokidar） | 修改 extension 文件后 <2s 内生效；旧工具自动卸载，新工具自动注册 |
| P1-6 | **预装 Extension：web-search** | web-search extension，封装网络搜索能力为 agent 工具。支持搜索关键词并返回结构化结果（标题、URL、摘要） | Agent 能通过 web-search 工具搜索互联网信息；结果结构化返回 |
| P1-7 | **预装 Extension：arxiv-search** | arxiv-search extension，封装 arXiv API 搜索能力为 agent 工具。支持按关键词/分类/时间搜索论文 | Agent 能通过 arxiv-search 工具搜索 arXiv 论文；结果包含标题、作者、摘要、PDF 链接 |
| P1-8 | **Phase 1 Skills 增强** | 为已有的 3 个 skill（literature-search、data-analysis、paper-writing）补充附加参考文件和可执行脚本，使其支持 Level 2/3 | 3 个 skill 都有附加文件和脚本；agent 能按需加载和调用 |

### P2：可以实现（锦上添花）

| # | 需求 | 描述 | 验收标准 |
|---|------|------|---------|
| P2-1 | **CLI `/tree` 命令** | 在 CLI 中显示当前 session 的树形结构概览（ASCII tree），标注当前所在分支 | 树形结构清晰可读；当前分支有高亮标记 |
| P2-2 | **CLI `/branch [reason]` 命令** | 通过斜杠命令从当前节点 fork 新分支 | 命令执行后进入新分支；分支原因可选记录 |
| P2-3 | **CLI `/rollback [node_id]` 命令** | 通过斜杠命令回退到指定节点（不传参则列出最近的可回退节点） | 回退操作正确；无参时列出候选节点 |
| P2-4 | **CLI `/jump` 命令** | 通过斜杠命令在分支间跳转，列出所有分支供选择 | 列出所有分支及摘要；选择后跳转成功 |
| P2-5 | **CLI `/summarize [branch_id]` 命令** | 通过斜杠命令将指定分支内容摘要合并到当前分支 | 摘要内容合理；合并后主分支可见摘要 |
| P2-6 | **Session Tree 可视化增强** | 在 CLI 对话区域中，分支节点显示特殊标记（如 `↳ branch: 探索方案A`），让用户感知分支结构 | 分支结构在对话流中可见；不干扰正常阅读 |
| P2-7 | **Skill 执行记录查看命令** | `/skill-history [name]` 命令查看指定 skill 的执行历史记录 | 执行记录按时间倒序展示；包含关键指标 |
| P2-8 | **Extensions 管理命令** | `/extensions` 命令列出已加载的 extensions 及其状态 | 列表包含名称、类型（tool/command）、状态（loaded/error） |
| P2-9 | **Session 导出支持树形结构** | 将 session 导出为 Markdown 文件时，保留树形结构（用缩进或标题层级表示分支） | 导出文件结构清晰；分支关系可辨识 |
| P2-10 | **Skill 目录结构校验** | SkillLoader 在加载时校验 skill 目录结构（SKILL.md 必须存在，脚本文件需要有执行权限等），校验失败时给出友好提示 | 结构异常的 skill 被跳过并警告；不影响其他 skill 加载 |

---

## 5. UI / 交互设计稿

### 5.1 Session Tree 在 CLI 中的交互

#### 对话流中的分支标记

当 session 中存在分支时，对话流中显示分支标记：

```
┌─────────────────────────────────────────────────────────────┐
│  Crab-Science v0.2.0          [Claude Sonnet] [18.2K] [$0.05]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You: 帮我设计一个 CRISPR 脱靶效应检测的实验方案              │
│                                                             │
│  Crab: 我来帮你设计实验方案。首先加载实验设计技能...          │
│  ...（agent 响应内容）                                       │
│                                                             │
│  ┌─ 📄 read ─────────────────────────────────────────────┐  │
│  │ skills/experiment-design/SKILL.md                      │  │
│  │ (实验设计技能已加载)                                     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  Crab: 我建议从两个方向探索：                                 │
│  方案 A：基于 GUIDE-seq 的全基因组脱靶检测                    │
│  方案 B：基于 CIRCLE-seq 的体外脱靶检测                       │
│  你想深入探索哪个方案？                                       │
│                                                             │
│  You: 两个都试试                                             │
│                                                             │
│  ↳ ═══ 分支: 方案A-GUIDE-seq ═════════════════════════════  │
│  │  You: 详细展开方案 A                                      │
│  │  Crab: 方案 A 的详细设计如下...                            │
│  │  ...                                                      │
│  │  [摘要已合并到主线]                                       │
│  ↳ ═══════════════════════════════════════════════════════  │
│                                                             │
│  ↳ ═══ 分支: 方案B-CIRCLE-seq ═════════════════════════════ │
│  │  You: 详细展开方案 B                                      │
│  │  Crab: 方案 B 的详细设计如下...                            │
│  │  ...                                                      │
│  │  [摘要已合并到主线]                                       │
│  ↳ ═══════════════════════════════════════════════════════  │
│                                                             │
│  Crab: 综合两个方案的探索结果，我建议...                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  > 输入消息... (/tree 查看分支结构)                          │
└─────────────────────────────────────────────────────────────┘
```

#### `/tree` 命令输出

```
> /tree

Session: sess_20260720_a1b2c3
当前分支: ● main

  root
  ├── msg_001 [user] 帮我设计CRISPR脱靶检测实验
  ├── msg_002 [assistant] 我来帮你设计...
  ├── msg_003 [tool] read: experiment-design/SKILL.md
  ├── msg_004 [assistant] 我建议从两个方向...
  ├── msg_005 [user] 两个都试试
  │
  ├── ├ msg_006 [summary] ← 分支: 方案A-GUIDE-seq (6 条消息)
  │   ├── msg_a1 [user] 详细展开方案 A
  │   ├── msg_a2 [tool] bash: sample-size.py
  │   ├── msg_a3 [assistant] 方案 A 详细设计...
  │   └── msg_a4 [assistant] 样本量计算结果...
  │
  ├── ├ msg_007 [summary] ← 分支: 方案B-CIRCLE-seq (5 条消息)
  │   ├── msg_b1 [user] 详细展开方案 B
  │   ├── msg_b2 [assistant] 方案 B 详细设计...
  │   └── msg_b3 [assistant] 方案 B 优势分析...
  │
  └── ● msg_008 [assistant] 综合两个方案，我建议...  ← 当前
```

#### `/branch` 命令交互

```
> /branch 探索备选方案C

  ✅ 已从当前节点 fork 新分支: "探索备选方案C"
  当前位于新分支。之前的对话路径保留，可用 /jump 切换回去。

  > _
```

#### `/rollback` 命令交互

```
> /rollback

  可回退的节点:

  [1] msg_005 [user]      "两个都试试"              (2 分钟前)
  [2] msg_004 [assistant] "我建议从两个方向探索..."   (3 分钟前)
  [3] msg_002 [assistant] "我来帮你设计实验方案..."   (5 分钟前)

  输入编号选择回退点 (或输入 q 取消):
  > 2

  ✅ 已回退到 msg_004。
  ⚠ 原路径已保留为分支，可用 /jump 切换回去。
  后续消息将添加到新分支。

  > _
```

### 5.2 Skill 目录结构（Phase 2）

```
skills/
├── literature-search/
│   ├── SKILL.md              # 主指令文件（Level 0/1）
│   ├── search-strategy.md    # 附加参考：多数据库检索策略（Level 2）
│   ├── api-reference.md      # 附加参考：各 API 文档（Level 2）
│   ├── search.py             # 可执行脚本：统一检索脚本（Level 3）
│   ├── dedup.py              # 可执行脚本：文献去重脚本（Level 3）
│   └── executions.jsonl      # 执行记录（自动维护）
├── data-analysis/
│   ├── SKILL.md
│   ├── stat-methods.md       # 附加参考：统计方法选择指南
│   ├── visualize.py          # 可执行脚本：可视化脚本
│   └── executions.jsonl
├── paper-writing/
│   ├── SKILL.md
│   ├── imrad-template.md     # 附加参考：IMRaD 结构模板
│   └── executions.jsonl
├── experiment-design/        # 新增
│   ├── SKILL.md
│   ├── design-templates.md   # 附加参考：实验设计模板
│   ├── sample-size.py        # 可执行脚本：样本量计算
│   └── executions.jsonl
├── citation-management/      # 新增
│   ├── SKILL.md
│   ├── format-citation.py    # 可执行脚本：引用格式化
│   └── executions.jsonl
└── research-workflow/        # 新增
    ├── SKILL.md
    ├── workflow-templates.md # 附加参考：工作流模板
    └── executions.jsonl
```

### 5.3 Extensions 目录结构

```
~/.crab-science/extensions/    # 全局 extensions
└── (用户自定义)

extensions/                     # 预装 extensions（项目级）
├── web-search.ts               # 网络搜索工具
├── arxiv-search.ts             # arXiv 论文搜索工具
└── semantic-scholar.ts         # Semantic Scholar 搜索工具
```

#### Extension 文件示例（web-search.ts）

```typescript
// Extension 通过导出 `tool` 对象注册为 Agent 工具
export const tool = {
  name: 'web-search',
  description: 'Search the web for current information',
  parameters: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      maxResults: { type: 'number', description: 'Max results (default 5)' },
    },
    required: ['query'],
  },
  execute: async (params: { query: string; maxResults?: number }) => {
    const max = params.maxResults ?? 5;
    // 调用搜索 API...
    return {
      success: true,
      output: JSON.stringify(results, null, 2),
    };
  },
};
```

### 5.4 新增 CLI 斜杠命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `/tree` | 显示当前 session 的树形结构 | `/tree` |
| `/branch [reason]` | 从当前节点 fork 新分支 | `/branch 探索方案C` |
| `/rollback [node_id]` | 回退到指定节点（无参则列出候选） | `/rollback` 或 `/rollback msg_004` |
| `/jump` | 在分支间跳转（列出所有分支供选择） | `/jump` |
| `/summarize [branch_id]` | 将指定分支摘要合并到当前分支 | `/summarize branch_003` |
| `/extensions` | 列出已加载的 extensions | `/extensions` |
| `/skill-history [name]` | 查看 skill 执行历史 | `/skill-history literature-search` |

### 5.5 系统提示词变更

Phase 2 系统提示词在 Phase 1 基础上增加 extensions 工具说明和 skill 附加文件提示：

```
# 角色
你是 Crab-Science，一个科研 AI Agent...

# 可用工具
- read: 读取文件内容，支持 glob 模式
- write: 创建或覆盖文件
- edit: 精确编辑文件
- bash: 执行 shell 命令
- web-search: 搜索互联网          ← Extension 注册的工具
- arxiv-search: 搜索 arXiv 论文    ← Extension 注册的工具

# 可用技能（按需读取 SKILL.md）
- literature-search: 搜索和综述学术文献
  附加文件: search-strategy.md, api-reference.md
  可执行脚本: search.py, dedup.py
- experiment-design: 实验设计方案生成
  附加文件: design-templates.md
  可执行脚本: sample-size.py
...

# 工作原则
- 需要技能时用 read 工具加载 SKILL.md
- SKILL.md 中引用的附加文件按需用 read 加载
- skill 目录下的脚本用 bash 工具执行
- 探索不同方案时可建议用户 fork 分支
...
```

---

## 6. 待确认问题

| # | 问题 | 背景 | 建议方案 | 需要决策方 |
|---|------|------|---------|-----------|
| 1 | **Session Tree 存储格式选择** | Phase 1 使用全量 JSON 序列化（一个 session 一个文件）。Phase 2 树形结构更复杂，全量序列化可能影响大 session 的保存/加载性能。是继续全量序列化还是改为增量写入（如 JSONL 追加 + 索引文件）？ | Phase 2 仍用全量 JSON 序列化（简单优先），但优化序列化结构（节点用扁平 Map + 引用替代嵌套 children 数组）。Phase 3 引入 SQLite 时再彻底优化。 | 架构师 |
| 2 | **SessionNode 的 children 嵌套 vs 扁平存储** | 设计文档中 `SessionNode.children: SessionNode[]` 是嵌套结构，深树序列化时 JSON 嵌套层级深。是否改为扁平存储（`nodes: Map<string, SessionNode>` + 每个 node 存 parentId）？ | 倾向扁平存储：`Session.nodes: Record<string, SessionNode>` + `Session.rootId: string` + `Session.currentNodeId: string`。序列化更简单，查找更快，避免深嵌套。 | 架构师 |
| 3 | **分支摘要的 LLM 调用** | 摘要功能需要调用 LLM 总结分支内容。这个调用用什么模型？是否额外消耗 token？是否需要用户确认？ | 使用当前 session 的模型生成摘要；摘要调用独立计费并提示用户；默认自动生成，可通过 config 配置为需确认。 | 产品 |
| 4 | **Extensions 的安全边界** | Extensions 是可执行 TypeScript 代码，agent 理论上可以自己修改 extension 文件（Phase 3 进化机制的基础）。Phase 2 是否允许 agent 通过 write/edit 工具修改 extension 文件？还是只允许用户手动修改？ | Phase 2 仅支持用户手动创建/修改 extension 文件 + 系统自动 hot-reload。Agent 通过 write/edit 修改 extension 文件不做限制（YOLO 模式一致性），但不在 Phase 2 主动引导 agent 这样做。Phase 3 再引入"agent 自我进化 extensions"。 | 产品 + 架构师 |
| 5 | **Extension 的 TypeScript 编译方案** | Extensions 是 .ts 文件，需要在运行时编译为 JS 执行。方案选择：(a) 使用 tsx/ts-node 运行时编译，(b) 预编译为 .js 后加载，(c) 使用 esbuild 动态编译。hot-reload 时需要重新编译。 | 倾向 esbuild 动态编译（速度快、API 简单），编译结果缓存在内存中。文件变化时重新编译并热替换。 | 架构师 |
| 6 | **Extensions 是否适合放在 Phase 2** | Extensions 系统（hot-reload + 动态编译 + 工具注册）有一定复杂度。如果 Phase 2 时间紧张，是否将 Extensions 降级为 P2 或推迟到 Phase 3？ | 建议保留在 Phase 2 但降级 Extensions 为 P1（非 P0），确保 Session Tree 和 Skills 增强优先完成。如果时间不足，Extensions 可推迟到 Phase 3 初期。 | 产品 |
| 7 | **Skill 执行记录的存储格式** | 执行记录存为 skill 目录下的 `executions.jsonl`。是否需要同时支持 SQLite 存储（为 Phase 3 进化评估做准备）？还是 Phase 2 先用 JSONL，Phase 3 再迁移？ | Phase 2 用 JSONL（简单、无额外依赖），Phase 3 引入 SQLite 时统一迁移。JSONL 格式设计时预留 SQLite 迁移的字段结构。 | 架构师 |
| 8 | **回退时是否自动 fork 新分支** | 回退到历史节点后继续对话时，新消息应该：(a) 追加到原节点之后（覆盖原路径），还是 (b) 自动 fork 新分支（保留原路径）？ | 方案 (b)——自动 fork 新分支，保留原路径。这符合"不丢失历史"原则，用户可随时 /jump 回原路径。回退时提示用户"原路径已保留"。 | 产品 |
| 9 | **Skill 附加文件在系统提示中的展示** | Level 2 要求 agent 知道 skill 有哪些附加文件可加载。是在系统提示中列出附加文件名（增加 token），还是只在 SKILL.md 中引用（agent 读 SKILL.md 后自然知道）？ | 只在 SKILL.md 中用相对路径引用附加文件（如"详见 `search-strategy.md`"），不在系统提示中列出。agent 读完 SKILL.md 后自然知道有哪些附加文件可用。 | 产品 + 架构师 |
| 10 | **Session Tree 的最大深度/分支数限制** | 是否需要限制 session tree 的最大深度或分支数量？无限制可能导致性能问题或用户迷失在分支中。 | 不做硬限制，但在 `/tree` 命令输出中对超过 10 个分支的情况做折叠显示。性能问题在出现后再优化。 | 产品 |
| 11 | **预装 Extension 的网络依赖** | web-search、arxiv-search 等 extension 依赖网络访问。是否需要处理离线场景？是否需要配置代理？ | Extension 内部处理网络错误（超时、DNS 失败等），返回友好错误信息。代理配置通过环境变量（HTTP_PROXY/HTTPS_PROXY）支持，不单独设计配置项。 | 架构师 |
| 12 | **Agent Loop 在分支节点的行为** | 当 agent 在分支中执行任务时，如果 agent 自主决定需要 fork（如"让我试试另一种方法"），是否允许 agent 自主 fork？还是只允许用户手动 fork？ | Phase 2 只允许用户手动 fork（通过 /branch 命令或明确指示）。Agent 可以建议用户 fork（如"如果你想探索另一个方案，可以使用 /branch 命令"），但不自主执行。Phase 3 进化机制中再考虑 agent 自主 fork。 | 产品 |

---

## 7. 验收标准（Phase 2 整体）

### 场景验收 1：分支探索实验方案

1. 用户在 session 中与 agent 讨论实验设计
2. Agent 建议两种方案，用户说"两个都试试"
3. 用户执行 `/branch 方案A-GUIDE-seq`，在分支中详细探索方案 A
4. 用户执行 `/summarize`，将方案 A 的讨论摘要合并到主线
5. 用户执行 `/jump` 回到主线
6. 用户执行 `/branch 方案B-CIRCLE-seq`，在分支中详细探索方案 B
7. 用户执行 `/summarize`，将方案 B 的讨论摘要合并到主线
8. 用户执行 `/jump` 回到主线，agent 综合两个方案给出建议
9. 用户执行 `/tree`，看到完整的探索树结构
10. 全程 context 只包含当前路径消息，不被分支细节膨胀

### 场景验收 2：Skill 完整加载与执行

1. 用户请求文献检索任务
2. Agent 加载 literature-search 的 SKILL.md（Level 1）
3. Agent 根据任务需要加载 search-strategy.md 附加文件（Level 2）
4. Agent 调用 search.py 脚本执行检索（Level 3）
5. Agent 调用 dedup.py 脚本去重（Level 3）
6. 执行记录写入 executions.jsonl
7. 全程工具调用过程对用户可见

### 场景验收 3：Extension 使用

1. 用户请求搜索最新的 CRISPR 相关 arXiv 论文
2. Agent 调用 arxiv-search extension 工具
3. 工具返回结构化的论文列表
4. Agent 基于结果生成综述
5. 用户修改 web-search.ts extension 文件
6. 修改后 <2s 内 hot-reload 生效，无需重启

### 场景验收 4：Phase 1 Session 向后兼容

1. 用户有一个 Phase 1 创建的线性 session
2. 在 Phase 2 CLI 中加载该 session
3. 线性消息列表自动转换为树形结构
4. 能正常继续对话，新增消息追加为叶子节点
5. 能对历史节点执行 fork / rollback 等操作

### 技术验收

- [ ] `pnpm build` 成功，无 TypeScript 类型错误
- [ ] Session Tree 的分支/回退/跳转/摘要功能正确
- [ ] Phase 1 线性 session 能正确转换为树形并继续使用
- [ ] Skill Level 2（附加文件加载）功能正确
- [ ] Skill Level 3（脚本调用）功能正确
- [ ] Skill 执行记录正确写入和查询
- [ ] 6 个预装 skill 全部可用（含附加文件和脚本）
- [ ] Extensions 加载和 hot-reload 功能正确
- [ ] 预装 extensions（web-search、arxiv-search）功能正确
- [ ] CLI 新增命令（/tree、/branch、/rollback、/jump、/summarize）功能正确
- [ ] Agent Loop 在树形 session 上正常工作
- [ ] 系统提示词 token 数仍在合理范围内（< 2000 token，含 extensions 工具说明）
- [ ] 所有现有测试通过 + Phase 2 新增测试通过

---

*本 PRD 将随开发进展持续迭代。如有疑问，请联系产品经理许清楚。*
