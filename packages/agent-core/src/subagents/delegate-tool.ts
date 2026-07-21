import type {
  ToolResult,
  ToolContext,
  Session,
  SubagentDefinition,
  ToolParameterSchema,
} from '@crab-science/shared';
import type { Tool } from '../tools/types.js';
import type { SubagentRegistry } from './registry.js';

/** 委派函数类型（由 Agent 注入，封装 SubagentDelegator） */
export type DelegateFunction = (
  session: Session,
  subagent: SubagentDefinition,
  task: string,
) => Promise<{ summary: string; success: boolean }>;

/**
 * Delegate 工具 — 允许 Agent 将任务委派给 Subagent
 *
 * 当 Agent 识别到适合 Subagent 处理的任务时，
 * 通过此工具委派执行，获取摘要结果。
 *
 * 工具参数：
 * - subagent: Subagent 名称
 * - task: 委派任务描述
 */
export class DelegateTool implements Tool {
  name = 'delegate';
  description =
    '将任务委派给指定的 Subagent 执行。当任务匹配某个 Subagent 的专长时使用。';

  parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      subagent: {
        type: 'string',
        description:
          'Subagent 名称（参见系统提示中的可用 Subagent 列表）',
      },
      task: {
        type: 'string',
        description: '委派给 Subagent 的任务描述（清晰、具体的指令）',
      },
    },
    required: ['subagent', 'task'],
  };

  private registry: SubagentRegistry;
  private delegateFn: DelegateFunction;
  private getSession: () => Session | null;

  constructor(
    registry: SubagentRegistry,
    delegateFn: DelegateFunction,
    getSession: () => Session | null,
  ) {
    this.registry = registry;
    this.delegateFn = delegateFn;
    this.getSession = getSession;
  }

  /**
   * 执行委派
   */
  async execute(
    params: Record<string, unknown>,
    _ctx: ToolContext,
  ): Promise<ToolResult> {
    const subagentName = params.subagent as string;
    const task = params.task as string;

    if (!subagentName || !task) {
      return {
        success: false,
        output: '',
        error: '参数缺失：需要 subagent 和 task 参数',
      };
    }

    // 获取 Subagent 定义
    const subagent = this.registry.get(subagentName);
    if (!subagent) {
      const available = this.registry
        .list()
        .map((s) => s.name)
        .join(', ');
      return {
        success: false,
        output: '',
        error: `Subagent "${subagentName}" 未找到。可用: ${available || '无'}`,
      };
    }

    // 获取当前 Session
    const session = this.getSession();
    if (!session) {
      return {
        success: false,
        output: '',
        error: '无活跃 Session',
      };
    }

    // 执行委派
    try {
      const result = await this.delegateFn(session, subagent, task);

      return {
        success: result.success,
        output: result.summary,
        error: result.success ? undefined : result.summary,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: '',
        error: `委派执行失败: ${message}`,
      };
    }
  }
}
