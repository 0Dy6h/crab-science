import type {
  SessionNode,
  NodeType,
  NodeMetadata,
  Message,
  ContentBlock,
} from '@crab-science/shared';
import { generateId, nowISO } from '@crab-science/shared';
import type { BranchInfo } from './types.js';

/**
 * Session Tree 工具函数
 * 提供路径提取、树遍历、节点转换等静态方法
 */
export class TreeUtils {
  /**
   * 从 root 到指定节点的路径
   * @param nodes - 扁平节点 Map
   * @param rootId - 根节点 ID
   * @param nodeId - 目标节点 ID
   * @returns 从 root 到目标节点的节点数组（有序）
   */
  static getPath(
    nodes: Record<string, SessionNode>,
    rootId: string,
    nodeId: string,
  ): SessionNode[] {
    if (!rootId || !nodeId || !nodes[nodeId]) {
      return [];
    }

    const path: SessionNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId && nodes[currentId]) {
      path.unshift(nodes[currentId]);
      if (currentId === rootId) break;
      currentId = nodes[currentId].parentId;
    }

    return path;
  }

  /**
   * 获取节点深度（root 深度为 0）
   * @param nodes - 扁平节点 Map
   * @param nodeId - 目标节点 ID
   * @returns 深度值
   */
  static getDepth(nodes: Record<string, SessionNode>, nodeId: string): number {
    let depth = 0;
    let currentId: string | null = nodeId;

    while (currentId !== null && nodes[currentId]) {
      const node: SessionNode = nodes[currentId];
      if (node.parentId === null) break;
      currentId = node.parentId;
      depth++;
    }

    return depth;
  }

  /**
   * 获取所有叶节点（没有子节点的节点）
   * @param nodes - 扁平节点 Map
   * @param rootId - 根节点 ID
   * @returns 叶节点数组
   */
  static getLeafNodes(
    nodes: Record<string, SessionNode>,
    rootId: string,
  ): SessionNode[] {
    const leaves: SessionNode[] = [];

    for (const node of Object.values(nodes)) {
      if (node.childrenIds.length === 0) {
        leaves.push(node);
      }
    }

    return leaves;
  }

  /**
   * 找出所有分支（叶节点 + 路径长度 + 分支原因）
   * @param nodes - 扁平节点 Map
   * @param rootId - 根节点 ID
   * @returns 分支信息列表
   */
  static findBranches(
    nodes: Record<string, SessionNode>,
    rootId: string,
  ): BranchInfo[] {
    const leafNodes = TreeUtils.getLeafNodes(nodes, rootId);
    const branches: BranchInfo[] = [];

    for (const leaf of leafNodes) {
      const path = TreeUtils.getPath(nodes, rootId, leaf.id);
      // 查找路径上是否有节点标记了 branchReason
      let branchReason: string | undefined;
      for (const node of path) {
        if (node.metadata.branchReason) {
          branchReason = node.metadata.branchReason;
          break;
        }
      }

      branches.push({
        leafNode: leaf,
        pathLength: path.length,
        branchReason,
      });
    }

    return branches;
  }

  /**
   * SessionNode 转换为 Message
   *
   * 转换规则：
   * | NodeType   | Message.role  | Message.content              | Message.toolCallId          |
   * |------------|---------------|------------------------------|------------------------------|
   * | user       | 'user'        | node.content                 | -                            |
   * | assistant  | 'assistant'   | node.content                 | -                            |
   * | tool_call  | 'assistant'   | ContentBlock[]（含 tool_use）| node.metadata.toolCallId     |
   * | tool_result| 'tool'        | node.content / metadata      | node.metadata.toolCallId     |
   * | summary    | 'assistant'   | node.metadata.summaryText    | -                            |
   *
   * @param node - Session 节点
   * @returns Message 对象，无法转换时返回 null
   */
  static nodeToMessage(node: SessionNode): Message | null {
    switch (node.type) {
      case 'user':
        return {
          role: 'user',
          content: node.content,
        };

      case 'assistant':
        return {
          role: 'assistant',
          content: node.content,
        };

      case 'tool_call': {
        // 构建 ContentBlock[]，包含 tool_use block
        const blocks: ContentBlock[] = [];
        // 如果有文本内容，添加 text block
        if (typeof node.content === 'string' && node.content.length > 0) {
          blocks.push({ type: 'text', text: node.content });
        } else if (Array.isArray(node.content)) {
          // 如果已经是 ContentBlock[]，直接使用
          blocks.push(...(node.content as ContentBlock[]));
        }
        // 添加 tool_use block
        blocks.push({
          type: 'tool_use',
          toolCallId: node.metadata.toolCallId,
          toolName: node.metadata.toolName,
          input: node.metadata.toolParams,
        });
        return {
          role: 'assistant',
          content: blocks,
          toolCallId: node.metadata.toolCallId,
        };
      }

      case 'tool_result': {
        // 优先从 content 读取，回退到 metadata.toolResult
        const resultContent =
          typeof node.content === 'string'
            ? node.content
            : node.metadata.toolResult || '';
        return {
          role: 'tool',
          content: resultContent,
          toolCallId: node.metadata.toolCallId,
        };
      }

      case 'summary':
        return {
          role: 'assistant',
          content:
            node.metadata.summaryText ||
            (typeof node.content === 'string' ? node.content : ''),
        };

      default:
        return null;
    }
  }

  /**
   * Phase 1 线性消息数组转换为树形节点 Map
   * 将 messages[] 转换为 root → 线性链 → leaf 的扁平结构
   *
   * @param messages - Phase 1 线性消息数组
   * @returns 扁平节点 Map、根节点 ID、叶节点 ID
   */
  static messagesToNodes(messages: Message[]): {
    nodes: Record<string, SessionNode>;
    rootId: string;
    leafId: string;
  } {
    const nodes: Record<string, SessionNode> = {};
    let rootId = '';
    let prevId: string | null = null;

    for (const msg of messages) {
      const nodeId = generateId('node');
      const timestamp = nowISO();

      // 根据 Message 角色确定 NodeType
      let type: NodeType;
      let content: string | ContentBlock[];
      const metadata: NodeMetadata = {};

      if (msg.role === 'user') {
        type = 'user';
        content = msg.content;
      } else if (msg.role === 'assistant') {
        type = 'assistant';
        content = msg.content;
      } else if (msg.role === 'tool') {
        type = 'tool_result';
        content =
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
        metadata.toolCallId = msg.toolCallId;
        metadata.toolResult =
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
      } else {
        // system 或未知角色，当作 assistant 处理
        type = 'assistant';
        content = msg.content;
      }

      const node: SessionNode = {
        id: nodeId,
        parentId: prevId,
        type,
        content,
        timestamp,
        childrenIds: [],
        metadata,
      };

      nodes[nodeId] = node;

      if (prevId) {
        nodes[prevId].childrenIds.push(nodeId);
      } else {
        rootId = nodeId;
      }

      prevId = nodeId;
    }

    return {
      nodes,
      rootId,
      leafId: prevId || rootId,
    };
  }
}
