import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExtensionLoader } from '../../src/extensions/loader.js';
import { ToolRegistry } from '../../src/tools/index.js';

// 检查 esbuild 和 chokidar 是否可用
let esbuildAvailable = false;
try {
  require.resolve('esbuild');
  require.resolve('chokidar');
  esbuildAvailable = true;
} catch {
  esbuildAvailable = false;
}

/**
 * 创建一个简单的测试 extension .ts 文件
 * 不依赖外部导入，避免 esbuild bundling 问题
 */
function createTestExtension(dir: string, name: string): string {
  const filePath = path.join(dir, `${name}.ts`);
  const code = `interface ToolResult { success: boolean; output: string; error?: string; }
interface ToolContext { workDir: string; sessionId: string; }

export const tool = {
  name: '${name}',
  description: 'Test extension tool: ${name}',
  parameters: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'test query' }
    },
    required: ['query']
  },
  execute: async (params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
    const query = params.query as string;
    return { success: true, output: 'result: ' + query };
  }
};
`;
  fs.writeFileSync(filePath, code);
  return filePath;
}

/**
 * 创建一个不导出 tool 的 extension
 */
function createNoToolExtension(dir: string, name: string): string {
  const filePath = path.join(dir, `${name}.ts`);
  const code = `export const version = '1.0.0';
export const description = 'No tool extension';
`;
  fs.writeFileSync(filePath, code);
  return filePath;
}

/**
 * 创建一个有语法错误的 extension
 */
function createBrokenExtension(dir: string, name: string): string {
  const filePath = path.join(dir, `${name}.ts`);
  // 故意写入语法错误
  const code = `export const tool = { name: 'broken',,, ;`;
  fs.writeFileSync(filePath, code);
  return filePath;
}

// 条件跳过：esbuild/chokidar 未安装时跳过所有测试
describe.skipIf(!esbuildAvailable)('ExtensionLoader', () => {
  let extensionsDir: string;
  let registry: ToolRegistry;
  let loader: ExtensionLoader;

  beforeEach(() => {
    extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-ext-'));
    registry = new ToolRegistry(false); // 不自动注册内置工具
    loader = new ExtensionLoader([extensionsDir], registry);
  });

  afterEach(() => {
    loader.stopWatching();
    fs.rmSync(extensionsDir, { recursive: true, force: true });
  });

  // ============================================================
  // loadAll
  // ============================================================

  describe('loadAll', () => {
    it('应扫描并加载所有 .ts extension 文件', async () => {
      createTestExtension(extensionsDir, 'ext-a');
      createTestExtension(extensionsDir, 'ext-b');

      const loaded = await loader.loadAll();

      expect(loaded.length).toBe(2);
      const names = loaded.map((l) => l.name);
      expect(names).toContain('ext-a');
      expect(names).toContain('ext-b');
    });

    it('加载的 extension 状态应为 loaded', async () => {
      createTestExtension(extensionsDir, 'test-ext');

      const loaded = await loader.loadAll();

      expect(loaded[0].status).toBe('loaded');
      expect(loaded[0].module).toBeDefined();
      expect(loaded[0].loadedAt).toBeTruthy();
    });

    it('应将 extension 工具注册到 ToolRegistry', async () => {
      createTestExtension(extensionsDir, 'registered-tool');

      await loader.loadAll();

      expect(registry.has('registered-tool')).toBe(true);
    });

    it('不导出 tool 的 extension 应加载但不注册工具', async () => {
      createNoToolExtension(extensionsDir, 'no-tool-ext');

      const loaded = await loader.loadAll();

      expect(loaded.length).toBe(1);
      expect(loaded[0].status).toBe('loaded');
      // 没有工具被注册
      expect(registry.list().length).toBe(0);
    });

    it('有语法错误的 extension 应标记为 error 状态', async () => {
      createBrokenExtension(extensionsDir, 'broken-ext');

      const loaded = await loader.loadAll();

      expect(loaded.length).toBe(1);
      expect(loaded[0].status).toBe('error');
      expect(loaded[0].error).toBeTruthy();
    });

    it('空目录应返回空数组', async () => {
      const loaded = await loader.loadAll();

      expect(loaded).toEqual([]);
    });

    it('应跳过非 .ts 文件', async () => {
      createTestExtension(extensionsDir, 'real-ext');
      // 创建非 .ts 文件
      fs.writeFileSync(path.join(extensionsDir, 'readme.md'), '# Readme');
      fs.writeFileSync(path.join(extensionsDir, 'config.json'), '{}');

      const loaded = await loader.loadAll();

      expect(loaded.length).toBe(1);
      expect(loaded[0].name).toBe('real-ext');
    });

    it('不存在的目录应返回空数组', async () => {
      const emptyLoader = new ExtensionLoader(['/nonexistent/path'], registry);
      const loaded = await emptyLoader.loadAll();

      expect(loaded).toEqual([]);
    });

    it('混合加载：成功和失败的 extension 都应返回', async () => {
      createTestExtension(extensionsDir, 'good-ext');
      createBrokenExtension(extensionsDir, 'bad-ext');

      const loaded = await loader.loadAll();

      expect(loaded.length).toBe(2);
      const good = loaded.find((l) => l.name === 'good-ext');
      const bad = loaded.find((l) => l.name === 'bad-ext');
      expect(good!.status).toBe('loaded');
      expect(bad!.status).toBe('error');
    });
  });

  // ============================================================
  // unload
  // ============================================================

  describe('unload', () => {
    it('应卸载 extension 并从 ToolRegistry 移除工具', async () => {
      const filePath = createTestExtension(extensionsDir, 'unload-test');

      await loader.loadAll();
      expect(registry.has('unload-test')).toBe(true);

      loader.unload(filePath);

      expect(registry.has('unload-test')).toBe(false);
    });

    it('卸载不存在的 extension 不应报错', () => {
      expect(() => loader.unload('/nonexistent/path.ts')).not.toThrow();
    });

    it('卸载后 listLoaded 不应包含该 extension', async () => {
      const filePath = createTestExtension(extensionsDir, 'remove-me');

      await loader.loadAll();
      expect(loader.listLoaded().length).toBe(1);

      loader.unload(filePath);

      expect(loader.listLoaded().length).toBe(0);
    });
  });

  // ============================================================
  // reload
  // ============================================================

  describe('reload', () => {
    it('应重新加载 extension', async () => {
      const filePath = createTestExtension(extensionsDir, 'reload-test');

      await loader.loadAll();
      const original = loader.listLoaded()[0];

      const reloaded = await loader.reload(filePath);

      expect(reloaded).not.toBeNull();
      expect(reloaded!.status).toBe('loaded');
      expect(reloaded!.name).toBe('reload-test');
    });

    it('reload 后工具应重新注册', async () => {
      const filePath = createTestExtension(extensionsDir, 're-reg');

      await loader.loadAll();
      expect(registry.has('re-reg')).toBe(true);

      await loader.reload(filePath);

      expect(registry.has('re-reg')).toBe(true);
    });

    it('reload 不存在的文件应返回错误状态', async () => {
      // reload 调用 loadSingle，后者捕获所有错误并返回 error 状态
      const result = await loader.reload('/nonexistent/file.ts');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('error');
      expect(result!.error).toBeTruthy();
    });

    it('reload 后应反映文件内容变化', async () => {
      const filePath = createTestExtension(extensionsDir, 'update-test');

      await loader.loadAll();
      const original = loader.listLoaded()[0];

      // 修改文件内容
      fs.writeFileSync(filePath, `interface ToolResult { success: boolean; output: string; }
interface ToolContext { workDir: string; sessionId: string; }
export const tool = {
  name: 'updated-name',
  description: 'Updated description',
  parameters: { type: 'object' as const, properties: { q: { type: 'string', description: 'q' } }, required: ['q'] },
  execute: async (params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
    return { success: true, output: 'updated: ' + params.q };
  }
};`);

      const reloaded = await loader.reload(filePath);

      expect(reloaded).not.toBeNull();
      expect(reloaded!.status).toBe('loaded');

      // 旧工具应被注销，新工具应被注册
      expect(registry.has('update-test')).toBe(false);
      expect(registry.has('updated-name')).toBe(true);
    });
  });

  // ============================================================
  // listLoaded
  // ============================================================

  describe('listLoaded', () => {
    it('应列出所有已加载的 extension', async () => {
      createTestExtension(extensionsDir, 'ext-1');
      createTestExtension(extensionsDir, 'ext-2');

      await loader.loadAll();

      const loaded = loader.listLoaded();
      expect(loaded.length).toBe(2);
    });

    it('未加载任何 extension 时应返回空数组', () => {
      const loaded = loader.listLoaded();
      expect(loaded).toEqual([]);
    });

    it('应包含正确的 LoadedExtension 字段', async () => {
      createTestExtension(extensionsDir, 'check-fields');

      await loader.loadAll();

      const loaded = loader.listLoaded();
      expect(loaded[0].filePath).toBeTruthy();
      expect(loaded[0].name).toBe('check-fields');
      expect(loaded[0].status).toBe('loaded');
      expect(loaded[0].loadedAt).toBeTruthy();
    });

    it('错误的 extension 也应出现在 listLoaded 中', async () => {
      createBrokenExtension(extensionsDir, 'error-ext');

      await loader.loadAll();

      const loaded = loader.listLoaded();
      expect(loaded.length).toBe(1);
      expect(loaded[0].status).toBe('error');
      expect(loaded[0].error).toBeTruthy();
    });
  });

  // ============================================================
  // startWatching / stopWatching
  // ============================================================

  describe('startWatching / stopWatching', () => {
    it('startWatching 不应报错', () => {
      expect(() => loader.startWatching()).not.toThrow();
    });

    it('stopWatching 不应报错', () => {
      loader.startWatching();
      expect(() => loader.stopWatching()).not.toThrow();
    });

    it('多次 startWatching 不应创建多个 watcher', () => {
      loader.startWatching();
      loader.startWatching(); // 应幂等
      expect(() => loader.stopWatching()).not.toThrow();
    });

    it('stopWatching 后可以再次 startWatching', () => {
      loader.startWatching();
      loader.stopWatching();
      expect(() => loader.startWatching()).not.toThrow();
      loader.stopWatching();
    });

    it('不存在的目录不应启动 watcher', () => {
      const emptyLoader = new ExtensionLoader(['/nonexistent'], registry);
      expect(() => emptyLoader.startWatching()).not.toThrow();
      emptyLoader.stopWatching();
    });
  });

  // ============================================================
  // 多目录搜索
  // ============================================================

  describe('多目录搜索', () => {
    it('应从多个目录加载 extension', async () => {
      const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-ext2-'));
      try {
        createTestExtension(extensionsDir, 'from-dir1');
        createTestExtension(dir2, 'from-dir2');

        const multiLoader = new ExtensionLoader([extensionsDir, dir2], registry);
        const loaded = await multiLoader.loadAll();

        expect(loaded.length).toBe(2);
        const names = loaded.map((l) => l.name);
        expect(names).toContain('from-dir1');
        expect(names).toContain('from-dir2');
      } finally {
        fs.rmSync(dir2, { recursive: true, force: true });
      }
    });
  });

  // ============================================================
  // 工具执行验证
  // ============================================================

  describe('工具执行', () => {
    it('加载的 extension 工具应可通过 ToolRegistry 执行', async () => {
      createTestExtension(extensionsDir, 'executable-tool');

      await loader.loadAll();

      const result = await registry.execute(
        'executable-tool',
        { query: 'test-query' },
        { workDir: '/tmp', sessionId: 'test-session' },
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('result: test-query');
    });
  });
});
