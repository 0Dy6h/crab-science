import type { ToolDefinition, ToolResult, ToolContext } from '@crab-science/shared';
import type { Tool } from './types.js';
import { ReadTool } from './read-tool.js';
import { WriteTool } from './write-tool.js';
import { EditTool } from './edit-tool.js';
import { BashTool } from './bash-tool.js';

/**
 * 工具注册表
 * 管理工具的注册、获取和执行
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  constructor(autoRegister = true) {
    if (autoRegister) {
      this.register(new ReadTool());
      this.register(new WriteTool());
      this.register(new EditTool());
      this.register(new BashTool());
    }
  }

  /** 注册工具 */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 卸载工具（Phase 2 新增）
   * 用于 Extension hot-reload 时移除旧工具
   * @param name - 工具名称
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /** 获取工具 */
  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`工具 "${name}" 未注册`);
    }
    return tool;
  }

  /** 获取所有工具定义（传给 LLM） */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /** 执行工具 */
  async execute(
    name: string,
    params: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    try {
      const tool = this.get(name);
      return await tool.execute(params, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: '',
        error: `工具执行错误: ${message}`,
      };
    }
  }

  /** 列出所有已注册工具名 */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /** 检查工具是否已注册 */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}

// 重新导出工具实现类
export { ReadTool, WriteTool, EditTool, BashTool };
export type { Tool, ToolContext, ToolResult, ToolDefinition };
