import type { ToolDefinition, ToolParameterSchema, ToolResult, ToolContext } from '@crab-science/shared';

// ============================================================
// Tool 接口定义
// ============================================================

/**
 * Tool 接口
 * 所有工具必须实现此接口
 */
export interface Tool {
  /** 工具名称（唯一标识） */
  name: string;
  /** 工具描述（传给 LLM） */
  description: string;
  /** 参数 schema（JSON Schema 子集） */
  parameters: ToolParameterSchema;
  /** 执行工具 */
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

// 重新导出共享类型，方便引用
export type { ToolDefinition, ToolParameterSchema, ToolResult, ToolContext };
