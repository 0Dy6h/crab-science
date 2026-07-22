import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';
import chokidar from 'chokidar';
import { createRequire } from 'module';
import type {
  LoadedExtension,
  ExtensionModule,
  ExtensionTool,
} from '@crab-science/shared';
import type { ToolRegistry } from '../tools/index.js';
import type { Tool } from '../tools/types.js';
import type { CachedExtension } from './types.js';
import { nowISO } from '@crab-science/shared';

// 在 ESM 环境中创建 require 函数
const nodeRequire = createRequire(import.meta.url);

/**
 * Extension 加载器（Phase 2 新增）
 *
 * 职责：
 * 1. 扫描 extensions 目录下的 .ts 文件
 * 2. 使用 esbuild 编译为 CJS 代码（内存缓存）
 * 3. 使用 new Function() 加载编译后代码
 * 4. 将导出的 tool 注册到 ToolRegistry
 * 5. 使用 chokidar 监听文件变化，自动 hot-reload
 */
export class ExtensionLoader {
  private extensionsDirs: string[];
  private toolRegistry: ToolRegistry;
  private loaded = new Map<string, CachedExtension>();
  private watcher?: chokidar.FSWatcher;

  /**
   * @param extensionsDirs - extension 搜索目录列表
   * @param toolRegistry - 工具注册表
   */
  constructor(extensionsDirs: string[], toolRegistry: ToolRegistry) {
    this.extensionsDirs = extensionsDirs;
    this.toolRegistry = toolRegistry;
  }

  /**
   * 发现并加载所有 extension
   * 扫描目录下的 .ts 文件，编译并注册
   * @returns 已加载的 extension 列表
   */
  async loadAll(): Promise<LoadedExtension[]> {
    const results: LoadedExtension[] = [];

    for (const dir of this.extensionsDirs) {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;

        const filePath = path.join(dir, entry.name);
        const loaded = await this.loadSingle(filePath);
        results.push(loaded);
      }
    }

    return results;
  }

  /**
   * 加载单个 extension 文件
   * @internal
   */
  private async loadSingle(filePath: string): Promise<LoadedExtension> {
    const name = path.basename(filePath, '.ts');
    const now = nowISO();

    try {
      // 1. 编译 TypeScript 为 CJS
      const code = await this.compileExtension(filePath);

      // 2. 加载编译后代码获取模块导出
      const module = this.loadModule(code, filePath);

      // 3. 注册工具
      let registeredToolName: string | undefined;
      if (module.tool) {
        this.registerTool(module.tool);
        registeredToolName = module.tool.name;
      }

      // 4. 缓存
      const cached: CachedExtension = {
        filePath,
        name,
        code,
        module,
        status: 'loaded',
        loadedAt: now,
        registeredToolName,
      };
      this.loaded.set(filePath, cached);

      return {
        filePath,
        name,
        module,
        status: 'loaded',
        loadedAt: now,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      const cached: CachedExtension = {
        filePath,
        name,
        code: '',
        module: null,
        status: 'error',
        error: errorMessage,
        loadedAt: now,
      };
      this.loaded.set(filePath, cached);

      console.error(
        `[ExtensionLoader] 加载 ${name} 失败: ${errorMessage}`,
      );

      return {
        filePath,
        name,
        module: {} as ExtensionModule,
        status: 'error',
        error: errorMessage,
        loadedAt: now,
      };
    }
  }

  /**
   * 编译 extension 文件为 CJS 代码
   * @internal
   */
  private async compileExtension(filePath: string): Promise<string> {
    try {
      const result = await esbuild.build({
        absWorkingDir: path.dirname(filePath),
        entryPoints: [`./${path.basename(filePath)}`],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        write: false,
        external: [],
        logLevel: 'silent',
        tsconfigRaw: {
          compilerOptions: {
            target: 'ES2022',
            module: 'CommonJS',
            moduleResolution: 'Node',
            esModuleInterop: true,
            skipLibCheck: true,
            strict: false,
          },
        },
      });
      return result.outputFiles[0].text;
    } catch (err) {
      if (!this.shouldFallbackToTransform(err)) {
        throw err;
      }
      return this.transformExtension(filePath);
    }
  }

  /**
   * esbuild.build 会向入口文件父目录一路查找配置/包信息。
   * 在受限 Windows 沙箱中，extension 位于用户临时目录时可能无法读取父目录。
   * transform 只处理已读取的单文件源码，适合作为无本地 import 的 extension 兜底路径。
   */
  private async transformExtension(filePath: string): Promise<string> {
    const source = fs.readFileSync(filePath, 'utf-8');
    this.assertTransformFallbackCompatible(filePath, source);
    const result = await esbuild.transform(source, {
      loader: 'ts',
      format: 'cjs',
      platform: 'node',
      target: 'es2022',
      sourcefile: filePath,
      logLevel: 'silent',
    });
    return result.code;
  }

  private assertTransformFallbackCompatible(
    filePath: string,
    source: string,
  ): void {
    const importPattern =
      /\bimport\s+(?:[^'"]+\s+from\s*)?['"][^'"]+['"]|\bexport\s+[^'"]*\s+from\s+['"][^'"]+['"]|\brequire\s*\(\s*['"][^'"]+['"]\s*\)/;

    if (importPattern.test(source)) {
      throw new Error(
        `Fallback transform cannot load extension imports: ${filePath}`,
      );
    }
  }

  private shouldFallbackToTransform(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return (
      message.includes('Access is denied') ||
      message.includes('Cannot read directory')
    );
  }

  /**
   * 加载编译后的代码并获取模块导出
   * 使用 new Function() 在隔离的作用域中执行 CJS 代码
   * @internal
   */
  private loadModule(code: string, filePath: string): ExtensionModule {
    const moduleObj = { exports: {} as Record<string, unknown> };

    // 使用 new Function 注入 module, exports, require
    const fn = new Function(
      'module',
      'exports',
      'require',
      '__dirname',
      '__filename',
      code,
    );

    fn(
      moduleObj,
      moduleObj.exports,
      nodeRequire,
      path.dirname(filePath),
      filePath,
    );

    return moduleObj.exports as unknown as ExtensionModule;
  }

  /**
   * 注册工具到 ToolRegistry
   * @internal
   */
  private registerTool(extTool: ExtensionTool): void {
    // 将 ExtensionTool 转换为 Tool 接口
    const tool: Tool = {
      name: extTool.name,
      description: extTool.description,
      parameters: extTool.parameters,
      execute: extTool.execute,
    };
    this.toolRegistry.register(tool);
  }

  /**
   * 卸载指定 extension
   * 从 ToolRegistry 中移除对应的工具
   * @param filePath - extension 文件路径
   */
  unload(filePath: string): void {
    const cached = this.loaded.get(filePath);
    if (!cached) return;

    // 卸载工具
    if (cached.registeredToolName) {
      this.toolRegistry.unregister(cached.registeredToolName);
    }

    this.loaded.delete(filePath);
  }

  /**
   * 重新加载指定 extension（hot-reload）
   * 卸载旧工具，重新编译加载
   * @param filePath - extension 文件路径
   * @returns 重新加载后的 extension 信息，失败返回 null
   */
  async reload(filePath: string): Promise<LoadedExtension | null> {
    // 卸载旧版本
    this.unload(filePath);

    // 重新加载
    try {
      return await this.loadSingle(filePath);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[ExtensionLoader] 重新加载 ${path.basename(filePath)} 失败: ${errorMessage}`,
      );
      return null;
    }
  }

  /**
   * 启动文件监听（hot-reload）
   * 使用 chokidar 监听 extension 目录变化
   */
  startWatching(): void {
    if (this.watcher) return;

    const existingDirs = this.extensionsDirs.filter((d) =>
      fs.existsSync(d),
    );
    if (existingDirs.length === 0) return;

    this.watcher = chokidar.watch(existingDirs, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher.on('change', (filePath: string) => {
      if (!filePath.endsWith('.ts')) return;
      // 异步重新加载
      this.reload(filePath).then((loaded) => {
        if (loaded && loaded.status === 'loaded') {
          console.log(
            `\n↻ extension ${loaded.name} 已重新加载`,
          );
        }
      });
    });

    this.watcher.on('add', (filePath: string) => {
      if (!filePath.endsWith('.ts')) return;
      this.loadSingle(filePath).then((loaded) => {
        if (loaded.status === 'loaded') {
          console.log(
            `\n↻ extension ${loaded.name} 已加载`,
          );
        }
      });
    });
  }

  /**
   * 停止文件监听
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  /**
   * 列出所有已加载的 extension
   * @returns 已加载 extension 列表
   */
  listLoaded(): LoadedExtension[] {
    const results: LoadedExtension[] = [];

    for (const cached of this.loaded.values()) {
      results.push({
        filePath: cached.filePath,
        name: cached.name,
        module: cached.module || ({} as ExtensionModule),
        status: cached.status,
        error: cached.error,
        loadedAt: cached.loadedAt,
      });
    }

    return results;
  }
}
