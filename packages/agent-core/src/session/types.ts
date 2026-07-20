import type { Session, SessionMeta, Message, SessionNode } from '@crab-science/shared';

// ============================================================
// Session 模块类型定义
// Session 和 SessionMeta 从 shared 导入，这里做本地扩展
// ============================================================

export type { Session, SessionMeta, Message, SessionNode };

/** Session 创建选项 */
export interface CreateSessionOptions {
  model: string;
  provider: string;
  workDir?: string;
}

// ============ Phase 2 新增类型 ============

/** Fork 选项 */
export interface ForkOptions {
  /** 从指定节点 fork（默认 currentNodeId） */
  fromNodeId?: string;
  /** 分支原因 */
  reason?: string;
}

/** 分支信息 */
export interface BranchInfo {
  /** 叶节点 */
  leafNode: SessionNode;
  /** 从 root 到叶节点的路径长度 */
  pathLength: number;
  /** 分支原因（如果有） */
  branchReason?: string;
}

/** 树结构（用于 /tree 命令可视化） */
export interface TreeStructure {
  /** 根节点 */
  root: SessionNode;
  /** 所有分支（每个分支是从 root 到叶节点的节点数组） */
  branches: SessionNode[][];
}
