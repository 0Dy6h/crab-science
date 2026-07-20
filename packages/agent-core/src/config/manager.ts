import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '@crab-science/shared';
import {
  CONFIG_DIR,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_BASH_TIMEOUT_MS,
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
}
