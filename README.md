# Crab-Science

> 可自我进化的科研 AI Agent Harness

Crab-Science 是一个极简内核的科研 AI Agent 框架，支持双 LLM Provider（OpenAI + Anthropic），4 个核心工具（read/write/edit/bash），终端 CLI 界面。

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 启动 CLI
pnpm dev
# 或直接运行
node apps/cli/dist/index.js
```

## 配置

设置 API Key 环境变量：

```bash
# Anthropic
export CRAB_SCIENCE_ANTHROPIC_API_KEY=sk-ant-xxx

# 或 OpenAI
export CRAB_SCIENCE_OPENAI_API_KEY=sk-xxx
```

配置文件位于 `~/.crab-science/config.json`。

## 项目结构

```
crab-science/
├── packages/
│   ├── shared/          # 共享类型、常量、工具函数
│   ├── llm-layer/       # LLM Provider 抽象 + 实现
│   └── agent-core/      # Agent Loop + Tools + Session + Skills
├── apps/
│   └── cli/             # Ink CLI 应用
└── skills/              # 预装科研技能
```

## License

MIT
