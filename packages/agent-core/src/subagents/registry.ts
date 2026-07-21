import type {
  SubagentDefinition,
  SubagentFrontmatter,
} from '@crab-science/shared';
import type { SubagentLoader } from './loader.js';

/**
 * Subagent 注册表
 *
 * 管理 Subagent 的注册、查找和列举。
 * 作为 SubagentLoader 的上层封装，提供缓存和快速查找。
 */
export class SubagentRegistry {
  private loader: SubagentLoader;
  private definitions = new Map<string, SubagentDefinition>();
  private initialized = false;

  constructor(loader: SubagentLoader) {
    this.loader = loader;
  }

  /**
   * 初始化：加载所有 Subagent 定义
   */
  init(): void {
    if (this.initialized) return;

    const metas = this.loader.discover();

    for (const meta of metas) {
      const definition = this.loader.load(meta.name);
      if (definition) {
        this.definitions.set(meta.name, definition);
      }
    }

    this.initialized = true;
  }

  /**
   * 获取 Subagent 定义
   * @param name - Subagent 名称
   * @returns SubagentDefinition，未找到返回 null
   */
  get(name: string): SubagentDefinition | null {
    if (!this.initialized) {
      this.init();
    }

    // 先查缓存
    if (this.definitions.has(name)) {
      return this.definitions.get(name)!;
    }

    // 尝试从 loader 加载
    const definition = this.loader.load(name);
    if (definition) {
      this.definitions.set(name, definition);
      return definition;
    }

    return null;
  }

  /**
   * 列出所有 Subagent 元数据
   * @returns SubagentFrontmatter 数组
   */
  list(): SubagentFrontmatter[] {
    if (!this.initialized) {
      this.init();
    }

    return Array.from(this.definitions.values()).map((d) => d.meta);
  }

  /**
   * 注册新的 Subagent 定义
   * @param definition - Subagent 定义
   */
  register(definition: SubagentDefinition): void {
    this.definitions.set(definition.meta.name, definition);
  }

  /**
   * 刷新注册表（清除缓存并重新加载）
   */
  refresh(): void {
    this.definitions.clear();
    this.initialized = false;
    this.loader.clearCache();
    this.init();
  }

  /**
   * 检查 Subagent 是否存在
   * @param name - Subagent 名称
   */
  has(name: string): boolean {
    if (!this.initialized) {
      this.init();
    }
    return this.definitions.has(name);
  }

  /**
   * 获取可用 Subagent 数量
   */
  count(): number {
    if (!this.initialized) {
      this.init();
    }
    return this.definitions.size;
  }
}
