// ============================================================
// Crab-Science 全局常量
// Phase 2: 新增 Extensions 和 Tree 相关常量
// ============================================================

/** 默认最大迭代次数 */
export const DEFAULT_MAX_ITERATIONS = 50;

/** 默认 bash 超时时间（毫秒） */
export const DEFAULT_BASH_TIMEOUT_MS = 30000;

/** 默认 LLM Provider */
export const DEFAULT_PROVIDER: 'openai' | 'anthropic' = 'anthropic';

/** 默认模型 */
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** DeepSeek API 基础地址（兼容 OpenAI 格式） */
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/** DeepSeek 默认模型 */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

/** 配置目录 */
export const CONFIG_DIR = '~/.crab-science';

/** Sessions 存储目录 */
export const SESSIONS_DIR = '~/.crab-science/sessions';

/** 全局 Skills 目录 */
export const GLOBAL_SKILLS_DIR = '~/.crab-science/skills';

/** 项目级 Skills 目录名（相对于项目根） */
export const PROJECT_SKILLS_DIR = 'skills';

// ============ Phase 2 新增常量 ============

/** 全局 Extensions 目录 */
export const GLOBAL_EXTENSIONS_DIR = '~/.crab-science/extensions';

/** 项目级 Extensions 目录名（相对于项目根） */
export const PROJECT_EXTENSIONS_DIR = 'extensions';

/** /tree 命令折叠阈值（超过此数量的分支折叠显示） */
export const MAX_TREE_DISPLAY_BRANCHES = 2;

/** Skill 附加文件 glob 模式（排除 SKILL.md） */
export const SKILL_ATTACHMENTS_GLOB = '*.md';

/** Skill 脚本 glob 模式 */
export const SKILL_SCRIPTS_GLOB = '*.{py,sh}';

/** 系统提示词最大 token 数 */
export const MAX_SYSTEM_PROMPT_TOKENS = 1500;

/** 大文件截断行数 */
export const MAX_FILE_LINES = 500;

/** 工具输出截断行数 */
export const MAX_TOOL_OUTPUT_LINES = 100;

/** Glob 匹配文件摘要行数 */
export const GLOB_PREVIEW_LINES = 10;

/** 环境变量前缀 */
export const ENV_KEY_PREFIX = 'CRAB_SCIENCE';

/** 版本号 */
export const VERSION = '0.2.0';
