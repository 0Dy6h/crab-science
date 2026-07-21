import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '@crab-science/shared';
import {
  CONFIG_DIR,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_BASH_TIMEOUT_MS,
  DEFAULT_EVOLUTION_MODEL,
  ENV_KEY_PREFIX,
  expandTilde,
} from '@crab-science/shared';

/**
 * 配置管理器
 * 管理 ~/.crab-science/config.json 配置文件
 * API Key 优先从环境变量读取
 */
export class ConfigManager {
  private configDir: string;
  private configPath: string;
  private config: AppConfig | null = null;

  constructor(configDir?: string) {
    this.configDir = expandTilde(configDir ?? CONFIG_DIR);
    this.configPath = path.join(this.configDir, 'config.json');
  }

  /**
   * 确保 ~/.crab-science/ 目录存在
   */
  ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    const sessionsDir = path.join(this.configDir, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
  }

  /**
   * 加载配置
   * 不存在则返回默认配置并创建文件
   */
  load(): AppConfig {
    if (this.config) return this.config;

    this.ensureConfigDir();

    let config: AppConfig;
    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        config = { ...this.getDefaultConfig(), ...JSON.parse(raw) };
      } catch {
        config = this.getDefaultConfig();
        this.save(config);
      }
    } else {
      config = this.getDefaultConfig();
      this.save(config);
    }

    this.config = config;
    return config;
  }

  /**
   * 保存配置
   */
  save(config: AppConfig): void {
    this.ensureConfigDir();
    this.config = config;
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * 获取 API Key
   * 优先从环境变量 CRAB_SCIENCE_{PROVIDER}_API_KEY 读取
   */
  getApiKey(provider: string): string {
    const envKey = `${ENV_KEY_PREFIX}_${provider.toUpperCase()}_API_KEY`;
    const apiKey = process.env[envKey];
    if (!apiKey) {
      throw new Error(
        `API Key 未设置。请设置环境变量 ${envKey}：\n` +
          `  export ${envKey}=your-api-key\n` +
          `或在 shell 配置文件（~/.bashrc / ~/.zshrc）中添加该行。`,
      );
    }
    return apiKey;
  }

  /**
   * 校验配置完整性
   */
  validate(): { valid: boolean; errors: string[] } {
    const config = this.load();
    const errors: string[] = [];

    if (!['openai', 'anthropic', 'deepseek'].includes(config.defaultProvider)) {
      errors.push(`defaultProvider 必须是 'openai'、'anthropic' 或 'deepseek'，当前: ${config.defaultProvider}`);
    }

    if (!config.defaultModel) {
      errors.push('defaultModel 不能为空');
    }

    if (config.maxIterations < 1) {
      errors.push(`maxIterations 必须 >= 1，当前: ${config.maxIterations}`);
    }

    if (config.bashTimeoutMs < 1000) {
      errors.push(`bashTimeoutMs 必须 >= 1000，当前: ${config.bashTimeoutMs}`);
    }

    if (!config.workDir) {
      errors.push('workDir 不能为空');
    }

    // Phase 3: 校验 evolutionConfig
    if (config.evolutionConfig) {
      const ec = config.evolutionConfig;
      if (ec.taskInterval !== undefined && ec.taskInterval < 1) {
        errors.push(`evolutionConfig.taskInterval 必须 >= 1，当前: ${ec.taskInterval}`);
      }
      if (ec.skillValidationWindow !== undefined && ec.skillValidationWindow < 1) {
        errors.push(`evolutionConfig.skillValidationWindow 必须 >= 1，当前: ${ec.skillValidationWindow}`);
      }
      if (ec.experienceInjectionTopK !== undefined && ec.experienceInjectionTopK < 1) {
        errors.push(`evolutionConfig.experienceInjectionTopK 必须 >= 1，当前: ${ec.experienceInjectionTopK}`);
      }
      if (ec.experienceInjectionTokenBudget !== undefined && ec.experienceInjectionTokenBudget < 100) {
        errors.push(`evolutionConfig.experienceInjectionTokenBudget 必须 >= 100，当前: ${ec.experienceInjectionTokenBudget}`);
      }
      if (ec.ratingInterval !== undefined && ec.ratingInterval < 1) {
        errors.push(`evolutionConfig.ratingInterval 必须 >= 1，当前: ${ec.ratingInterval}`);
      }
      if (ec.subagentPatternThreshold !== undefined && ec.subagentPatternThreshold < 2) {
        errors.push(`evolutionConfig.subagentPatternThreshold 必须 >= 2，当前: ${ec.subagentPatternThreshold}`);
      }
    }

    // 检查 API Key
    try {
      this.getApiKey(config.defaultProvider);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): AppConfig {
    return {
      defaultProvider: DEFAULT_PROVIDER,
      defaultModel: DEFAULT_MODEL,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      bashTimeoutMs: DEFAULT_BASH_TIMEOUT_MS,
      workDir: process.cwd(),
      evolutionModel: DEFAULT_EVOLUTION_MODEL,
      evolutionConfig: {},
    };
  }

  /**
   * 更新配置（部分更新）
   */
  update(partial: Partial<AppConfig>): AppConfig {
    const current = this.load();
    const updated = { ...current, ...partial };
    this.save(updated);
    return updated;
  }

  /**
   * 获取进化分析使用的模型名称
   * 如果未配置 evolutionModel，回退到 defaultModel
   */
  getEvolutionModel(): string {
    const config = this.load();
    return config.evolutionModel ?? config.defaultModel;
  }

  /**
   * 根据 evolutionModel 推断 Provider 名称
   * claude-* → anthropic, gpt-* → openai, deepseek-* → deepseek
   * 如果无法推断，回退到 defaultProvider
   */
  getEvolutionProviderName(): string {
    const model = this.getEvolutionModel();
    if (model.startsWith('claude')) return 'anthropic';
    if (model.startsWith('gpt')) return 'openai';
    if (model.startsWith('deepseek')) return 'deepseek';
    return this.load().defaultProvider;
  }
}
