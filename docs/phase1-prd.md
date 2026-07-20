# Crab-Science Phase 1 PRD — 极简内核 MVP

> **文档版本**：v1.0
> **日期**：2026-07-20
> **作者**：许清楚（产品经理）
> **状态**：待评审
> **Phase**：Phase 1（极简内核 MVP）
> **预计周期**：2-3 周

---

## 1. 项目信息

| 维度 | 说明 |
|------|------|
| **项目名称** | crab-science |
| **Phase** | Phase 1 — 极简内核 MVP |
| **技术栈** | Turborepo + pnpm monorepo, TypeScript, Node.js |
| **语言** | 中文 |
| **原始需求** | 跑通极简 agent loop，能对话、执行工具，在终端中执行科研任务（如文献检索） |

### Phase 1 范围边界

**包含**：
- Monorepo 项目结构搭建
- LLM Layer（OpenAI + Anthropic 双 provider）
- Agent Core（agent loop + 4 个核心工具）
- Session Manager（线性 session，不含 tree）
- CLI 交互界面
- 基础配置管理（config.json + API Key）
- 2-3 个预装科研 skills

**不包含**（后续 Phase）：
- Session Tree（分支/回退/跳转）→ Phase 2
- 进化机制（Skill/Subagent/Knowledge 进化）→ Phase 3
- 桌面应用（Tauri GUI）→ Phase 4
- Extensions 系统 → Phase 2
- Subagent 系统 → Phase 2/3
- MCP 支持 → 不做（极简优先）

---

## 2. 产品目标

Phase 1 的核心使命是**验证技术可行性**——证明极简内核可以驱动科研任务执行。

### 目标 1：跑通极简 Agent Loop

构建一个"输入 → LLM 推理 → 工具执行 → 结果回注 → 循环"的完整 agent loop。系统提示词控制在 <1500 token，核心工具仅 4 个（read/write/edit/bash），参考 Pi Agent 的极简哲学。Agent 必须能自主决定何时调用工具、调用哪个工具，并在工具返回结果后继续推理直到任务完成。

**验收标准**：给定一个科研任务（如"检索 CRISPR 基因编辑安全性相关文献"），agent 能自主完成多步工具调用并返回结构化结果。

### 目标 2：双 Provider 可切换的 LLM 抽象层

实现 OpenAI 和 Anthropic 两个 provider 的统一抽象层，支持流式响应（SSE）和工具调用（function calling）。用户通过配置文件指定默认 provider 和模型，可在 session 中通过命令切换。两个 provider 的接口差异（消息格式、工具调用格式、流式协议）对上层完全透明。

**验收标准**：同一个科研任务，用 OpenAI 和 Anthropic 各执行一次，agent loop 代码无需任何修改。

### 目标 3：终端可用的科研 Agent CLI

实现一个终端交互界面（TUI），让科研人员能在终端中与 agent 对话、观察工具执行过程、查看结果。CLI 必须做到**完全可观测**——每一次 read/write/edit/bash 调用及其结果都对用户可见。预装 2-3 个科研 skills，使 agent 开箱即用具备文献检索等基础科研能力。

**验收标准**：一个从未使用过 Crab-Science 的科研人员，配置好 API Key 后，能在 5 分钟内通过 CLI 完成一次文献检索任务。

---

## 3. 用户故事

### US-1：文献检索（核心验证场景）

> **As a** 科研人员，
> **I want** 在终端中输入"帮我检索 CRISPR 基因编辑脱靶效应的最新文献"并得到结构化的文献列表，
> **so that** 我能快速了解某个研究领域的前沿进展，而不需要手动在多个数据库间切换。

**涉及能力**：agent loop + bash 工具（调用检索脚本/API）+ read 工具（读取结果）+ write 工具（保存综述）+ literature-search skill

### US-2：多模型灵活切换

> **As a** 科研人员，
> **I want** 在对话过程中切换 LLM（如从 GPT-4o 切换到 Claude Sonnet），
> **so that** 我能根据任务特点选择最合适的模型——推理强的用于实验设计，速度快的用于简单检索。

**涉及能力**：LLM Layer 多 provider 抽象 + CLI 模型切换命令 + config 配置

### US-3：透明的工具执行过程

> **As a** 科研人员，
> **I want** 看到 agent 执行的每一步操作（读了哪个文件、执行了什么命令、修改了什么），
> **so that** 我能理解 agent 的推理过程，建立信任，并在出错时快速定位问题。

**涉及能力**：CLI 工具调用可视化 + 完整可观测设计哲学

### US-4：科研数据快速分析

> **As a** 科研人员，
> **I want** 让 agent 读取我的实验数据 CSV 文件，执行统计分析并生成可视化图表，
> **so that** 我能快速从原始数据中得到分析结论，而不需要自己写 Python 脚本。

**涉及能力**：read 工具 + bash 工具（执行 Python 脚本）+ write 工具（保存图表）+ data-analysis skill

### US-5：零配置快速启动

> **As a** 科研人员，
> **I want** 安装后只需配置一个 API Key 就能开始使用，
> **so that** 我不需要理解复杂的技术配置就能上手。

**涉及能力**：config.json 配置 + API Key 管理 + 预装 skills + CLI 引导

---

## 4. 需求池

### P0：必须实现（MVP 核心）

| # | 需求 | 描述 | 验收标准 |
|---|------|------|---------|
| P0-1 | **Monorepo 结构搭建** | 使用 Turborepo + pnpm 搭建 monorepo，包含 `packages/agent-core`、`packages/llm-layer`、`packages/shared`、`apps/cli` 四个包 | `pnpm install && pnpm build` 成功，包间依赖正确解析 |
| P0-2 | **LLM Provider 抽象层** | 定义 `LLMProvider` 接口（`complete` 方法，支持流式 + 工具调用），实现 OpenAI 和 Anthropic 两个 provider | 接口统一，两个 provider 可互换调用，流式 token 实时输出 |
| P0-3 | **OpenAI Provider 实现** | 使用 OpenAI SDK（或直接 fetch），支持 GPT-4o / GPT-4o-mini 等模型，流式响应 + function calling | 能发起流式请求，正确解析 tool_calls，返回标准化的流式响应 |
| P0-4 | **Anthropic Provider 实现** | 使用 Anthropic SDK，支持 Claude Sonnet/Opus 等模型，流式响应 + tool use | 能发起流式请求，正确解析 tool_use blocks，返回标准化的流式响应 |
| P0-5 | **Agent Loop 实现** | 核心循环：构建 context → 调用 LLM → 解析响应 → 执行工具 → 结果回注 → 循环，直到无工具调用时返回最终响应 | 能处理多轮工具调用，正确终止循环，支持流式输出中间结果 |
| P0-6 | **read 工具** | 读取文件内容，支持 glob 模式匹配（如 `**/*.csv`），返回文件路径 + 内容 | 能读取单文件，能 glob 匹配多文件并返回列表，大文件有合理截断 |
| P0-7 | **write 工具** | 创建或完全覆盖文件，自动创建不存在的父目录 | 能创建新文件，能覆盖已有文件，路径不存在时自动 mkdir |
| P0-8 | **edit 工具** | 精确编辑文件：`old_string → new_string`，要求 old_string 在文件中唯一匹配，不匹配时报错 | 能精确替换，匹配多处时报错提示，不匹配时报错提示 |
| P0-9 | **bash 工具** | 执行 shell 命令，在指定工作目录内执行，返回 stdout + stderr + exit code，支持超时控制 | 能执行命令并返回完整输出，超时自动终止，工作目录正确 |
| P0-10 | **Session Manager（线性）** | 管理单条线性 session（消息列表），支持追加消息、持久化到 JSON 文件、从文件恢复 | 能保存/恢复 session，消息历史完整，重启后可继续对话 |
| P0-11 | **系统提示词构建** | 构建 <1500 token 的系统提示词，包含 agent 角色定义 + 4 个工具说明 + 已安装 skills 的 name + description（progressive disclosure Level 0） | 系统提示词 token 数 < 1500，skills 元数据正确注入，agent 能识别可用 skills |
| P0-12 | **CLI 交互界面** | 终端交互界面：输入框、流式输出、工具调用可视化、状态栏（模型/Token/Cost） | 能交互式输入，流式显示响应，工具调用过程可见，状态信息实时更新 |
| P0-13 | **配置管理** | `~/.crab-science/config.json` 管理默认 provider、模型、API Key（环境变量或配置文件）、工作目录 | 能读取配置，API Key 支持环境变量优先，配置缺失时有友好提示 |
| P0-14 | **预装 Skill：literature-search** | 文献检索 skill，SKILL.md 包含检索策略、多数据库使用方法、综述生成流程 | Agent 识别到文献检索意图时自动加载此 skill，能完成一次完整的文献检索任务 |
| P0-15 | **预装 Skill：data-analysis** | 数据分析 skill，SKILL.md 包含统计检验方法、可视化风格、数据清洗流程 | Agent 识别到数据分析意图时自动加载此 skill，能完成一次基本的数据分析任务 |
| P0-16 | **Skill 加载机制（Progressive Disclosure Level 0-1）** | Level 0：skill name+description 注入系统提示；Level 1：agent 按需读取 SKILL.md 完整内容 | 系统提示中包含 skill 元数据，agent 能通过 read 工具加载完整 skill 内容 |

### P1：应该实现（重要但非阻塞）

| # | 需求 | 描述 | 验收标准 |
|---|------|------|---------|
| P1-1 | **预装 Skill：paper-writing** | 论文撰写辅助 skill | Agent 能辅助生成论文段落、管理引用 |
| P1-2 | **Token 和成本追踪** | 追踪每次 LLM 调用的 input/output token 数和估算成本，在状态栏显示 | 实时显示累计 token 和成本，支持不同 provider 的定价计算 |
| P1-3 | **Session 列表与恢复** | CLI 启动时列出历史 session，可选择恢复继续 | 能列出历史 session，选择后恢复完整上下文继续对话 |
| P1-4 | **错误处理与重试** | LLM 调用失败（网络/限流/超时）时自动重试，工具执行失败时 agent 能感知并调整策略 | 网络错误自动重试（指数退避），工具失败结果正确回注给 agent |
| P1-5 | **CLI 斜杠命令** | 支持基本命令：`/model` 切换模型、`/clear` 新建 session、`/skills` 列出已安装 skills、`/help` 帮助 | 命令正确执行，有合理的参数提示和错误提示 |
| P1-6 | **流式输出渲染** | LLM 流式响应实时渲染到终端，支持 Markdown 基本格式（代码块、列表、加粗） | 流式输出流畅无卡顿，代码块有语法高亮，Markdown 格式正确渲染 |
| P1-7 | **工作目录管理** | CLI 启动时指定工作目录（默认当前目录），所有文件操作限制在此目录内 | 工具操作被限制在工作目录内，路径越界时有提示 |

### P2：可以实现（锦上添花）

| # | 需求 | 描述 | 验收标准 |
|---|------|------|---------|
| P2-1 | **彩色终端输出** | 不同类型消息（用户/agent/工具/错误）使用不同颜色区分 | 颜色区分清晰，支持自动检测终端颜色支持 |
| P2-2 | **命令历史** | 上/下方向键浏览历史输入 | 能浏览和复用历史输入 |
| P2-3 | **多行输入支持** | 支持 `\` 换行或多行粘贴 | 多行输入正确处理，不误触发发送 |
| P2-4 | **Session 导出** | 将 session 导出为 Markdown 文件 | 导出文件格式清晰可读 |
| P2-5 | **全局与项目级 Skills 分层** | `~/.crab-science/skills/`（全局）和 `项目/.crab-science/skills/`（项目级）两层 skill 发现 | 两层 skills 都能被正确发现和加载，项目级优先 |
| P2-6 | **自动补全** | 斜杠命令和文件路径的自动补全 | Tab 键触发补全，体验流畅 |

---

## 5. CLI 界面设计稿

### 5.1 整体布局（参考 Pi Agent TUI 风格）

```
┌─────────────────────────────────────────────────────────────┐
│  Crab-Science v0.1.0          [Claude Sonnet] [12.4K] [$0.03]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You: 帮我检索 CRISPR 基因编辑脱靶效应的最新文献             │
│                                                             │
│  Crab: 我来帮你检索 CRISPR 基因编辑脱靶效应的相关文献。      │
│  首先加载文献检索技能...                                     │
│                                                             │
│  ┌─ read ────────────────────────────────────────────────┐  │
│  │ 📄 skills/literature-search/SKILL.md                  │  │
│  │ (skill 内容已加载)                                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  根据检索策略，我将使用 Semantic Scholar API 搜索相关论文。  │
│                                                             │
│  ┌─ bash ─────────────────────────────────────────────────┐ │
│  │ $ python -c "import requests; ..."                     │ │
│  │ 找到 23 篇相关论文                                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  以下是检索结果中相关性最高的 5 篇论文：                     │
│                                                             │
│  1. **Off-target effects of CRISPR-Cas9...** (2025)        │
│     - 作者: Zhang et al.                                    │
│     - 摘要: 本研究系统评估了...                              │
│                                                             │
│  2. **Genome-wide analysis of...** (2024)                   │
│     ...                                                     │
│                                                             │
│  需要我生成文献综述吗？                                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  > 输入消息... (Shift+Enter 换行, /help 查看命令)           │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 交互元素说明

| 元素 | 说明 |
|------|------|
| **顶部状态栏** | 显示版本号、当前模型、累计 Token 数、累计成本 |
| **对话区** | 用户消息（`You:`）和 Agent 响应（`Crab:`）交替展示，支持 Markdown 渲染 |
| **工具调用块** | 折叠式展示，标注工具类型图标（📄 read / ✏️ write / 🔧 edit / 💻 bash），显示工具参数和结果摘要 |
| **输入框** | 底部固定，`>` 提示符，支持斜杠命令、Shift+Enter 多行输入 |
| **流式渲染** | Agent 响应逐 token 流式输出，用户可实时看到"正在打字"的效果 |

### 5.3 斜杠命令

| 命令 | 功能 | 示例 |
|------|------|------|
| `/model [name]` | 切换模型（不传参则列出可用模型） | `/model gpt-4o` |
| `/clear` | 新建 session | `/clear` |
| `/skills` | 列出已安装 skills | `/skills` |
| `/session list` | 列出历史 session | `/session list` |
| `/session load [id]` | 加载历史 session | `/session load sess_001` |
| `/config` | 查看当前配置 | `/config` |
| `/help` | 查看帮助 | `/help` |
| `/exit` | 退出 | `/exit` |

### 5.4 工具调用可视化规范

工具调用是"完全可观测"哲学的核心体现。每次工具调用必须展示：

```
┌─ {tool_name} ──────────────────────────────┐
│ {参数摘要}                                   │
│ {结果摘要（截断显示，完整结果可展开）}        │
└─────────────────────────────────────────────┘
```

- **read**：显示读取的文件路径 + 内容行数 + 前 N 行预览
- **write**：显示写入的文件路径 + 写入内容行数
- **edit**：显示编辑的文件路径 + old_string → new_string 的 diff
- **bash**：显示执行的命令 + stdout/stderr 前 N 行 + exit code

### 5.5 启动流程

```
$ npx crab-science

  ██████ ██████  ███████ ███████     ██  ██████
 ██      ██   ██ ██      ██          ██  ██   ██
 ██      ██████  █████   ███████     ██  ██████
 ██      ██   ██ ██           ██     ██  ██   ██
  ██████ ██   ██ ███████ ███████     ██  ██   ██

  Crab-Science v0.1.0 — 可自我进化的科研 AI Agent

  [1/3] 检查配置...
  [2/3] 加载 skills (3 个)...
  [3/3] 连接 LLM (Claude Sonnet)...

  ✅ 就绪！输入你的科研任务，或输入 /help 查看帮助。

  > _
```

---

## 6. 待确认问题

| # | 问题 | 背景 | 建议方案 | 需要决策方 |
|---|------|------|---------|-----------|
| 1 | **TUI 实现技术选型** | 需要一个终端 UI 库来实现流式渲染、折叠块、颜色等。选项：ink（React for CLI）、blessed/neo-blessed、@clack/prompts + 自渲染、raw ANSI | 倾向 ink（React 生态一致、组件化、社区活跃），但需确认包体积和性能 | 架构师 |
| 2 | **OpenAI/Anthropic SDK 选择** | 使用官方 SDK（openai / @anthropic-ai/sdk）还是直接 fetch？官方 SDK 体积较大但功能完整，直接 fetch 轻量但需自行处理流式协议 | 倾向官方 SDK（稳定性优先），Phase 1 不追求极致包体积 | 架构师 |
| 3 | **Skill 中的可执行脚本如何调用** | literature-search skill 可能需要调用外部 API（Semantic Scholar、arXiv）。Phase 1 是否预装对应的 CLI 工具/脚本，还是让 agent 用 bash + Python 临时调用？ | 倾向后者——skill 的 SKILL.md 中写明 API 调用方法，agent 用 bash 工具执行 Python/curl 调用，保持极简不预装二进制 | 产品 + 架构师 |
| 4 | **API Key 存储方式** | 环境变量（CRAB_SCIENCE_OPENAI_API_KEY）还是 config.json 明文存储？科研人员可能不熟悉环境变量 | 优先环境变量，config.json 中存 provider/model 等非敏感配置；首次运行时引导用户设置环境变量 | 产品 |
| 5 | **Agent Loop 最大迭代次数** | 防止 agent 无限循环调用工具，需要设置最大迭代次数。太低会截断复杂任务，太高有成本风险 | 建议默认 50 次，可通过 config 配置，达到上限时提示用户 | 架构师 |
| 6 | **bash 工具的安全边界** | YOLO 模式下不做权限弹窗，但 Phase 1 是否需要基本的命令过滤（如阻止 `rm -rf /`）？还是完全信任 agent？ | Phase 1 采用 YOLO 模式（参考 Pi Agent），不做权限弹窗；通过工作目录限制将影响范围控制在项目目录内；后续 Phase 考虑容器化 | 产品 |
| 7 | **流式输出中工具调用的处理** | 流式响应中，LLM 可能在文本还没输出完时就发起工具调用。如何处理文本 + 工具调用的混合流式输出？ | 需要确认 OpenAI 和 Anthropic 的流式工具调用协议，设计统一的流式事件解析器 | 架构师 |
| 8 | **第三个预装 Skill 的选择** | 已确定 literature-search 和 data-analysis。第三个选 paper-writing、experiment-design 还是 citation-management？ | 倾向 paper-writing（与前两个形成"检索→分析→撰写"的科研闭环）| 产品 |
| 9 | **Session 存储格式** | Session JSON 存储在 `~/.crab-science/sessions/` 下。是否需要在 Phase 1 就支持 session 的增量写入（避免大 session 的全量序列化）？ | Phase 1 采用全量序列化（简单优先），每个 session 一个 JSON 文件；Phase 2 引入 tree 后再优化 | 架构师 |
| 10 | **错误恢复策略** | Agent 执行到一半时用户 Ctrl+C 中断，session 状态如何保存？下次能否恢复到中断点？ | 建议：Ctrl+C 时保存当前 session（包含已执行的工具调用），下次可恢复继续 | 产品 + 架构师 |

---

## 7. 验收标准（Phase 1 整体）

### 场景验收：文献检索全流程

1. 用户安装 crab-science，配置 Anthropic API Key
2. 启动 CLI，看到欢迎界面和就绪状态
3. 输入："帮我检索 CRISPR 基因编辑脱靶效应的最新文献，找 5 篇最重要的"
4. Agent 自动加载 literature-search skill
5. Agent 通过 bash 工具调用 Semantic Scholar API 检索文献
6. Agent 通过 read 工具读取检索结果
7. Agent 通过 write 工具将结果保存为 Markdown 文件
8. Agent 返回结构化的文献列表摘要
9. 全程工具调用过程对用户可见
10. 用户输入 `/model gpt-4o` 切换模型，继续追问，agent 无缝切换

### 技术验收

- [ ] `pnpm build` 成功，无 TypeScript 类型错误
- [ ] OpenAI 和 Anthropic 两个 provider 均能正常完成流式对话 + 工具调用
- [ ] 4 个核心工具（read/write/edit/bash）功能正确，边界情况有处理
- [ ] 系统提示词 < 1500 token
- [ ] CLI 能正常启动、交互、退出
- [ ] Session 能保存和恢复
- [ ] 3 个预装 skills 能被正确发现和按需加载
- [ ] 配置文件读写正确，API Key 通过环境变量管理

---

*本 PRD 将随开发进展持续迭代。如有疑问，请联系产品经理许清楚。*
