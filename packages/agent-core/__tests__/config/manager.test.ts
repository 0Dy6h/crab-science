import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from '../../src/config/manager.js';

describe('ConfigManager', () => {
  let configDir: string;
  let manager: ConfigManager;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-config-'));
    manager = new ConfigManager(configDir);
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  describe('ensureConfigDir', () => {
    it('应创建配置目录', () => {
      const newDir = path.join(configDir, 'new-config');
      const newManager = new ConfigManager(newDir);

      newManager.ensureConfigDir();

      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('应创建 sessions 子目录', () => {
      manager.ensureConfigDir();

      expect(fs.existsSync(path.join(configDir, 'sessions'))).toBe(true);
    });

    it('目录已存在时不应报错', () => {
      manager.ensureConfigDir();
      // 再次调用不应抛出
      expect(() => manager.ensureConfigDir()).not.toThrow();
    });
  });

  describe('load', () => {
    it('配置不存在时应创建默认配置文件', () => {
      const config = manager.load();

      expect(config.defaultProvider).toBe('anthropic');
      expect(config.defaultModel).toBe('claude-sonnet-4-20250514');
      expect(config.maxIterations).toBe(50);
      expect(config.bashTimeoutMs).toBe(30000);
      expect(config.workDir).toBeTruthy();

      // 应已创建配置文件
      const configPath = path.join(configDir, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('应读取已存在的配置文件', () => {
      // 先写入一个配置
      const customConfig = {
        defaultProvider: 'openai' as const,
        defaultModel: 'gpt-4o',
        maxIterations: 100,
        bashTimeoutMs: 60000,
        workDir: '/custom/path',
      };
      fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify(customConfig),
      );

      const config = manager.load();

      expect(config.defaultProvider).toBe('openai');
      expect(config.defaultModel).toBe('gpt-4o');
      expect(config.maxIterations).toBe(100);
      expect(config.bashTimeoutMs).toBe(60000);
      expect(config.workDir).toBe('/custom/path');
    });

    it('应缓存加载的配置（第二次调用不重新读取）', () => {
      const config1 = manager.load();

      // 修改配置文件
      fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify({ ...config1, maxIterations: 999 }),
      );

      const config2 = manager.load();

      // 应返回缓存的配置
      expect(config2.maxIterations).toBe(config1.maxIterations);
    });

    it('损坏的配置文件应回退到默认配置', () => {
      fs.writeFileSync(path.join(configDir, 'config.json'), '{ invalid json }');

      const config = manager.load();

      expect(config.defaultProvider).toBe('anthropic');
      expect(config.defaultModel).toBe('claude-sonnet-4-20250514');
    });

    it('部分配置文件应与默认值合并', () => {
      fs.writeFileSync(
        path.join(configDir, 'config.json'),
        JSON.stringify({ defaultModel: 'gpt-4o-mini' }),
      );

      const config = manager.load();

      expect(config.defaultModel).toBe('gpt-4o-mini');
      // 未指定的字段应使用默认值
      expect(config.defaultProvider).toBe('anthropic');
      expect(config.maxIterations).toBe(50);
    });
  });

  describe('save', () => {
    it('应保存配置到文件', () => {
      const config = {
        defaultProvider: 'openai' as const,
        defaultModel: 'gpt-4o',
        maxIterations: 25,
        bashTimeoutMs: 15000,
        workDir: '/test/dir',
      };

      manager.save(config);

      const configPath = path.join(configDir, 'config.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(raw);

      expect(saved.defaultProvider).toBe('openai');
      expect(saved.defaultModel).toBe('gpt-4o');
      expect(saved.maxIterations).toBe(25);
    });
  });

  describe('getApiKey', () => {
    it('应从环境变量读取 API Key', () => {
      const envKey = 'CRAB_SCIENCE_OPENAI_API_KEY';
      const testKey = 'sk-test-key-12345';
      process.env[envKey] = testKey;

      try {
        const key = manager.getApiKey('openai');
        expect(key).toBe(testKey);
      } finally {
        delete process.env[envKey];
      }
    });

    it('应支持 anthropic provider 的环境变量', () => {
      const envKey = 'CRAB_SCIENCE_ANTHROPIC_API_KEY';
      const testKey = 'sk-ant-test-key-67890';
      process.env[envKey] = testKey;

      try {
        const key = manager.getApiKey('anthropic');
        expect(key).toBe(testKey);
      } finally {
        delete process.env[envKey];
      }
    });

    it('环境变量未设置时应抛出错误', () => {
      const envKey = 'CRAB_SCIENCE_OPENAI_API_KEY';
      delete process.env[envKey];

      expect(() => manager.getApiKey('openai')).toThrow();
    });

    it('错误信息应包含环境变量名称', () => {
      const envKey = 'CRAB_SCIENCE_OPENAI_API_KEY';
      delete process.env[envKey];

      try {
        manager.getApiKey('openai');
        expect.fail('应抛出错误');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain('CRAB_SCIENCE_OPENAI_API_KEY');
      }
    });

    it('错误信息应包含设置引导', () => {
      const envKey = 'CRAB_SCIENCE_OPENAI_API_KEY';
      delete process.env[envKey];

      try {
        manager.getApiKey('openai');
        expect.fail('应抛出错误');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain('export');
      }
    });
  });

  describe('validate', () => {
    it('有效配置应返回 valid: true', () => {
      const envKey = 'CRAB_SCIENCE_ANTHROPIC_API_KEY';
      process.env[envKey] = 'test-key';
      try {
        const result = manager.validate();
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      } finally {
        delete process.env[envKey];
      }
    });

    it('无效的 defaultProvider 应报错', () => {
      manager.load();
      manager.save({
        defaultProvider: 'invalid' as 'openai',
        defaultModel: 'gpt-4o',
        maxIterations: 50,
        bashTimeoutMs: 30000,
        workDir: '/test',
      });

      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('defaultProvider'))).toBe(true);
    });

    it('maxIterations < 1 应报错', () => {
      manager.load();
      manager.save({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-20250514',
        maxIterations: 0,
        bashTimeoutMs: 30000,
        workDir: '/test',
      });

      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('maxIterations'))).toBe(true);
    });

    it('bashTimeoutMs < 1000 应报错', () => {
      manager.load();
      manager.save({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-20250514',
        maxIterations: 50,
        bashTimeoutMs: 500,
        workDir: '/test',
      });

      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('bashTimeoutMs'))).toBe(true);
    });

    it('workDir 为空应报错', () => {
      manager.load();
      manager.save({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-20250514',
        maxIterations: 50,
        bashTimeoutMs: 30000,
        workDir: '',
      });

      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('workDir'))).toBe(true);
    });

    it('API Key 缺失应在 validate 中报错', () => {
      const envKey = 'CRAB_SCIENCE_ANTHROPIC_API_KEY';
      delete process.env[envKey];

      const result = manager.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('API Key'))).toBe(true);
    });
  });

  describe('update', () => {
    it('应部分更新配置', () => {
      manager.load();

      const updated = manager.update({ maxIterations: 100 });

      expect(updated.maxIterations).toBe(100);
      // 其他字段保持不变
      expect(updated.defaultProvider).toBe('anthropic');
    });

    it('更新后应保存到文件', () => {
      manager.load();
      manager.update({ defaultModel: 'gpt-4o' });

      // 重新创建 manager 读取
      const newManager = new ConfigManager(configDir);
      // 清除缓存效应 - 新实例会重新读取
      const config = newManager.load();

      expect(config.defaultModel).toBe('gpt-4o');
    });
  });

  describe('evolutionModel 校验 (EVO-002)', () => {
    it('空字符串 evolutionModel 应报错', () => {
      manager.update({ evolutionModel: '' });
      const result = manager.validate();
      expect(result.errors.some((e) => e.includes('evolutionModel'))).toBe(true);
    });

    it('无法识别前缀的 evolutionModel 应报错', () => {
      manager.update({ evolutionModel: 'gtp-4o-mini' });
      const result = manager.validate();
      expect(
        result.errors.some((e) => e.includes('evolutionModel') && e.includes('gtp-4o-mini')),
      ).toBe(true);
    });

    it('合法的 deepseek 前缀不应因 evolutionModel 报错', () => {
      manager.update({ evolutionModel: 'deepseek-chat' });
      const result = manager.validate();
      expect(result.errors.some((e) => e.includes('evolutionModel'))).toBe(false);
    });
  });
});
