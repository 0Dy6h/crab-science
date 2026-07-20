# Crab-Science 项目设计原型文档

> **版本**：v0.1 Draft
> **日期**：2026-07-20
> **状态**：设计原型阶段
> **作者**：螃蟹大王 × 设计原型专家团

---

## 目录

1. [产品概述](#1-产品概述)
2. [竞品分析](#2-竞品分析)
3. [设计哲学](#3-设计哲学)
4. [核心创新：进化机制](#4-核心创新进化机制)
5. [系统架构](#5-系统架构)
6. [技术栈选型](#6-技术栈选型)
7. [功能模块设计](#7-功能模块设计)
8. [桌面应用架构](#8-桌面应用架构)
9. [数据模型](#9-数据模型)
10. [项目结构](#10-项目结构)
11. [开发路线图](#11-开发路线图)
12. [开放问题](#12-开放问题)

---

## 1. 产品概述

### 1.1 一句话定义

Crab-Science 是一个**可自我进化的科研 AI Agent Harness**——极简的内核，通过进化机制让 agent 自动迭代 skills 和 subagents，越用越强。

### 1.2 产品定位

| 维度 | 描述 |
|------|------|
| **产品类型** | 全栈桌面应用（Agent Harness / Agent Framework） |
| **目标用户** | 科研人员（非技术背景但理解科研方法论） |
| **核心价值** | 极简的交互 + 自动进化的能力 = 越用越强的科研助手 |
| **差异化** | 唯一具备"自我进化机制"的 agent harness |

### 1.3 核心理念

```
极简的内核（参考 Pi Agent）
    +
进化的机制（Crab-Science 原创）
    =
越用越强的科研助手
```

**Crab-Science 不做"功能最全"的 agent 工具，而做"最会成长"的 agent 工具。**

传统的 agent harness 是静态的——用户拿到什么功能就是什么功能。Crab-Science 是动态的——它会从每次任务执行中学习，自动优化自己的 skills 和 subagents，形成"使用 → 学习 → 进化 → 更好用"的正反馈循环。

### 1.4 品牌名由来

- **Crab（螃蟹）**：横着走，不走寻常路——象征探索精神和非线性思维
- **Science**：严谨的科研内核
- 螃蟹看书的形象：不走寻常路的求知者

---

## 2. 竞品分析

### 2.1 竞品概览

| 产品 | 开发者 | 语言 | 架构特点 | 核心哲学 |
|------|--------|------|---------|---------|
| **Pi Agent** | Mario Zechner | TypeScript | 4包分层（pi-ai/pi-agent-core/pi-tui/pi-coding-agent） | 极简 + 可扩展 + 完全可观测 |
| **Claude Code** | Anthropic | TypeScript | Orchestrator-Worker + Skills/Subagents | 功能全面 + 生态封闭 |
| **OpenCode** | SST→Charmbracelet | Go + TS | Client/Server（HTTP后端 + TUI前端） | 开源 + 多模型 + 多客户端 |
| **Codex CLI** | OpenAI | - | - | OpenAI 模型生态绑定 |

### 2.2 关键特性对比

| 特性 | Pi Agent | Claude Code | OpenCode | Crab-Science（目标） |
|------|---------|-------------|---------|---------------------|
| **系统提示词大小** | <1000 token | ~10K+ token | ~5K+ token | <1500 token |
| **核心工具数** | 4（read/write/edit/bash） | 10+ | 8+ | 4+（极简基础 + 可扩展） |
| **Subagents** | ❌ 拒绝（黑盒） | ✅ 独立context | ✅ 声明式配置 | ✅ **可自动进化** |
| **Skills** | ❌ 用 extensions 替代 | ✅ progressive disclosure | ❌ 用 agents 配置 | ✅ **可自动迭代** |
| **Session 管理** | Tree 结构（分支/回退） | 线性 | 线性 + 多session | Tree 结构（参考 Pi） |
| **Extensions** | ✅ TypeScript hot-reload | ❌ | ❌ | ✅ **Agent 可自己修改** |
| **可观测性** | ✅ 完全透明 | ❌ subagent 黑盒 | ✅ 较透明 | ✅ 完全透明 |
| **权限模式** | YOLO（容器化安全） | 审批弹窗 | allow/deny/ask | YOLO + 容器化（参考 Pi） |
| **MCP 支持** | ❌ 拒绝（用CLI替代） | ✅ | ✅ | ❌ 拒绝（极简优先） |
| **多模型支持** | ✅ BYOM | ❌ 仅 Claude | ✅ 75+ providers | ✅ BYOM |
| **进化机制** | ❌ | ❌ | ❌ | ✅ **核心创新** |
| **桌面应用** | ❌ TUI only | ❌ CLI only | ✅ 有桌面版 | ✅ **全栈桌面应用** |
| **目标场景** | 通用编码 | 通用编码 | 通用编码 | **科研场景** |

### 2.3 从竞品中学到什么

#### 从 Pi Agent 学到（主要参考）

1. **极简是力量**：4 个工具 + <1000 token 系统提示，在 TerminalBench 上排名第二。证明 frontier 模型已经通过 RL 学会了 agent 任务，不需要冗长的提示词。
2. **Session Trees**：会话可以分支、回退、跳转。这让 agent 的试错成本大大降低——探索失败可以 fork 到侧分支，不污染主 context。
3. **Extensions Hot-Reload**：Agent 可以读写修改自己的 extensions（TypeScript 文件），修改后立即生效。这是"自我进化"的雏形。
4. **完全可观测**：看到 agent 的每一次 read、bash、edit。拒绝 subagent 黑盒。
5. **YOLO 模式**：不做权限弹窗（安全剧场），用容器化做真正的安全。
6. **BYOM**：Bring Your Own Model，多 provider 支持，不绑定单一模型。

#### 从 Claude Code 学到

1. **Skills 的 Progressive Disclosure**：skill 元数据（name + description）始终在系统提示中，完整内容按需加载。这是 context 管理的好方法。
2. **Subagent 的 Context 隔离**：subagent 在独立 context window 中工作，只返回摘要，避免主 context 污染。
3. **四层记忆体系**：CLAUDE.md（项目配置）+ Skills（可复用指令）+ Hooks（自动化触发）+ Subagents（并行执行）。

#### 从 OpenCode 学到

1. **Client/Server 架构**：TUI/桌面/IDE 都可以连接同一个后端服务，支持远程操作。
2. **声明式 Agent 配置**：通过 JSON 或 Markdown 文件定义 agent，无需写代码。
3. **权限系统**：allow/deny/ask 三级权限，可按命令粒度控制。
4. **LSP 集成**：利用语言服务器获取代码诊断，反馈给 agent。

### 2.4 Crab-Science 的差异化定位

```
          功能丰富度
              ↑
              |
  Claude Code | 
              |        OpenCode
              |
  ────────────┼──────────────→ 进化能力
              |
   Pi Agent   |
              |
              |  ★ Crab-Science
              |
```

Crab-Science 不是要做"功能最全"的（那是 Claude Code 的赛道），也不是要做"最极简"的（那是 Pi Agent 的赛道）。Crab-Science 的定位是：**极简的内核 + 独一无二的进化能力**。

- 内核参考 Pi Agent 的极简哲学（4 工具 + 极短提示词）
- 进化机制是原创核心（自动迭代 skills/subagents）
- 形态是全栈桌面应用（不是 TUI，降低使用门槛）
- 场景聚焦科研（非通用编码）

---

## 3. 设计哲学

### 3.1 三大原则

#### 原则一：极简内核，进化外壳

```
内核（静态）：4 个核心工具 + 极简系统提示 + Agent Loop
外壳（动态）：Skills + Subagents + Extensions —— 全部可进化
```

内核保持极简和稳定（参考 Pi Agent），不追求功能数量。所有"能力"通过可进化的外壳来承载——skills 提供任务知识，subagents 提供并行能力，extensions 提供自定义工具。

**为什么这样设计？**
- 极简内核 = 可预测、可调试、低维护成本
- 进化外壳 = 能力随使用增长，不需要人工开发新功能
- 内核和外壳解耦 = 内核升级不影响已进化的外壳

#### 原则二：完全可观测

Agent 的每一次操作（read/write/edit/bash/思考/决策）都对用户完全可见。Subagent 的工作过程也完全透明（参考 Pi Agent，拒绝黑盒 subagent）。

**为什么？**
- 科研人员需要"可控感"和"透明感"——他们需要看到 agent 在做什么、为什么这么做
- 可观测是信任的基础
- 可观测是进化的前提——只有看到执行过程，才能评估和优化

#### 原则三：越用越强

每次任务执行都是一次学习机会。系统自动从执行中提取经验，评估 skill/subagent 效果，生成优化建议。用户不需要手动维护 skills——系统会自动让它们变得更好。

**为什么？**
- 降低用户维护成本（不需要手动写/改 skills）
- 让 agent 适应用户的具体工作流（而非用户适应工具）
- 形成"使用越多 → 进化越多 → 越好用 → 使用更多"的正反馈

### 3.2 NO 列表（参考 Pi Agent，结合科研场景）

| 拒绝的功能 | 理由 | 替代方案 |
|-----------|------|---------|
| ❌ No MCP | 工具定义占大量 token，且增加复杂度 | CLI 工具 + README，agent 按需读取 |
| ❌ No 权限弹窗 | 安全剧场，用户会无脑点击 | YOLO 模式 + 容器化安全 |
| ❌ No 黑盒 Subagents | 看不到过程 = 不可信任 | 透明 subagent（可观测执行过程） |
| ❌ No Plan Mode | 专门的"只读模式"增加复杂度 | Agent 把计划写在 PLAN.md，用户可见可编辑 |
| ❌ No 内置待办 | 内置 todo 会让模型困惑 | TODO.md 文件，人/agent 共同可见可编辑 |
| ❌ No 后台 Bash | context compaction 后 agent 会忘记 | tmux 管理后台进程 |
| ❌ No 强制 Compaction | 破坏 prompt caching | session tree 分支管理长对话 |

### 3.3 YES 列表（Crab-Science 独有）

| 拥抱的特性 | 理由 |
|-----------|------|
| ✅ 自动进化 | 核心创新，让 agent 越用越强 |
| ✅ Session Trees | 降低试错成本，支持探索式工作流 |
| ✅ Extensions Hot-Reload | Agent 可以修改自己的能力 |
| ✅ BYOM | 不绑定单一模型，用户自由选择 |
| ✅ 全栈桌面应用 | 降低非技术用户使用门槛 |
| ✅ 科研场景定制 | 预装科研相关 skills |

---

## 4. 核心创新：进化机制

### 4.1 进化机制概述

进化机制是 Crab-Science 与所有竞品的核心差异化。它让 agent 从"静态工具"变成"会成长的助手"。

```
                    ┌─────────────┐
                    │  用户任务    │
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
                    │  Agent 执行  │ ← 使用当前 skills + subagents
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
                    │  结果记录    │ ← 执行日志 + 效果指标
                    └──────┬──────┘
                           ↓
              ┌────────────┼────────────┐
              ↓            ↓            ↓
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Skill    │ │ Subagent │ │ Knowledge│
        │ 进化评估  │ │ 进化评估  │ │ 经验提取  │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             ↓            ↓            ↓
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Skill    │ │ Subagent │ │ Knowledge│
        │ 版本迭代  │ │ 创建/优化 │ │ 图谱积累  │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             ↓            ↓            ↓
             └────────────┼────────────┘
                          ↓
                   ┌─────────────┐
                   │  更强的 Agent │ → 下次任务执行
                   └─────────────┘
```

### 4.2 三层进化体系

#### 4.2.1 Skill 层进化（技能迭代）

**Skill 定义**：一个 skill 是一个目录，包含：
```
skills/
  literature-search/
    SKILL.md          # 主指令文件（markdown + YAML frontmatter）
    search-strategy.md # 附加参考文件（按需加载）
    extract.py         # 可执行脚本（可选）
    CHANGELOG.md       # 版本变更记录（自动维护）
```

**SKILL.md 结构**：
```yaml
---
name: literature-search
description: 搜索和综述学术文献，支持多数据库检索
version: 3
created: 2026-07-20
last_updated: 2026-07-20
metrics:
  success_rate: 0.87
  avg_duration: 45s
  usage_count: 23
  user_satisfaction: 4.2/5
---

# 文献检索技能

## 使用场景
当用户需要查找学术论文、撰写文献综述时使用此技能。

## 执行流程
1. 解析用户的检索需求（关键词、领域、时间范围）
2. 使用 search.py 脚本检索多个数据库
3. 去重并按相关性排序
4. 生成综述摘要

## 注意事项
- 优先使用 semantic-scholar CLI 工具
- 如果结果少于 10 篇，扩大时间范围重试
- 综述摘要不超过 500 字
```

**进化流程**：

```
1. 执行阶段
   ├── Agent 使用 skill 执行任务
   ├── 系统记录执行过程（步骤、耗时、结果）
   └── 用户反馈（隐式：是否采纳结果；显式：评分）

2. 评估阶段（定期触发 or 阈值触发）
   ├── 计算 skill 效果指标（成功率、耗时趋势、满意度趋势）
   ├── 如果指标下降 → 触发优化
   ├── 如果指标稳定 → 保持当前版本
   └── 如果指标上升 → 标记为"成功版本"

3. 优化阶段
   ├── LLM 分析历史执行记录，识别失败模式
   ├── 生成优化建议（具体到 SKILL.md 的哪些段落需要修改）
   ├── Agent 审查建议，决定是否采纳
   ├── 采纳 → 修改 SKILL.md，版本号 +1
   └── 拒绝 → 记录拒绝原因，调整优化策略

4. 验证阶段
   ├── 新版本 skill 在后续任务中执行
   ├── 对比新旧版本的效果指标
   ├── 如果新版本更好 → 保留
   ├── 如果新版本更差 → 自动回滚
   └── 更新 CHANGELOG.md
```

**进化的安全保障**：
- 所有版本保留，可 diff 和回滚
- 重大变更（删除步骤、改变流程）需要用户确认
- 进化不破坏向后兼容（旧版本的 skill 仍可调用）
- 每次进化都有变更原因记录

#### 4.2.2 Subagent 层进化（角色迭代）

**Subagent 定义**：一个 subagent 是一个 markdown 文件：
```yaml
---
name: data-analyzer
description: 专门处理科研数据分析任务，包括统计检验、可视化、数据清洗
mode: subagent
model: inherit
tools:
  read: true
  write: true
  edit: true
  bash: true
metrics:
  delegation_accuracy: 0.91
  task_completion: 0.85
  context_saved: 12.4K tokens avg
  created: 2026-07-20
  version: 2
---

# 数据分析助手

你是一个专门处理科研数据分析的助手。

## 能力范围
- 统计检验（t-test, ANOVA, 回归分析）
- 数据可视化（matplotlib, seaborn）
- 数据清洗和预处理
- 结果解释和报告

## 工作流程
1. 理解用户的分析需求
2. 读取数据文件
3. 执行分析
4. 生成可视化
5. 返回结构化结果

## 注意事项
- 统计检验前先检查数据分布
- 可视化使用科研论文风格（简洁、清晰）
- 返回结果包含统计量和 p 值
```

**进化触发**：

| 触发条件 | 说明 | 阈值 |
|---------|------|------|
| **模式检测** | Agent 频繁执行同类子任务 | 同类任务出现 ≥ 5 次 |
| **Context 溢出** | 主 agent context 因子任务而膨胀 | 子任务产生 > 10K token |
| **用户建议** | 用户观察到重复工作 | 用户显式请求 |
| **Agent 自主** | Agent 识别到需要专门化助手 | Agent 主动建议 |

**进化流程**：

```
1. 模式识别
   ├── 系统监控所有任务执行记录
   ├── 识别重复出现的任务模式（任务类型、工具使用、输出格式）
   ├── 当模式频率超过阈值 → 建议创建 subagent
   └── 生成 subagent 定义草案（基于历史任务数据）

2. 审查确认
   ├── 展示草案给用户/agent
   ├── 用户可以修改名称、描述、工具权限
   ├── 确认后创建 subagent 文件
   └── 加入 subagent 注册表

3. 自动委派
   ├── 后续任务中，主 agent 根据 subagent 描述自动委派
   ├── Subagent 在独立 context 中执行
   ├── 执行过程完全可观测（透明 subagent）
   └── 只返回摘要给主 agent

4. 效果评估
   ├── 委派准确率（是否委派给了正确的 subagent）
   ├── 任务完成率
   ├── Context 节省量
   └── 如果效果不佳 → 优化 subagent 定义或建议删除
```

#### 4.2.3 Knowledge 层进化（知识积累）

**Knowledge 存储**：结构化的经验记录

```json
{
  "experience_id": "exp_20260720_001",
  "timestamp": "2026-07-20T14:32:08Z",
  "task": "文献综述：CRISPR基因编辑安全性",
  "skill_used": "literature-search",
  "subagent_used": null,
  "outcome": "success",
  "duration": 47,
  "key_learnings": [
    "semantic-scholar 在 'CRISPR safety' 关键词下结果较少，扩展到 'gene editing off-target' 后结果增加 3 倍",
    "综述摘要控制在 400 字以内时用户采纳率更高"
  ],
  "tags": ["文献检索", "基因编辑", "安全评估"],
  "related_experiences": ["exp_20260718_003", "exp_20260715_007"]
}
```

**知识图谱**：
- 节点 = 经验记录
- 边 = 关联关系（同领域、同技能、因果关系）
- 用途：当 agent 遇到类似任务时，自动检索相关经验注入 context

**知识注入**：
```
当 agent 接到新任务时：
1. 检索知识图谱，找到相关经验
2. 将相关经验的 key_learnings 注入 agent 的 context
3. Agent 在执行时参考历史经验
4. 执行完成后，新经验加入图谱
```

### 4.3 进化评估指标

| 层级 | 指标 | 计算方式 | 阈值 |
|------|------|---------|------|
| **Skill** | 成功率 | 成功执行次数 / 总执行次数 | < 70% 触发优化 |
| **Skill** | 耗时趋势 | 最近 10 次平均耗时 vs 历史平均 | 上升 20% 触发优化 |
| **Skill** | 满意度 | 用户评分平均值 | < 3.5/5 触发优化 |
| **Subagent** | 委派准确率 | 正确委派次数 / 总委派次数 | < 80% 触发优化 |
| **Subagent** | 任务完成率 | 完成次数 / 委派次数 | < 70% 触发优化 |
| **Knowledge** | 引用率 | 被引用次数 / 总经验数 | 评估知识质量 |

### 4.4 进化的安全性

1. **版本控制**：所有 skill/subagent 变更都有版本记录，支持 diff 和回滚
2. **用户确认**：重大变更（删除步骤、改变核心流程）需要用户确认
3. **自动回滚**：新版本效果显著下降时自动回滚到上一个版本
4. **变更日志**：所有进化操作记录在 CHANGELOG.md，可追溯
5. **沙盒验证**：新版本 skill 先在测试任务中验证，通过后再用于正式任务

---

## 5. 系统架构

### 5.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    桌面应用（Tauri）                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │              前端（React + TypeScript）             │  │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ │  │
│  │  │ 对话面板 │ │ 运行日志  │ │ 进化面板 │ │ 设置页 │ │  │
│  │  └─────────┘ └──────────┘ └─────────┘ └────────┘ │  │
│  └───────────────────────┬───────────────────────────┘  │
│                          │ IPC                          │
│  ┌───────────────────────┴───────────────────────────┐  │
│  │              后端（Rust + TypeScript）              │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │            Agent Core（TypeScript）            │ │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌────────────┐ │ │  │
│  │  │  │Agent Loop│  │ Session  │  │   Tools    │ │ │  │
│  │  │  │          │  │ Manager  │  │ (4个核心)  │ │ │  │
│  │  │  └──────────┘  └──────────┘  └────────────┘ │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │          Evolution Engine（TypeScript）        │ │  │
│  │  │  ┌─────────┐ ┌──────────┐ ┌───────────────┐ │ │  │
│  │  │  │ Skill   │ │ Subagent │ │  Knowledge    │ │ │  │
│  │  │  │ Evolver │ │ Evolver  │ │  Accumulator  │ │ │  │
│  │  │  └─────────┘ └──────────┘ └───────────────┘ │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │            LLM Layer（TypeScript）             │ │  │
│  │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│ │  │
│  │  │  │OpenAI  │ │Anthropic│ │Google  │ │ Local  ││ │  │
│  │  │  │Provider│ │Provider │ │Provider│ │Provider││ │  │
│  │  │  └────────┘ └────────┘ └────────┘ └────────┘│ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │          Storage Layer（Rust + SQLite）        │ │  │
│  │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐│ │  │
│  │  │  │SQLite  │ │ 文件系统│ │ Session│ │ Git    ││ │  │
│  │  │  │(指标)  │ │(skills)│ │ (tree) │ │(版本)  ││ │  │
│  │  │  └────────┘ └────────┘ └────────┘ └────────┘│ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 5.2 核心模块职责

| 模块 | 职责 | 技术栈 |
|------|------|--------|
| **Agent Core** | Agent loop、工具执行、session 管理 | TypeScript |
| **Evolution Engine** | Skill/Subagent/Knowledge 的进化评估和迭代 | TypeScript |
| **LLM Layer** | 多 provider 抽象、流式响应、token 追踪 | TypeScript |
| **Storage Layer** | SQLite（指标）、文件系统（skills/subagents）、Git（版本控制） | Rust + TypeScript |
| **Frontend** | 用户界面、对话交互、进化可视化 | React + TypeScript |
| **Desktop Shell** | 窗口管理、IPC、系统集成 | Tauri (Rust) |

### 5.3 数据流

```
用户输入
  ↓
Agent Core：构建 context（系统提示 + skills 元数据 + 历史经验）
  ↓
LLM Layer：调用模型，获取响应
  ↓
Agent Core：解析响应，执行工具调用
  ↓
Tools：read/write/edit/bash 执行
  ↓
Agent Core：将工具结果加入 context，循环
  ↓
任务完成
  ↓
Evolution Engine：
  ├── Skill Evolver：评估使用的 skill 效果
  ├── Subagent Evolver：检测任务模式
  └── Knowledge Accumulator：提取经验
  ↓
Storage Layer：持久化所有数据
```

---

## 6. 技术栈选型

### 6.1 技术栈总览

| 层级 | 技术 | 选型理由 |
|------|------|---------|
| **桌面框架** | Tauri 2.0 | 轻量（~3MB vs Electron ~80MB）、Rust 后端性能好、安全模型好 |
| **前端框架** | React 18 + TypeScript | 生态成熟、类型安全、组件丰富 |
| **前端样式** | Tailwind CSS + CSS Variables | 快速开发 + 设计令牌管理 |
| **前端状态** | Zustand | 轻量、TypeScript 友好 |
| **Agent Core** | TypeScript (Node.js) | 参考 Pi Agent、生态丰富、类型安全 |
| **LLM 集成** | 自研多 provider 抽象层 | 参考 Pi Agent 的 pi-ai，支持流式 + 工具调用 |
| **数据库** | SQLite (via better-sqlite3) | 轻量、嵌入式、无需服务器 |
| **版本控制** | Git (via isomorphic-git) | 纯 JS 实现，用于 skill/subagent 版本管理 |
| **终端模拟** | xterm.js | 前端终端组件（运行日志展示） |
| **代码编辑器** | Monaco Editor | VS Code 同款编辑器（skill 编辑） |
| **图表** | D3.js / Recharts | 进化可视化、知识图谱 |

### 6.2 为什么选 Tauri 而非 Electron

| 维度 | Tauri | Electron |
|------|-------|---------|
| 包体积 | ~3-10MB | ~80-150MB |
| 内存占用 | 低（Rust 后端） | 高（Node.js 后端） |
| 安全模型 | 严格（默认禁止远程访问） | 宽松 |
| 性能 | Rust 原生性能 | V8 性能 |
| 生态 | 成长中 | 非常成熟 |
| 前端 | 任意 Web 框架 | 任意 Web 框架 |

**选择 Tauri 的理由**：
1. 极简哲学——80MB 的 Electron 应用不符合"极简"定位
2. Rust 后端提供更好的性能和安全性
3. Tauri 2.0 已经成熟，支持主要桌面平台
4. 安全模型更严格（科研数据敏感）

### 6.3 为什么 Agent Core 用 TypeScript 而非 Rust

虽然 Tauri 后端是 Rust，但 Agent Core 用 TypeScript：

1. **参考 Pi Agent**：Pi Agent 的核心逻辑全用 TypeScript，证明了可行性
2. **LLM 生态**：TypeScript 的 LLM SDK 生态更丰富（OpenAI、Anthropic、Google 都有官方 TS SDK）
3. **动态进化**：进化机制需要动态加载和执行代码（extensions），TypeScript 更灵活
4. **开发效率**：TypeScript 开发效率高于 Rust，适合快速迭代
5. **Tauri 兼容**：Tauri 支持 Rust ↔ TypeScript 通信，Agent Core 可以作为 sidecar 进程运行

**架构方案**：Tauri 主进程（Rust）负责窗口管理和系统集成，Agent Core 作为 Node.js sidecar 进程运行，通过 IPC 通信。

---

## 7. 功能模块设计

### 7.1 Agent Loop（核心循环）

参考 Pi Agent 的极简 agent loop：

```typescript
async function agentLoop(session: Session, userInput: string) {
  // 1. 构建 context
  const context = buildContext(session, userInput);
  // context = systemPrompt + skillsMetadata + relevantExperiences + sessionHistory

  // 2. 调用 LLM
  const response = await llm.complete(context, { tools: CORE_TOOLS });

  // 3. 处理响应
  if (response.hasToolCall) {
    // 4. 执行工具
    const result = await executeTool(response.toolCall);
    // 5. 将结果加入 session
    session.addToolResult(result);
    // 6. 循环
    return agentLoop(session, '');
  } else {
    // 7. 返回最终响应
    return response.text;
  }
}
```

**核心工具（4个）**：
| 工具 | 功能 | 说明 |
|------|------|------|
| `read` | 读取文件内容 | 支持 glob 模式 |
| `write` | 创建/覆盖文件 | 仅用于新文件或完全重写 |
| `edit` | 精确编辑文件 | old_string → new_string，必须精确匹配 |
| `bash` | 执行 shell 命令 | 在项目目录内执行 |

### 7.2 Session Management

参考 Pi Agent 的 Session Trees：

```
Session Tree 结构：
  root
  ├── msg_001 (用户输入)
  ├── msg_002 (agent 响应)
  ├── msg_003 (工具调用: read)
  ├── msg_004 (工具结果)
  ├── msg_005 (用户输入)
  ├── msg_006 (agent 响应)
  │   ├── msg_007 (fork: 探索方案 A)
  │   │   ├── msg_008 (工具调用)
  │   │   └── msg_009 (agent 响应)
  │   └── msg_010 (fork: 探索方案 B)
  │       ├── msg_011 (工具调用)
  │       └── msg_012 (agent 响应)
  └── msg_013 (回到主分支，带方案 B 的摘要)
```

**Session 特性**：
- 分支：任何节点都可以 fork 出新分支
- 回退：可以回到任意历史节点重新开始
- 跳转：可以在分支间跳转
- 摘要：分支的内容可以被总结后带回主分支
- 持久化：session 以 JSON 格式存储在文件系统中

### 7.3 Skill System

**Skill 发现**：
```
~/.crab-science/skills/       # 全局 skills
  literature-search/
  data-analysis/
  paper-writing/
  ...

项目/.crab-science/skills/    # 项目级 skills
  custom-experiment/
  ...
```

**Progressive Disclosure（参考 Claude Code）**：
```
Level 0: 系统提示中包含所有 skill 的 name + description（~50 token/skill）
Level 1: Agent 认为相关时，读取 SKILL.md 完整内容
Level 2: SKILL.md 引用的附加文件，按需读取
Level 3: 可执行脚本，按需调用
```

**预装科研 Skills**：
| Skill | 功能 |
|-------|------|
| `literature-search` | 学术文献检索和综述 |
| `data-analysis` | 科研数据统计分析和可视化 |
| `paper-writing` | 学术论文撰写辅助 |
| `experiment-design` | 实验设计方案生成 |
| `citation-management` | 引用管理和格式化 |
| `research-workflow` | 科研工作流管理 |

### 7.4 Subagent System

**Subagent 调用**：
```typescript
// 主 agent 可以委派任务给 subagent
const result = await delegateToSubagent({
  name: 'data-analyzer',
  task: '对 data.csv 执行 t-test 统计检验',
  context: { filePath: 'data.csv' }
});
// result = subagent 的执行摘要（不含执行过程）
// 执行过程存储在 session tree 的子分支中，用户可查看
```

**透明 Subagent**（区别于 Claude Code 的黑盒）：
- Subagent 的执行过程存储在 session tree 的子分支中
- 用户可以展开查看 subagent 的每一次操作
- Subagent 返回主 agent 的只是摘要，但完整过程可追溯

### 7.5 Evolution Engine

**Evolution Engine 架构**：

```typescript
class EvolutionEngine {
  // 定期运行（如每 10 次任务执行后）
  async runEvaluation() {
    await this.evaluateSkills();     // 评估所有 skill 的效果指标
    await this.evaluateSubagents();  // 评估所有 subagent 的效果
    await this.detectPatterns();     // 检测任务模式，建议新 subagent
    await this.extractExperiences(); // 从最近任务中提取经验
  }

  // Skill 进化
  async evolveSkill(skillName: string) {
    const metrics = await this.getSkillMetrics(skillName);
    if (metrics.needsOptimization) {
      const suggestions = await this.generateOptimizationSuggestions(skillName);
      const approved = await this.requestApproval(suggestions);
      if (approved) {
        await this.applyOptimization(skillName, suggestions);
        await this.updateChangelog(skillName, suggestions);
      }
    }
  }

  // Subagent 进化
  async detectAndCreateSubagent() {
    const patterns = await this.detectTaskPatterns();
    for (const pattern of patterns) {
      if (pattern.frequency > THRESHOLD) {
        const draft = await this.generateSubagentDraft(pattern);
        const approved = await this.requestApproval(draft);
        if (approved) {
          await this.createSubagent(draft);
        }
      }
    }
  }

  // 知识积累
  async extractExperience(session: Session) {
    const experience = await this.analyzeSession(session);
    await this.storeExperience(experience);
    await this.updateKnowledgeGraph(experience);
  }
}
```

### 7.6 LLM Layer

参考 Pi Agent 的 pi-ai，支持多 provider：

```typescript
interface LLMProvider {
  name: string;
  complete(messages: Message[], options: LLMOptions): AsyncStream<Response>;
  models: ModelInfo[];
}

// 支持的 providers
const providers: LLMProvider[] = [
  new OpenAIProvider(),      // GPT-5, GPT-4, etc.
  new AnthropicProvider(),   // Claude Opus, Sonnet, Haiku
  new GoogleProvider(),      // Gemini
  new LocalProvider(),       // Ollama, llama.cpp, vLLM
  new OpenRouterProvider(),  // 任意 OpenAI 兼容端点
];
```

**关键特性**：
- 流式响应（SSE）
- 工具调用（function calling）
- Token 和成本追踪
- 跨 provider 的 context handoff（参考 Pi Agent）
- 模型切换（session 中可切换模型）

### 7.7 Extensions System

参考 Pi Agent 的 extensions hot-reload：

```typescript
// Extension = TypeScript 文件，导出工具/组件/命令
// ~/.crab-science/extensions/web-search.ts

export const tool = {
  name: 'web-search',
  description: 'Search the web',
  parameters: { query: { type: 'string' } },
  execute: async (params) => {
    const results = await fetch(`https://api.search.com?q=${params.query}`);
    return results.json();
  }
};

// Hot-reload：当 agent 修改了这个文件，立即重新加载
```

**Extension 能力**：
- 自定义工具（扩展 agent 的能力）
- 自定义命令（斜杠命令）
- 自定义 UI 组件
- 自定义主题

**Agent 可以自己创建/修改 extensions**（这是进化的一个维度）。

---

## 8. 桌面应用架构

### 8.1 应用窗口结构

```
┌──────────────────────────────────────────────────────────┐
│  Crab-Science                                    [─][□][×]│
├──────────────────────────────────────────────────────────┤
│  [对话]  [运行日志]  [进化面板]  [技能库]  [设置]          │
├────────┬─────────────────────────────────────────────────┤
│        │                                                 │
│ 会话    │              主内容区                            │
│ 列表    │                                                 │
│        │                                                 │
│ ├─ sess1│                                                 │
│ ├─ sess2│                                                 │
│ └─ sess3│                                                 │
│        │                                                 │
│        │                                                 │
├────────┴─────────────────────────────────────────────────┤
│  [模型: GPT-5]  [Token: 12.4K]  [Cost: $0.03]  [● 运行中] │
└──────────────────────────────────────────────────────────┘
```

### 8.2 核心界面

#### 对话面板
- 主对话区：用户输入 + agent 响应
- 工具调用展示：可折叠的工具调用详情
- Session tree 导航：分支/回退/跳转
- 模型选择器：session 中可切换模型

#### 运行日志
- 终端风格日志流（参考之前的 DESIGN.md 设计）
- 等宽字体、状态色着色
- 实时滚动、可暂停

#### 进化面板
- Skill 进化时间线：版本历史、效果趋势图
- Subagent 评估：委派准确率、任务完成率
- 知识图谱可视化：节点-关系图
- 进化建议队列：待确认的优化建议

#### 技能库
- Skill 列表：卡片式展示
- 版本管理：diff 查看、回滚
- 效果指标：成功率、耗时、满意度
- 手动编辑：Monaco Editor 编辑 SKILL.md

#### 设置
- 模型配置：API Key、默认模型
- 进化配置：评估频率、自动确认阈值
- 安全配置：容器化设置、YOLO 模式开关
- 主题配置：深色/浅色（默认深色）

### 8.3 IPC 通信

```
Frontend (React) ←→ Tauri IPC ←→ Backend (Rust) ←→ Node.js Sidecar (Agent Core)
     ↑                                                    ↓
     └──────────── SSE/WebSocket ─────────────────────────┘
                    (实时事件流)
```

**通信模式**：
- 请求-响应：前端 → 后端（如打开文件、获取配置）
- 事件流：后端 → 前端（如 agent 响应流、日志流、进化事件）
- 双向：前端 ↔ 后端（如用户输入、工具确认）

---

## 9. 数据模型

### 9.1 核心数据结构

#### Session
```typescript
interface Session {
  id: string;
  tree: SessionNode;        // 树形结构
  currentNodeId: string;    // 当前所在节点
  model: string;            // 使用的模型
  createdAt: string;
  updatedAt: string;
  totalTokens: number;
  totalCost: number;
}

interface SessionNode {
  id: string;
  parentId: string | null;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'summary';
  content: string;
  timestamp: string;
  children: SessionNode[];
  metadata?: {
    toolName?: string;
    toolParams?: any;
    toolResult?: any;
    tokensUsed?: number;
    branchReason?: string;   // fork 的原因
  };
}
```

#### Skill
```typescript
interface Skill {
  name: string;
  description: string;
  version: number;
  path: string;              // 文件系统路径
  metrics: SkillMetrics;
  changelog: ChangeEntry[];
}

interface SkillMetrics {
  successRate: number;
  avgDuration: number;
  usageCount: number;
  userSatisfaction: number;
  lastUsed: string;
  trend: 'improving' | 'stable' | 'declining';
}
```

#### Experience
```typescript
interface Experience {
  id: string;
  timestamp: string;
  taskId: string;
  sessionId: string;
  task: string;
  skillUsed: string | null;
  subagentUsed: string | null;
  outcome: 'success' | 'partial' | 'failure';
  duration: number;
  keyLearnings: string[];
  tags: string[];
  relatedExperiences: string[];
}
```

### 9.2 存储方案

| 数据类型 | 存储方式 | 位置 |
|---------|---------|------|
| Sessions | JSON 文件 | `~/.crab-science/sessions/` |
| Skills | Markdown 文件 + 目录 | `~/.crab-science/skills/` |
| Subagents | Markdown 文件 | `~/.crab-science/subagents/` |
| Extensions | TypeScript 文件 | `~/.crab-science/extensions/` |
| Experiences | SQLite | `~/.crab-science/crab-science.db` |
| Skill Metrics | SQLite | `~/.crab-science/crab-science.db` |
| Knowledge Graph | SQLite | `~/.crab-science/crab-science.db` |
| Skill Versions | Git 仓库 | `~/.crab-science/.git/` |
| Config | JSON | `~/.crab-science/config.json` |

---

## 10. 项目结构

```
crab-science/
├── apps/
│   ├── desktop/              # Tauri 桌面应用
│   │   ├── src/              # React 前端
│   │   │   ├── components/   # UI 组件
│   │   │   ├── pages/        # 页面
│   │   │   ├── hooks/        # React hooks
│   │   │   └── stores/       # Zustand stores
│   │   ├── src-tauri/        # Tauri Rust 后端
│   │   │   ├── src/
│   │   │   └── Cargo.toml
│   │   └── package.json
│   │
│   └── cli/                  # CLI 版本（可选）
│       ├── src/
│       └── package.json
│
├── packages/
│   ├── agent-core/           # Agent loop + 工具系统
│   │   ├── src/
│   │   │   ├── agent-loop.ts
│   │   │   ├── tools/        # 4 个核心工具
│   │   │   ├── session/      # Session tree 管理
│   │   │   └── context/      # Context 构建
│   │   └── package.json
│   │
│   ├── evolution-engine/     # 进化机制引擎
│   │   ├── src/
│   │   │   ├── skill-evolver.ts
│   │   │   ├── subagent-evolver.ts
│   │   │   ├── knowledge-accumulator.ts
│   │   │   └── evaluator.ts  # 效果评估
│   │   └── package.json
│   │
│   ├── llm-layer/            # 多 provider LLM 抽象
│   │   ├── src/
│   │   │   ├── providers/
│   │   │   │   ├── openai.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   ├── google.ts
│   │   │   │   └── local.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── storage/              # 存储层
│   │   ├── src/
│   │   │   ├── sqlite.ts     # SQLite 操作
│   │   │   ├── filesystem.ts # 文件系统操作
│   │   │   └── git.ts        # 版本控制
│   │   └── package.json
│   │
│   └── shared/               # 共享类型和工具
│       ├── src/
│       │   ├── types.ts      # 核心类型定义
│       │   └── utils.ts
│       └── package.json
│
├── skills/                   # 预装科研 skills
│   ├── literature-search/
│   ├── data-analysis/
│   ├── paper-writing/
│   ├── experiment-design/
│   ├── citation-management/
│   └── research-workflow/
│
├── extensions/               # 预装 extensions
│   ├── web-search.ts
│   ├── arxiv-search.ts
│   └── semantic-scholar.ts
│
├── docs/                     # 文档
├── scripts/                  # 构建/部署脚本
├── turbo.json                # Turborepo 配置
├── package.json              # Monorepo 根配置
└── pnpm-workspace.yaml       # pnpm workspace 配置
```

---

## 11. 开发路线图

### Phase 1：极简内核 MVP（2-3 周）

**目标**：跑通极简 agent loop，能对话、执行工具

- [ ] 搭建 monorepo 项目结构（Turborepo + pnpm）
- [ ] 实现 LLM Layer：OpenAI + Anthropic provider
- [ ] 实现 Agent Core：agent loop + 4 个核心工具
- [ ] 实现 Session Manager：基础 session（线性，不含 tree）
- [ ] 实现 CLI 版本（参考 Pi Agent 的 TUI）
- [ ] 基础配置：config.json、API Key 管理
- [ ] 预装 2-3 个科研 skills

**验证标准**：能在终端中用 Crab-Science 执行科研任务（如文献检索）

### Phase 2：Session Trees + Skills 系统（2-3 周）

**目标**：实现 session 分支 + 完整 skills 系统

- [ ] Session Tree：分支、回退、跳转
- [ ] Skill 发现和加载：progressive disclosure
- [ ] Skill 执行和结果记录
- [ ] Extensions 系统：hot-reload TypeScript extensions
- [ ] 完善预装科研 skills（6 个）
- [ ] 预装 extensions（web-search、arxiv-search 等）

**验证标准**：能在 session 中分支探索，skills 按需加载

### Phase 3：进化机制（3-4 周）★核心

**目标**：实现三层进化体系

- [ ] Skill Evolver：效果评估 + 优化建议 + 版本迭代
- [ ] Subagent Evolver：模式检测 + 自动创建 + 委派
- [ ] Knowledge Accumulator：经验提取 + 知识图谱
- [ ] Evolution Engine：定期评估调度
- [ ] 版本控制：Git 集成，skill/subagent 变更可追溯
- [ ] 进化安全：自动回滚、用户确认、变更日志

**验证标准**：skill 在使用 10 次后能自动优化，subagent 能自动检测模式并创建

### Phase 4：桌面应用（3-4 周）

**目标**：从 CLI 升级到全栈桌面应用

- [ ] Tauri 项目搭建
- [ ] 前端 UI：对话面板、运行日志、进化面板、技能库、设置
- [ ] IPC 通信：前端 ↔ Rust 后端 ↔ Node.js sidecar
- [ ] 实时事件流：agent 响应流、日志流、进化事件
- [ ] Session Tree 可视化
- [ ] 知识图谱可视化（D3.js）
- [ ] 进化时间线可视化

**验证标准**：非技术用户能通过桌面 UI 完成科研任务

### Phase 5：打磨与发布（2-3 周）

**目标**：产品化打磨

- [ ] 安装包构建（Windows / macOS / Linux）
- [ ] 性能优化（大 session 加载、日志流渲染）
- [ ] 错误处理和边缘情况
- [ ] 用户引导（首次使用向导）
- [ ] 文档：用户手册、Skill 编写指南
- [ ] 开源准备：README、LICENSE、CONTRIBUTING

**验证标准**：可分发给科研用户试用

---

## 12. 开放问题

| # | 问题 | 当前倾向 | 需要决策 |
|---|------|---------|---------|
| 1 | Agent Core 运行方式：Tauri sidecar 还是嵌入 Rust？ | Node.js sidecar（参考 Pi Agent） | 需要验证 Tauri sidecar 的性能和稳定性 |
| 2 | 进化机制的自动化程度：全自动 vs 需确认 | 重大变更需确认，小优化全自动 | 需要定义"重大变更"的边界 |
| 3 | LLM 调用成本：进化机制需要额外 LLM 调用来分析效果 | 使用更便宜的模型（如 Haiku）做进化分析 | 需要评估成本 |
| 4 | 科研场景的边界：是否只支持特定学科？ | 通用科研，预装跨学科 skills | 需要用户反馈 |
| 5 | 开源策略：完全开源 vs 核心开源+增值闭源 | 倾向完全开源 | 需要商业模式思考 |
| 6 | 是否支持 MCP | 初版不支持（极简优先），后续考虑 | 取决于用户需求 |
| 7 | 移动端支持 | 不支持（桌面端优先） | 取决于用户反馈 |
| 8 | 多语言 UI | 中文优先，英文支持 | 取决于目标市场 |

---

*本文档是 Crab-Science 项目的设计原型，将随开发进展持续迭代。*
