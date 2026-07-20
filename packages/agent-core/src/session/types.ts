import type { Session, SessionMeta, Message } from '@crab-science/shared';

// ============================================================
// Session 模块类型定义
// Session 和 SessionMeta 从 shared 导入，这里做本地扩展
// ============================================================

export type { Session, SessionMeta, Message };

/** Session 创建选项 */
export interface CreateSessionOptions {
  model: string;
  provider: string;
  workDir?: string;
}
