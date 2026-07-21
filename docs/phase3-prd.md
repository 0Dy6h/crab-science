# Crab-Science Phase 3 PRD — 进化机制（核心创新）

> **文档版本**：v1.0
> **日期**：2026-07-21
> **作者**：许清楚（产品经理）
> **状态**：待评审
> **Phase**：Phase 3 — 进化机制（核心创新）
> **预计周期**：3-4 周

---

## 1. 项目信息

| 维度 | 说明 |
|------|------|
| **项目名称** | crab-science |
| **Phase** | Phase 3 — 进化机制（核心创新） |
| **技术栈** | Turborepo + pnpm monorepo, TypeScript, Node.js, Ink 4.x, SQLite (better-sqlite3), isomorphic-git |
| **语言** | 中文 |
| **原始需求** | 实现三层进化体系（Skill 迭代 + Subagent 创建 + Knowledge 积累）+ Evolution Engine 调度 + SQLite 存储迁移，让 agent 越用越强 |

### Phase 3 范围边界

**包含**：
- Skill 层进化：执行记录 → 效果评估 → 优化建议 → 版本迭代 → 验证回滚
- Subagent 层进化：模式检测 → 草案生成 → 用户确认 → 自动委派 → 效果评估
- Knowledge 层进化：经验提取 → 知识图谱 → 相关经验检索注入
- Evolution Engine：定期评估调度器 + 三层进化协调
- 存储迁移：JSON/JSONL → SQLite（experiences、skill metrics、knowledge graph）
- 版本控制：Git 集成（skill/subagent 变更可追溯、可 diff、可回滚）
- 进化安全：自动回滚、用户确认、变更日志（CHANGELOG.md）
- CLI 进化相关命令与交互
- 新增 `packages/evolution-engine/` 和 `packages/storage/` 两个包
- agent-core 改造：集成进化引擎、subagent 委派、知识注入

**不包含**（后续 Phase）：
- 桌面应用（Tauri GUI + 进化可视化面板）→ Phase 4
- 知识图谱 D3.js 可视化 → Phase 4
- 进化时间线可视化 → Phase 4
- Agent 自主修改 extensions（Phase 3 保留 extensions hot-reload 但不主动引导 agent 自我修改）
- MCP 支持 → 不做

### Phase 2 → Phase 3 的关键变更

| 维度 | Phase 2 | Phase 3 |
|------|---------|---------|
| Skill 执行记录 | JSONL 文件（`executions.jsonl`） | SQLite + JSONL 双写（迁移过渡），最终 SQLite |
| Skill 版本管理 | frontmatter `version` 字段 | Git 版本控制 + CHANGELOG.md + 自动回滚 |
| Skill 效果评估 | 无 | 成功率/耗时趋势/满意度三维指标 + 阈值触发优化 |
| Skill 优化 | 手动编辑 SKILL.md | LLM 分析历史 → 生成优化建议 → Agent 审查 → 自动修改 + 验证 |
| Subagent | 无 | 透明 Subagent 系统（模式检测 → 创建 → 委派 → 评估） |
| Knowledge | 无 | Experience 提取 + 知识图谱 + 相关经验注入 context |
| 存储方案 | JSON 文件 + JSONL | SQLite（`~/.crab-science/crab-science.db`）+ Git 仓库 |
| Agent Context | 系统提示 + skills 元数据 + session 历史 | + 相关经验注入（knowledge injection） |
| 新增包 | — | `packages/evolution-engine/`、`packages/storage/` |
| CLI 命令 | tree/branch/rollback/jump/summarize/extensions/skill-history | + /evolve、/subagents、/knowledge、/versions、/rollback-skill |
| 进化 LLM 调用 | 无 | 使用便宜模型（如 DeepSeek / GPT-4o-mini / Claude Haiku）做进化分析 |

---

## 2. 产品目标

Phase 3 的核心使命是**让 agent 具备自我进化能力**——这是 Crab-Science 区别于所有竞品的灵魂。系统从每次任务执行中学习，自动优化 skills、创建 subagents、积累知识，形成"使用 → 学习 → 进化 → 更好用"的正反馈循环。

### 目标 1：Skill 自动迭代——使用 10 次后能自动优化

实现 Skill 进化的完整闭环：执行记录 → 效果评估（成功率 < 70% / 耗时上升 20% / 满意度 < 3.5 触发优化）→ LLM 分析历史生成优化建议 → Agent 审查采纳 → 修改 SKILL.md 版本号+1 → 后续任务验证 → 效果下降自动回滚。所有变更通过 Git 版本控制，可 diff、可追溯、可回滚。

**验收标准**：一个 skill 在被使用 10 次后（含成功和失败），系统自动评估效果指标，若指标低于阈值则触发优化流程，生成可审查的优化建议，采纳后 SKILL.md 自动更新版本号，并在后续执行中验证新版本效果——新版本更差时自动回滚到上一版本。

### 目标 2：Subagent 自动检测与创建——识别重复模式并专业化

实现 Subagent 进化的完整流程：系统监控所有任务执行记录，识别重复出现的任务模式（同类任务 ≥ 5 次 / 子任务产生 > 10K token / 用户显式请求 / Agent 主动建议），生成 subagent 定义草案，用户确认后创建透明 subagent（执行过程存储在 session tree 子分支中，可观测），后续任务自动委派，并评估委派准确率和任务完成率。

**验收标准**：当 agent 在多次任务中重复执行同类子任务（如数据分析）超过 5 次后，系统自动检测到模式并生成 subagent 草案；用户确认后 subagent 被创建；后续同类任务自动委派给该 subagent，执行过程在 session tree 子分支中完全可观测，只返回摘要给主 agent。

### 目标 3：Knowledge 经验积累——从任务中提取并复用经验

实现 Knowledge 进化：每次任务完成后自动提取 key learnings（结构化经验记录），存入 SQLite 并构建知识图谱（节点 = 经验，边 = 关联关系），新任务开始时自动检索相关经验注入 agent context。让 agent "记住"过去的经验教训，避免重复犯错。

**验收标准**：agent 执行完一个文献检索任务后，系统自动提取经验（如"semantic-scholar 在 'CRISPR safety' 关键词下结果较少，扩展到 'gene editing off-target' 后结果增加 3 倍"）；当 agent 下次遇到类似的文献检索任务时，相关经验被自动检索并注入 context，agent 参考历史经验执行。

### 目标 4：SQLite 存储迁移——为进化数据提供高效查询

将 Phase 2 的 JSON/JSONL 存储迁移到 SQLite，统一管理 experiences、skill metrics、knowledge graph 等进化数据。提供高效的范围查询、聚合统计和关联检索能力，为进化评估的数据分析奠定基础。同时保持 Phase 2 数据的向后兼容（自动迁移 JSONL → SQLite）。

**验收标准**：Phase 2 的 `executions.jsonl` 能自动迁移到 SQLite；进化评估查询（如"最近 10 次执行的平均耗时"）通过 SQL 高效完成；Session 和 Skill 文件仍保持文件系统存储（仅进化相关数据迁移到 SQLite）。

---

## 3. 用户故事

### US-1：Skill 自动优化（核心验证场景）

> **As a** 科研人员，
> **I want** literature-search skill 在被使用多次后自动变得更好（如检索策略优化、去重效率提升），
> **so that** 我不需要手动修改 SKILL.md，agent 会自己从失败中学习并改进——成功率从 60% 提升到 85%。

**涉及能力**：Skill 执行记录 → 效果评估 → LLM 优化建议 → Agent 审查 → 版本迭代 → 验证回滚

### US-2：Skill 版本回滚

> **As a** 科研人员，
> **I want** 当 skill 自动优化后效果变差时，系统能自动回滚到上一个好用的版本，
> **so that** 我不用担心自动进化会把 skill 改坏——系统有安全网。

**涉及能力**：Git 版本控制 + 自动回滚 + CHANGELOG.md

### US-3：Subagent 自动创建

> **As a** 科研人员，
> **I want** 当我反复让 agent 做数据分析任务时，系统能识别这个模式并建议创建一个专门的数据分析 subagent，
> **so that** 后续数据分析任务自动委派给专业 subagent，主 agent 的 context 不被数据分析细节膨胀。

**涉及能力**：模式检测 → 草案生成 → 用户确认 → Subagent 创建 → 自动委派

### US-4：透明 Subagent 执行

> **As a** 科研人员，
> **I want** 查看 subagent 的完整执行过程（每一步 read、bash、edit），而不是只看到一个黑盒结果，
> **so that** 我能理解 subagent 是怎么做数据分析的，建立信任，并在出错时定位问题。

**涉及能力**：透明 Subagent（执行过程存储在 session tree 子分支）+ CLI 可观测

### US-5：经验自动复用

> **As a** 科研人员，
> **I want** agent 记住我上次做文献检索时的经验教训（如某个数据库的 API 限流问题），
> **so that** 下次做类似任务时 agent 不会重复犯同样的错误，直接采用上次验证过的有效策略。

**涉及能力**：Experience 提取 → 知识图谱 → 相关经验检索 → Context 注入

### US-6：审查进化建议

> **As a** 科研人员，
> **I want** 在 skill 被自动修改前，看到具体的优化建议和 diff 预览，并可以接受或拒绝，
> **so that** 我对 agent 的自我进化保持掌控感——重大变更需要我的确认。

**涉及能力**：进化建议队列 + CLI diff 展示 + 用户确认机制

### US-7：查看进化历史

> **As a** 科研人员，
> **I want** 查看某个 skill 的进化历史（版本时间线、效果指标趋势、每次变更的原因和 diff），
> **so that** 我能理解 skill 是如何一步步改进的，并判断进化方向是否正确。

**涉及能力**：Git 版本历史 + CHANGELOG.md + CLI `/versions` 命令

### US-8：手动触发进化评估

> **As a** 科研人员，
> **I want** 在 CLI 中手动触发进化评估（而不是等自动触发），
> **so that** 我可以在完成一批任务后立即查看 skill 效果指标和优化建议，不必等待定时调度。

**涉及能力**：CLI `/evolve` 命令 + Evolution Engine 手动触发

---

## 4. 需求池

### P0：必须实现（核心功能）

| # | 需求 | 描述 | 验收标准 |
|---|------|------|---------|
| P0-1 | **SQLite 存储层** | 新增 `packages/storage/` 包，使用 better-sqlite3 实现 SQLite 存储层。数据库路径 `~/.crab-science/crab-science.db`。包含 experiences、skill_metrics、skill_versions、knowledge_edges 等表的 schema 设计和 CRUD 接口 | 数据库能正确创建和打开；所有表的 CRUD 接口功能正确；事务支持正确 |
| P0-2 | **JSONL → SQLite 数据迁移** | Phase 2 的 `executions.jsonl` 自动迁移到 SQLite 的 `skill_metrics` 表。迁移逻辑在首次启动 Phase 3 时执行，迁移后保留原始 JSONL 文件（备份） | Phase 2 的 executions.jsonl 数据完整迁移到 SQLite；迁移后进化评估查询从 SQLite 读取；原有 JSONL 文件保留不删除 |
| P0-3 | **Skill 执行记录增强** | Phase 2 的 `SkillExecutionRecord` 增加用户反馈字段（隐式：结果是否被采纳 `adopted: boolean`；显式：用户评分 `rating: number (1-5)`）。执行记录写入 SQLite 而非 JSONL | 执行记录包含用户反馈字段；记录正确写入 SQLite；可通过 SQL 查询指定 skill 的执行历史和指标 |
| P0-4 | **Skill 效果评估器** | 实现 `SkillMetricsEvaluator`：从 SQLite 查询指定 skill 的执行记录，计算三项指标（成功率、耗时趋势、满意度），判断是否需要优化。评估阈值：成功率 < 70%、耗时上升 20%、满意度 < 3.5/5 | 三项指标计算正确；阈值判断正确；评估结果包含指标数值和是否触发优化的布尔值 |
| P0-5 | **Skill 优化建议生成** | 实现 `SkillOptimizer`：当评估触发优化时，使用便宜 LLM 模型分析 skill 的历史执行记录（成功和失败案例），识别失败模式，生成具体的优化建议（指出 SKILL.md 哪些段落需要修改、如何修改）。优化建议结构化输出（段落定位 + 修改建议 + 理由） | LLM 能基于执行记录生成结构化优化建议；建议具体到 SKILL.md 的段落级别；建议包含修改理由 |
| P0-6 | **Skill 版本迭代（采纳 + 修改）** | Agent 审查优化建议后决定是否采纳。采纳时通过 `edit` 工具修改 SKILL.md，版本号 +1，更新 frontmatter 的 `lastUpdated`。修改后通过 Git commit 记录版本变更 | 采纳后 SKILL.md 正确修改；版本号递增；Git commit 包含变更原因；CHANGELOG.md 追加变更记录 |
| P0-7 | **Skill 版本控制（Git 集成）** | 使用 isomorphic-git 在 `~/.crab-science/` 下维护 Git 仓库，对 skills/ 和 subagents/ 目录进行版本控制。每次 skill/subagent 变更自动 commit。支持查看历史版本 diff 和回滚 | Git 仓库正确初始化；每次变更自动 commit；能查看指定文件的历史版本和 diff；能回滚到指定版本 |
| P0-8 | **Skill 验证与自动回滚** | 新版本 skill 在后续 N 次执行中（默认 N=3）对比新旧版本效果指标。新版本成功率/满意度显著下降（差值超过阈值）→ 自动回滚到上一版本，记录回滚原因 | 新旧版本效果对比正确；下降超过阈值时自动回滚；回滚操作记录在 CHANGELOG.md |
| P0-9 | **Subagent 模式检测器** | 实现 `SubagentPatternDetector`：监控所有任务执行记录，识别重复出现的任务模式（任务类型 + 工具使用模式 + 输出格式）。当同类模式出现 ≥ 5 次 → 触发 subagent 创建建议 | 能从执行记录中识别重复模式；模式频率统计正确；达到阈值时生成 subagent 草案 |
| P0-10 | **Subagent 定义与创建** | Subagent 定义为 Markdown 文件（`~/.crab-science/subagents/{name}.md`），含 frontmatter（name, description, mode, model, tools, metrics）和正文（角色定义、能力范围、工作流程）。用户确认草案后创建文件并加入注册表 | Subagent 文件格式正确；创建后能被 SubagentRegistry 发现和加载；frontmatter 解析正确 |
| P0-11 | **透明 Subagent 委派与执行** | 主 agent 根据 subagent 描述自动委派任务。Subagent 在独立 context window 中执行（继承主 agent 的工具权限），执行过程作为 session tree 的子分支存储（透明可观测），只返回摘要给主 agent | Subagent 能被正确委派；执行过程存储在 session tree 子分支；主 agent 只收到摘要；子分支可通过 `/tree` 查看 |
| P0-12 | **Experience 提取** | 实现 `ExperienceExtractor`：任务完成后，使用便宜 LLM 模型分析本次任务执行过程，提取结构化经验（key learnings、tags、outcome、duration）。经验记录写入 SQLite 的 `experiences` 表 | 能从任务执行过程中提取有意义的 key learnings；经验记录正确写入 SQLite；Experience 数据结构符合设计文档定义 |
| P0-13 | **知识图谱构建与检索** | Experience 存入时自动建立关联边（同领域 tags、同 skill、因果关系）。新任务开始时，根据任务描述检索相关经验（基于 tags 匹配 + 关联关系），将 top-K（默认 3）条经验的 key_learnings 注入 agent context | 知识图谱边正确建立；检索能找到与当前任务相关的历史经验；注入 context 的经验简洁且相关 |
| P0-14 | **Evolution Engine 调度器** | 实现 `EvolutionEngine`：定期评估调度器，按周期（每 N 次任务执行后，默认 N=10）或阈值触发各层进化评估。协调三层进化的执行顺序：Skill 评估 → Subagent 模式检测 → Knowledge 经验提取 | 调度器能按周期/阈值触发评估；三层进化按正确顺序执行；调度过程有日志输出 |
| P0-15 | **进化安全：用户确认机制** | 重大变更（删除执行步骤、改变核心流程、创建/删除 subagent）需要用户确认。小优化（调整参数描述、补充注意事项）可自动执行。确认通过 CLI 交互完成（展示 diff 预览，用户输入 y/n） | 重大变更触发用户确认流程；小优化自动执行；确认交互展示 diff 和变更摘要；用户拒绝时记录拒绝原因 |
| P0-16 | **agent-core 集成进化引擎** | Agent Loop 改造：任务完成后调用 EvolutionEngine（异步，不阻塞用户交互）。ContextBuilder 增强：构建 context 时注入相关经验。SystemPrompt 增强：增加 subagent 描述（progressive disclosure Level 0） | Agent Loop 集成进化引擎后正常工作；相关经验正确注入 context；Subagent 描述出现在系统提示中 |

### P1：应该实现（重要功能）

| # | 需求 | 描述 | 验收标准 |
|---|------|------|---------|
| P1-1 | **CHANGELOG.md 自动维护** | 每个 skill 目录下自动维护 `CHANGELOG.md`，记录所有版本变更（版本号、时间、变更类型、变更原因、变更摘要）。Subagent 目录同理 | CHANGELOG.md 格式规范；每次变更自动追加记录；记录包含完整的变更上下文 |
| P1-2 | **Subagent 效果评估** | 评估 subagent 的委派准确率（正确委派/总委派）和任务完成率（完成/委派）。低于阈值（准确率 < 80%、完成率 < 70%）→ 触发 subagent 优化或建议删除 | 评估指标计算正确；低于阈值时触发优化建议；优化建议包含 subagent 定义的修改方向 |
| P1-3 | **进化 LLM 模型配置** | 进化分析（优化建议生成、经验提取、subagent 草案生成）使用独立的 LLM 模型配置（`evolutionModel`），默认使用便宜模型（如 DeepSeek / GPT-4o-mini / Claude Haiku）。与任务执行模型分离，降低成本 | 进化分析使用独立模型；模型配置在 config.json 中可设置；成本追踪区分任务执行和进化分析 |
| P1-4 | **CLI `/evolve` 命令** | 手动触发进化评估。无参数时评估所有 skill/subagent；带参数时评估指定 skill（`/evolve literature-search`）。展示评估结果和优化建议 | 命令正确触发评估；评估结果清晰展示；优化建议可交互审查 |
| P1-5 | **CLI `/subagents` 命令** | 列出已创建的 subagent 及其状态（名称、描述、委派次数、效果指标）。支持查看详情（`/subagents data-analyzer`）和删除（`/subagents delete data-analyzer`） | 列表展示完整信息；详情视图包含 subagent 定义和效果指标；删除操作有确认提示 |
| P1-6 | **CLI `/knowledge` 命令** | 查看知识库状态：经验总数、最近提取的经验、按 tag 分类的经验统计。支持搜索（`/knowledge search CRISPR`） | 知识库概览信息正确；搜索结果按相关性排序；经验详情可查看 |
| P1-7 | **CLI `/versions [skill_name]` 命令** | 查看指定 skill 的版本历史（Git log），展示版本号、时间、变更摘要。支持查看 diff（`/versions literature-search --diff v3 v4`）和回滚（`/versions literature-search --rollback v3`） | 版本历史列表正确；diff 展示清晰；回滚操作有确认提示且记录在 CHANGELOG |
| P1-8 | **隐式用户反馈采集** | Agent 返回结果后，检测用户后续行为判断是否采纳：用户继续追问/基于结果操作 → adopted=true；用户说"不对"/"重新来" → adopted=false。无需用户显式评分 | 隐式反馈判断合理；采集的反馈写入执行记录；不影响正常对话流畅度 |
| P1-9 | **显式用户评分机制** | Agent 完成任务后，CLI 展示轻量评分提示（"本次结果如何？[1-5] 或跳过"），用户可快速评分或跳过。评分写入执行记录 | 评分提示不干扰正常使用；评分数据正确写入 SQLite；用户可跳过评分 |
| P1-10 | **Subagent 注册表** | `SubagentRegistry` 管理所有已创建的 subagent：发现（扫描 `~/.crab-science/subagents/`）、加载、查询、删除。类似 SkillLoader 的机制 | 注册表能正确发现和加载 subagent；查询接口高效；删除操作同步清理文件和注册表 |

### P2：可以实现（锦上添花）

| # | 需求 | 描述 | 验收标准 |
|---|------|------|---------|
| P2-1 | **CLI `/evolve status` 命令** | 查看进化引擎状态：上次评估时间、各 skill 当前指标、待处理的优化建议队列 | 状态信息完整；待处理建议队列清晰 |
| P2-2 | **进化通知** | 当进化引擎触发优化或创建 subagent 建议时，在 CLI 中展示通知（不阻塞当前对话） | 通知非阻塞；信息简洁；可点击查看详情 |
| P2-3 | **Skill 沙盒验证** | 新版本 skill 先在"测试模式"中验证（用历史任务重放），通过后再用于正式任务 | 测试模式能重放历史任务；验证结果有明确通过/失败判断 |
| P2-4 | **知识图谱可视化（CLI 版）** | 在 CLI 中以 ASCII 图形展示知识图谱的局部（当前任务相关经验及其关联） | ASCII 图形可读；关联关系清晰 |
| P2-5 | **Subagent 工具权限控制** | Subagent 的 frontmatter 中 `tools` 字段控制可用工具（如只读 subagent 只允许 read）。主 agent 委派时传递受限工具集 | 工具权限正确限制；受限 subagent 无法调用未授权工具 |
| P2-6 | **进化成本统计** | 统计进化分析消耗的 LLM token 和成本，在 CLI 状态栏或 `/evolve status` 中展示 | 成本统计准确；与任务执行成本分开展示 |
| P2-7 | **经验手动标注** | 用户可手动标注某条经验为"特别有用"或"过时"，影响检索排序权重 | 标注后检索排序变化；过时经验降权 |
| P2-8 | **Subagent 热重载** | 修改 subagent 定义文件后无需重启即可生效（类似 extensions hot-reload） | 修改后 <2s 内生效；旧 subagent 定义自动卸载 |

---

## 5. UI / 交互设计稿

### 5.1 进化评估结果展示（`/evolve` 命令）

```
> /evolve

  ═══════════════════════════════════════════════════════════
  🧬 进化评估报告  2026-07-21 15:30
  ═══════════════════════════════════════════════════════════

  📊 Skill 效果指标

  ┌─────────────────────┬────────┬──────────┬──────────┬────────┐
  │ Skill               │ 成功率 │ 平均耗时 │ 满意度   │ 状态   │
  ├─────────────────────┼────────┼──────────┼──────────┼────────┤
  │ literature-search   │  87%   │  45s     │ 4.2/5    │ ✅ 稳定 │
  │ data-analysis       │  62% ⚠│  78s     │ 3.1/5 ⚠ │ 🔴 需优化│
  │ paper-writing       │  91%   │  120s    │ 4.5/5    │ ✅ 稳定 │
  │ experiment-design   │  75%   │  65s     │ 3.8/5    │ ✅ 稳定 │
  │ citation-management │  100%  │  12s     │ 4.8/5    │ ✅ 稳定 │
  │ research-workflow   │  80%   │  90s     │ 3.9/5    │ ✅ 稳定 │
  └─────────────────────┴────────┴──────────┴──────────┴────────┘

  ⚠ 1 个 skill 需要优化:

  ┌─ 🔴 data-analysis ──────────────────────────────────────┐
  │ 成功率 62% (< 70% 阈值)                                  │
  │ 满意度 3.1/5 (< 3.5 阈值)                                │
  │                                                         │
  │ 📋 优化建议 (基于 13 次执行记录分析):                      │
  │                                                         │
  │ 1. [执行流程] 统计检验前缺少数据分布检查步骤               │
  │    → 建议在"执行分析"前增加"检查数据分布"步骤              │
  │    理由: 4/5 次失败案例因未检查正态分布导致 t-test 误用     │
  │                                                         │
  │ 2. [注意事项] 缺失值处理策略不明确                         │
  │    → 建议增加"缺失值超过 20% 时提示用户"的注意事项          │
  │    理由: 2 次失败案例因缺失值处理不当导致结果错误           │
  │                                                         │
  │ 是否采纳？[y] 采纳 [n] 拒绝 [d] 查看 diff [s] 跳过        │
  └─────────────────────────────────────────────────────────┘

  🤖 Subagent 模式检测

  ┌─ 📋 检测到重复模式 ─────────────────────────────────────┐
  │ 模式: 数据可视化任务 (matplotlib 图表生成)                │
  │ 频率: 7 次 (≥ 5 阈值)                                    │
  │ 平均 token: 8.2K                                         │
  │                                                         │
  │ 💡 建议创建 Subagent: data-visualizer                    │
  │                                                         │
  │ --- 草案 ---                                            │
  │ name: data-visualizer                                   │
  │ description: 专门生成科研论文级数据可视化图表              │
  │ tools: read, write, bash                                │
  │                                                         │
  │ 是否创建？[y] 创建 [n] 跳过 [e] 编辑草案                  │
  └─────────────────────────────────────────────────────────┘

  📚 Knowledge 经验库

  总经验数: 47 条
  最近提取: "semantic-scholar API 限流时改用 1s 间隔重试" (2 小时前)
  高频标签: 文献检索(12) 数据分析(8) 实验设计(5)

  ═══════════════════════════════════════════════════════════
```

### 5.2 Skill Diff 预览（`/evolve` → d）

```
  ┌─ 📝 data-analysis SKILL.md diff (v3 → v4) ──────────────┐
  │                                                         │
  │  ## 执行流程                                            │
  │                                                         │
  │  1. 理解用户的分析需求                                   │
  │  2. 读取数据文件                                        │
  │ +3. 检查数据分布（正态性检验、缺失值统计）                │  ← 新增
  │  4. 执行分析                                            │
  │  5. 生成可视化                                          │
  │  6. 返回结构化结果                                       │
  │                                                         │
  │  ## 注意事项                                            │
  │                                                         │
  │  - 统计检验前先检查数据分布                              │
  │ +- 统计检验前先检查数据分布                              │  ← 修改
  │ +  · 正态分布用参数检验（t-test, ANOVA）                 │  ← 新增
  │ +  · 非正态分布用非参数检验（Mann-Whitney, Kruskal-Wallis）│  ← 新增
  │ +- 缺失值超过 20% 时提示用户确认处理策略                  │  ← 新增
  │  - 可视化使用科研论文风格                                │
  │                                                         │
  │ 确认采纳此修改？[y/n]                                    │
  └─────────────────────────────────────────────────────────┘
```

### 5.3 透明 Subagent 执行展示

```
│  You: 对 data.csv 执行 t-test 并画箱线图                    │
│                                                             │
│  Crab: 这是个数据分析任务，我来委派给 data-analyzer subagent │
│  执行。                                                     │
│                                                             │
│  ┌─ 🤖 Subagent: data-analyzer ──────────────────────────┐  │
│  │ 📋 任务: 对 data.csv 执行 t-test 并画箱线图             │  │
│  │ ⏱ 开始执行...                                          │  │
│  │                                                        │  │
│  │ ┌─ 📄 read ───────────────────────────────────────┐   │  │
│  │ │ data.csv (245 行, 3 列)                          │   │  │
│  │ │ group,value,label                                │  │  │
│  │ │ A,23.5,control                                   │  │  │
│  │ │ ...                                              │  │  │
│  │ └──────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │ ┌─ 💻 bash ───────────────────────────────────────┐   │  │
│  │ │ $ python -c "from scipy import stats; ..."      │  │  │
│  │ │ t-statistic: 2.45, p-value: 0.018               │  │  │
│  │ │ → 差异显著 (p < 0.05)                            │  │  │
│  │ └──────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │ ┌─ ✏️ write ──────────────────────────────────────┐   │  │
│  │ │ boxplot.png (已生成)                              │  │  │
│  │ └──────────────────────────────────────────────────┘  │  │
│  │                                                        │  │
│  │ ✅ 完成 (耗时 12s)                                     │  │
│  │ 📝 摘要: t-test 结果显著 (p=0.018), 箱线图已保存       │  │
│  │    到 boxplot.png                                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  Crab: data-analyzer 完成了分析：                            │
│  - t-test 结果：t=2.45, p=0.018，组间差异显著                │
│  - 箱线图已保存到 boxplot.png                                 │
│  需要我进一步解释结果吗？                                     │
│                                                             │
```

### 5.4 经验注入提示

```
│  You: 帮我检索 CRISPR 基因编辑脱靶效应的文献                 │
│                                                             │
│  Crab: 我来帮你检索。                                       │
│                                                             │
│  ┌─ 📚 相关经验 (3 条) ──────────────────────────────────┐  │
│  │ 💡 "semantic-scholar 在 'CRISPR safety' 关键词下结果   │  │
│  │    较少，扩展到 'gene editing off-target' 后结果增加    │  │
│  │    3 倍" — 2 天前                                      │  │
│  │ 💡 "综述摘要控制在 400 字以内时用户采纳率更高"           │  │
│  │    — 5 天前                                            │  │
│  │ 💡 "semantic-scholar API 限流时改用 1s 间隔重试"        │  │
│  │    — 2 小时前                                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                             │
│  Crab: 根据历史经验，我将使用扩展关键词策略检索...           │
│  ...                                                        │
```

### 5.5 版本历史查看（`/versions` 命令）

```
> /versions literature-search

  📜 literature-search 版本历史

  ┌────────┬─────────────────────┬──────────────────────────────┐
  │ 版本   │ 时间                │ 变更摘要                      │
  ├────────┼─────────────────────┼──────────────────────────────┤
  │ v4 ●   │ 2026-07-21 14:30    │ 当前版本                      │
  │        │                     │ 优化: 增加扩展关键词策略       │
  │ v3     │ 2026-07-19 10:15    │ 优化: 增加 API 限流重试策略    │
  │ v2     │ 2026-07-18 16:00    │ 优化: 综述摘要长度限制 500 字  │
  │ v1     │ 2026-07-20 (初始)   │ 初始版本                      │
  └────────┴─────────────────────┴──────────────────────────────┘

  指标趋势:
  v1 → v2: 成功率 70% → 78% ↑  满意度 3.5 → 3.8 ↑
  v2 → v3: 成功率 78% → 82% ↑  满意度 3.8 → 4.0 ↑
  v3 → v4: 成功率 82% → 87% ↑  满意度 4.0 → 4.2 ↑

  命令: /versions literature-search --diff v3 v4  查看 diff
        /versions literature-search --rollback v3  回滚到 v3
```

### 5.6 知识库查看（`/knowledge` 命令）

```
> /knowledge

  📚 知识库概览

  总经验数: 47 条
  知识图谱节点: 47, 边: 89

  最近提取的经验:
  [1] "semantic-scholar API 限流时改用 1s 间隔重试"
      tags: [文献检索, API]  2 小时前  ⭐ 有用(2)
  [2] "t-test 要求正态分布，非正态用 Mann-Whitney"
      tags: [数据分析, 统计]  5 小时前
  [3] "实验设计需先确定样本量再招募受试者"
      tags: [实验设计]  1 天前

  高频标签:
  文献检索 (12)  数据分析 (8)  实验设计 (5)  论文写作 (4)

  命令: /knowledge search <关键词>  搜索经验
        /knowledge view <id>       查看经验详情
```

### 5.7 Subagent 列表（`/subagents` 命令）

```
> /subagents

  🤖 Subagent 列表

  ┌────────────────────┬──────────────────────┬────────┬──────────┐
  │ 名称               │ 描述                  │ 委派次数│ 完成率   │
  ├────────────────────┼──────────────────────┼────────┼──────────┤
  │ data-analyzer      │ 科研数据分析           │ 15     │ 87%  ✅  │
  │ data-visualizer    │ 数据可视化图表生成     │ 7      │ 91%  ✅  │
  └────────────────────┴──────────────────────┴────────┴──────────┘

  命令: /subagents <name>        查看详情
        /subagents delete <name>  删除 subagent
```

### 5.8 新增 CLI 斜杠命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `/evolve [skill_name]` | 手动触发进化评估（无参评估全部） | `/evolve` 或 `/evolve data-analysis` |
| `/evolve status` | 查看进化引擎状态和待处理建议 | `/evolve status` |
| `/subagents` | 列出已创建的 subagent | `/subagents` |
| `/subagents <name>` | 查看 subagent 详情 | `/subagents data-analyzer` |
| `/subagents delete <name>` | 删除 subagent | `/subagents delete data-visualizer` |
| `/knowledge` | 查看知识库概览 | `/knowledge` |
| `/knowledge search <keyword>` | 搜索经验 | `/knowledge search CRISPR` |
| `/knowledge view <id>` | 查看经验详情 | `/knowledge view exp_001` |
| `/versions <skill_name>` | 查看 skill 版本历史 | `/versions literature-search` |
| `/versions <skill_name> --diff <v1> <v2>` | 查看版本间 diff | `/versions literature-search --diff v3 v4` |
| `/versions <skill_name> --rollback <v>` | 回滚到指定版本 | `/versions literature-search --rollback v3` |

### 5.9 系统提示词变更

Phase 3 系统提示词在 Phase 2 基础上增加 subagent 描述和经验注入提示：

```
# 角色
你是 Crab-Science，一个可自我进化的科研 AI Agent...

# 可用工具
- read: 读取文件内容，支持 glob 模式
- write: 创建或覆盖文件
- edit: 精确编辑文件
- bash: 执行 shell 命令
- web-search: 搜索互联网          ← Extension
- arxiv-search: 搜索 arXiv 论文    ← Extension

# 可用技能（按需读取 SKILL.md）
- literature-search: 搜索和综述学术文献 (v4)
- data-analysis: 科研数据统计分析 (v3)
...

# 可用 Subagent（可委派任务）
- data-analyzer: 科研数据分析任务，包括统计检验、可视化
  适合: t-test/ANOVA/回归分析/数据清洗
- data-visualizer: 数据可视化图表生成
  适合: matplotlib/seaborn 图表绘制

# 相关经验（参考历史经验执行）
💡 "semantic-scholar 在 'CRISPR safety' 关键词下结果较少，
   扩展到 'gene editing off-target' 后结果增加 3 倍"
💡 "综述摘要控制在 400 字以内时用户采纳率更高"

# 工作原则
- 需要技能时用 read 工具加载 SKILL.md
- 遇到数据分析任务可委派给 data-analyzer subagent
- 参考相关经验中的 key learnings 优化执行策略
- 探索不同方案时可建议用户 fork 分支
...
```

### 5.10 项目目录结构（Phase 3 新增）

```
packages/
├── evolution-engine/          # 🆕 进化机制引擎
│   ├── src/
│   │   ├── index.ts                # 对外接口
│   │   ├── evolution-engine.ts     # 进化调度器
│   │   ├── skill/
│   │   │   ├── metrics-evaluator.ts    # Skill 效果评估
│   │   │   ├── skill-optimizer.ts      # 优化建议生成
│   │   │   ├── skill-versioner.ts      # 版本迭代 + Git
│   │   │   └── skill-validator.ts      # 验证 + 自动回滚
│   │   ├── subagent/
│   │   │   ├── pattern-detector.ts     # 模式检测
│   │   │   ├── subagent-creator.ts     # 草案生成 + 创建
│   │   │   ├── subagent-delegator.ts   # 委派 + 执行
│   │   │   └── subagent-evaluator.ts   # 效果评估
│   │   └── knowledge/
│   │       ├── experience-extractor.ts # 经验提取
│   │       ├── knowledge-graph.ts      # 知识图谱
│   │       └── knowledge-retriever.ts  # 经验检索注入
│   └── package.json
├── storage/                   # 🆕 SQLite 存储层
│   ├── src/
│   │   ├── index.ts
│   │   ├── database.ts             # SQLite 连接管理
│   │   ├── migrations/             # 数据库迁移
│   │   │   ├── 001_initial.ts      # 初始 schema
│   │   │   └── 002_jsonl_import.ts # JSONL → SQLite 迁移
│   │   ├── repositories/
│   │   │   ├── experience-repo.ts  # Experience CRUD
│   │   │   ├── skill-metrics-repo.ts
│   │   │   └── knowledge-repo.ts
│   │   └── git-manager.ts          # isomorphic-git 封装
│   └── package.json
├── agent-core/                # 改造：集成进化引擎
│   └── src/
│       ├── agent.ts                # + 进化引擎调用
│       ├── context-builder.ts      # + 经验注入
│       ├── system-prompt.ts        # + subagent 描述
│       ├── subagents/              # 🆕 Subagent 管理
│       │   ├── registry.ts
│       │   ├── types.ts
│       │   └── loader.ts
│       └── ...
└── ...

~/.crab-science/
├── crab-science.db            # 🆕 SQLite 数据库
├── .git/                      # 🆕 Git 仓库（skill/subagent 版本控制）
├── config.json                # + evolutionModel 配置
├── sessions/                  # （不变）
├── skills/                    # + CHANGELOG.md（每个 skill）
├── subagents/                 # 🆕 Subagent 定义文件
│   ├── data-analyzer.md
│   └── data-visualizer.md
└── extensions/                # （不变）
```

---

## 6. 待确认问题

| # | 问题 | 背景 | 建议方案 | 需要决策方 |
|---|------|------|---------|-----------|
| 1 | **SQLite 库选择：better-sqlite3 vs node:sqlite** | better-sqlite3 是成熟方案但需要原生编译；Node.js 22+ 内置了 `node:sqlite`（实验性）。Phase 3 用哪个？ | 倾向 better-sqlite3（成熟稳定、同步 API 简单、社区生态好）。node:sqlite 仍在实验阶段，等稳定后再迁移。 | 架构师 |
| 2 | **Git 实现：isomorphic-git vs 系统 git** | isomorphic-git 是纯 JS 实现，无需系统安装 git，但功能有限（不支持 merge 等）；系统 git 功能完整但增加外部依赖 | 倾向 isomorphic-git（Phase 3 只需要 commit/log/diff/checkout，不需要 merge/rebase）。纯 JS 实现避免外部依赖，符合极简哲学。 | 架构师 |
| 3 | **进化分析的 LLM 模型选择** | 进化分析（优化建议、经验提取、subagent 草案）需要 LLM 调用，额外消耗成本。用哪个模型？是否可配置？ | config.json 增加 `evolutionModel` 字段，默认使用便宜模型（如 DeepSeek / GPT-4o-mini / Claude Haiku）。用户可自行配置。进化成本单独统计。 | 产品 + 架构师 |
| 4 | **Skill 优化建议的采纳决策权** | 优化建议生成后，是 Agent 自主决定是否采纳，还是必须用户确认？设计文档说"Agent 审查建议决定是否采纳"，但安全章说"重大变更需要用户确认" | 分级处理：小优化（补充注意事项、调整描述）Agent 可自主采纳；重大变更（删除执行步骤、改变核心流程）必须用户确认。分级标准在 config.json 中可配置。 | 产品 |
| 5 | **Subagent 委派的触发机制** | 主 agent 如何知道何时应该委派给 subagent？是 LLM 自主判断（基于系统提示中的 subagent 描述），还是系统自动路由？ | LLM 自主判断——系统提示中包含 subagent 的 name + description + 适合场景，agent 像选择 skill 一样自主决定是否委派。保持极简，不引入额外路由逻辑。 | 产品 + 架构师 |
| 6 | **透明 Subagent 的 context 隔离实现** | Subagent 在独立 context 中执行，但执行过程要存储在 session tree 子分支中。如何实现？是创建一个新的 session 分支，还是有独立的 subagent session？ | Subagent 执行作为当前 session 的一个子分支（fork），分支标记为 `subagent` 类型。Subagent 的完整对话在这个分支中，主 agent 只收到摘要节点（type='summary'）。用户可通过 `/tree` 展开查看。 | 架构师 |
| 7 | **经验注入的 token 预算** | 相关经验注入 context 会增加 token 消耗。注入多少条经验？每条经验的 key_learnings 保留多少字？ | 默认注入 top-3 条相关经验，每条只注入 key_learnings（不超过 100 字/条）。总经验注入 token 预算控制在 < 500 token。可通过 config 配置。 | 产品 + 架构师 |
| 8 | **进化评估的触发时机** | 进化评估是同步执行（任务完成后立即评估，用户需等待）还是异步执行（后台评估，不阻塞用户）？ | 异步执行——任务完成后异步触发进化评估（不阻塞用户交互）。评估结果和优化建议通过通知或下次 `/evolve` 命令查看。进化评估失败不影响正常使用。 | 产品 + 架构师 |
| 9 | **Skill 版本验证的判定标准** | 新版本 skill 需要在多少次执行后判定效果？效果对比的具体标准是什么（成功率差值多少算"显著下降"）？ | 新版本执行 3 次后判定。成功率下降 > 15% 或满意度下降 > 0.5 → 自动回滚。验证期间标注为"验证中"状态。判定标准在 config.json 中可配置。 | 产品 + 架构师 |
| 10 | **JSONL → SQLite 迁移的时机和策略** | Phase 2 的 executions.jsonl 需要迁移到 SQLite。是首次启动 Phase 3 时一次性迁移，还是渐进式双写？ | 首次启动 Phase 3 时检测到旧 JSONL 文件 → 一次性迁移到 SQLite → 迁移后将 JSONL 文件重命名为 `.jsonl.migrated` 备份。后续新执行记录只写 SQLite。 | 架构师 |
| 11 | **Subagent 执行失败的处理** | Subagent 执行任务失败时如何处理？是返回错误给主 agent 让它自行处理，还是自动 fallback 到主 agent 执行？ | Subagent 返回失败摘要给主 agent，主 agent 决定是否自行重试或换策略。不自动 fallback（保持简单，避免复杂的重试逻辑）。 | 产品 |
| 12 | **知识图谱边的建立策略** | Experience 之间的关联边如何自动建立？基于 tags 完全匹配？还是需要 LLM 分析因果关系？ | Phase 3 用简单规则建立边：同 tag 的经验建立"同领域"边；同 skill 的经验建立"同技能"边。因果关系边暂不自动建立（需 LLM 分析，成本高），留到 Phase 4 优化。 | 产品 + 架构师 |
| 13 | **用户评分的采集频率** | 每次任务完成后都弹出评分提示会影响体验。评分采集频率如何设计？ | 默认每 3 次任务采集 1 次评分（可配置），避免频繁打扰。隐式反馈（结果是否采纳）每次自动采集不打扰用户。 | 产品 |
| 14 | **进化引擎与 Extensions 的关系** | Phase 3 的进化机制聚焦 skills/subagents/knowledge。Extensions 是否也纳入进化范围（agent 自动修改 extension 代码）？ | Phase 3 不主动引导 agent 修改 extensions（保持范围聚焦）。但技术上不阻止 agent 通过 write/edit 修改 extension 文件（Phase 2 已支持 hot-reload）。Extensions 进化留到后续 Phase。 | 产品 |
| 15 | **Subagent 的 model 继承策略** | Subagent frontmatter 中 `model: inherit` 表示继承主 agent 的模型。是否支持指定不同模型（如 subagent 用便宜模型）？ | Phase 3 支持 `model: inherit`（继承主 agent）和 `model: <具体模型名>`（指定模型）。默认 inherit，用户可在 subagent 定义中指定更便宜的模型用于简单任务。 | 产品 + 架构师 |

---

## 7. 验收标准（Phase 3 整体）

### 场景验收 1：Skill 自动优化全流程

1. 用户使用 data-analysis skill 执行 10 次数据分析任务（6 次成功，4 次失败）
2. 用户执行 `/evolve` 手动触发评估
3. 系统展示 data-analysis 的效果指标：成功率 60%（< 70% 阈值）
4. 系统展示 LLM 生成的优化建议（如"增加数据分布检查步骤"）
5. 用户输入 `d` 查看 diff 预览
6. 用户输入 `y` 采纳修改
7. SKILL.md 自动修改，版本号 v3 → v4
8. Git 自动 commit 变更
9. CHANGELOG.md 追加变更记录
10. 后续 3 次执行中，新版本成功率提升到 80% → 保留新版本
11. 用户执行 `/versions data-analysis` 查看版本历史和指标趋势

### 场景验收 2：Skill 自动回滚

1. literature-search skill 自动优化到 v4
2. 后续 3 次执行中，新版本成功率从 87% 下降到 60%（下降 > 15%）
3. 系统自动回滚到 v3
4. CHANGELOG.md 记录回滚操作和原因
5. 用户下次使用时，agent 使用 v3 版本的 skill
6. 用户执行 `/versions literature-search` 看到回滚记录

### 场景验收 3：Subagent 自动创建与委派

1. 用户在多次任务中让 agent 做数据可视化任务（matplotlib 图表生成）
2. 系统检测到该模式出现 7 次（≥ 5 阈值）
3. 用户执行 `/evolve` 时看到 subagent 创建建议
4. 系统展示 data-visualizer subagent 草案
5. 用户输入 `y` 确认创建
6. subagent 文件创建在 `~/.crab-science/subagents/data-visualizer.md`
7. 后续用户请求画图时，agent 自动委派给 data-visualizer
8. Subagent 执行过程在 session tree 子分支中完全可观测
9. 主 agent 只收到执行摘要
10. 用户执行 `/subagents` 查看 subagent 列表和效果指标

### 场景验收 4：知识经验复用

1. 用户执行文献检索任务，agent 使用扩展关键词策略成功检索
2. 任务完成后，系统自动提取经验："semantic-scholar 在 'CRISPR safety' 关键词下结果较少，扩展到 'gene editing off-target' 后结果增加 3 倍"
3. 经验写入 SQLite，建立知识图谱节点和边
4. 2 天后，用户再次请求 CRISPR 相关文献检索
5. 系统检索知识图谱，找到相关经验
6. 相关经验的 key_learnings 注入 agent context
7. Agent 参考历史经验，直接使用扩展关键词策略
8. 用户执行 `/knowledge` 查看知识库状态

### 场景验收 5：Phase 2 数据迁移

1. 用户有 Phase 2 创建的 skill 执行记录（executions.jsonl）
2. 升级到 Phase 3 后首次启动 CLI
3. 系统检测到旧 JSONL 文件，自动迁移到 SQLite
4. JSONL 文件重命名为 `.jsonl.migrated` 备份
5. 用户执行 `/evolve` 时，评估基于 SQLite 中的迁移数据
6. Phase 2 的所有 skill/session/extensions 功能正常

### 技术验收

- [ ] `pnpm build` 成功，无 TypeScript 类型错误
- [ ] 新增 `packages/evolution-engine/` 和 `packages/storage/` 两个包
- [ ] SQLite 数据库能正确创建、读写、迁移
- [ ] Phase 2 的 executions.jsonl 能自动迁移到 SQLite
- [ ] Skill 效果评估器正确计算三项指标
- [ ] Skill 优化建议能通过 LLM 生成并结构化输出
- [ ] Skill 版本迭代通过 Git commit 记录
- [ ] Skill 验证与自动回滚功能正确
- [ ] Subagent 模式检测能识别重复任务模式
- [ ] Subagent 创建、委派、执行功能正确
- [ ] 透明 Subagent 执行过程存储在 session tree 子分支
- [ ] Experience 提取能从任务中提取有意义的 key learnings
- [ ] 知识图谱检索能找到相关经验并注入 context
- [ ] Evolution Engine 调度器按周期/阈值触发评估
- [ ] 用户确认机制对重大变更正确触发
- [ ] CLI 新增命令（/evolve、/subagents、/knowledge、/versions）功能正确
- [ ] 进化分析使用独立模型配置
- [ ] 所有现有测试通过 + Phase 3 新增测试通过

---

*本 PRD 将随开发进展持续迭代。如有疑问，请联系产品经理许清楚。*
