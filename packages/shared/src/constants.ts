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

// ============ Phase 3 新增常量 ============

/** Phase 3 系统提示词最大 token 数（上调以容纳 subagent 描述 + 经验注入） */
export const MAX_SYSTEM_PROMPT_TOKENS_PHASE3 = 2000;

/** SQLite 数据库路径 */
export const SQLITE_DB_PATH = '~/.crab-science/crab-science.db';

/** Subagents 目录 */
export const SUBAGENTS_DIR = '~/.crab-science/subagents';

/** 默认进化分析模型 */
export const DEFAULT_EVOLUTION_MODEL = 'deepseek-chat';

/** 进化评估触发间隔（任务数） */
export const EVOLUTION_TASK_INTERVAL = 10;

/** Skill 版本验证窗口（执行次数） */
export const SKILL_VALIDATION_WINDOW = 3;

/** 经验注入 top-K */
export const EXPERIENCE_INJECTION_TOP_K = 3;

/** 经验注入 token 预算 */
export const EXPERIENCE_INJECTION_TOKEN_BUDGET = 500;

/** Skill 优化 — 成功率阈值 */
export const SKILL_OPTIMIZATION_SUCCESS_RATE_THRESHOLD = 0.7;

/** Skill 优化 — 耗时上升阈值 */
export const SKILL_OPTIMIZATION_DURATION_INCREASE_THRESHOLD = 0.2;

/** Skill 优化 — 满意度阈值 */
export const SKILL_OPTIMIZATION_SATISFACTION_THRESHOLD = 3.5;

/** Skill 回滚 — 成功率下降阈值 */
export const SKILL_ROLLBACK_SUCCESS_RATE_DROP = 0.15;

/** Skill 回滚 — 满意度下降阈值 */
export const SKILL_ROLLBACK_SATISFACTION_DROP = 0.5;

/** Subagent 模式检测阈值 */
export const SUBAGENT_PATTERN_THRESHOLD = 5;

/** 用户评分采集间隔（任务数） */
export const RATING_INTERVAL = 3;

/** 大文件截断行数 */
export const MAX_FILE_LINES = 500;

/** 工具输出截断行数 */
export const MAX_TOOL_OUTPUT_LINES = 100;

/** Glob 匹配文件摘要行数 */
export const GLOB_PREVIEW_LINES = 10;

/** 环境变量前缀 */
export const ENV_KEY_PREFIX = 'CRAB_SCIENCE';

/** 版本号 */
export const VERSION = '0.3.0';
