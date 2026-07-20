// ============================================================
// Extension 类型定义
// 从 shared 重新导出，方便 extensions 模块内部使用
// ============================================================

export type {
  ExtensionModule,
  ExtensionTool,
  ExtensionCommand,
  LoadedExtension,
  ToolParameterSchema,
  ToolResult,
  ToolContext,
} from '@crab-science/shared';

import type { LoadedExtension } from '@crab-science/shared';

/** 已加载 Extension 的内部缓存条目 */
export interface CachedExtension {
  /** Extension 文件路径 */
  filePath: string;
  /** Extension 名称 */
  name: string;
  /** 编译后的代码 */
  code: string;
  /** 加载后的模块 */
  module: LoadedExtension['module'] | null;
  /** 加载状态 */
  status: 'loaded' | 'error';
  /** 错误信息 */
  error?: string;
  /** 加载时间 */
  loadedAt: string;
  /** 注册的工具名（用于 unregister） */
  registeredToolName?: string;
}
