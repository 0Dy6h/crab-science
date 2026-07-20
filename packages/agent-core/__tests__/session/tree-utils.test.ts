import { describe, it, expect } from 'vitest';
import { TreeUtils } from '../../src/session/tree-utils.js';
import type {
  SessionNode,
  NodeType,
  NodeMetadata,
  Message,
  ContentBlock,
} from '@crab-science/shared';

// ============================================================
// Helper: 创建测试用节点
// ============================================================

function makeNode(
  id: string,
  parentId: string | null,
  type: NodeType,
  content: string | ContentBlock[],
  metadata: NodeMetadata = {},
  childrenIds: string[] = [],
): SessionNode {
  return {
    id,
    parentId,
    type,
    content,
    timestamp: '2024-01-01T00:00:00.000Z',
    childrenIds,
    metadata,
  };
}

/** 构建线性链: root → n1 → n2 → n3 */
function makeLinearChain(): {
  nodes: Record<string, SessionNode>;
  rootId: string;
  leafId: string;
} {
  const nodes: Record<string, SessionNode> = {};
  const ids = ['root', 'n1', 'n2', 'n3'];

  for (let i = 0; i < ids.length; i++) {
    const parentId = i === 0 ? null : ids[i - 1];
    const childrenIds = i < ids.length - 1 ? [ids[i + 1]] : [];
    nodes[ids[i]] = makeNode(
      ids[i],
      parentId,
      i % 2 === 0 ? 'user' : 'assistant',
      `content-${ids[i]}`,
      {},
      childrenIds,
    );
  }

  return { nodes, rootId: 'root', leafId: 'n3' };
}

/** 构建分支树:
 *        root
 *       /    \
 *     n1a    n1b
 *     /        \
 *   n2a       n2b
 */
function makeBranchedTree(): {
  nodes: Record<string, SessionNode>;
  rootId: string;
} {
  const nodes: Record<string, SessionNode> = {
    root: makeNode('root', null, 'user', 'root-content', { branchReason: 'initial' }, ['n1a', 'n1b']),
    n1a: makeNode('n1a', 'root', 'assistant', 'branch-a-msg1', {}, ['n2a']),
    n1b: makeNode('n1b', 'root', 'assistant', 'branch-b-msg1', { branchReason: 'alternative approach' }, ['n2b']),
    n2a: makeNode('n2a', 'n1a', 'user', 'branch-a-msg2', {}, []),
    n2b: makeNode('n2b', 'n1b', 'user', 'branch-b-msg2', {}, []),
  };

  return { nodes, rootId: 'root' };
}

describe('TreeUtils', () => {
  // ============================================================
  // getPath
  // ============================================================

  describe('getPath', () => {
    it('应返回从 root 到目标节点的有序路径', () => {
      const { nodes, rootId } = makeLinearChain();

      const path = TreeUtils.getPath(nodes, rootId, 'n2');

      expect(path.length).toBe(3);
      expect(path[0].id).toBe('root');
      expect(path[1].id).toBe('n1');
      expect(path[2].id).toBe('n2');
    });

    it('目标为 root 时应返回单元素数组', () => {
      const { nodes, rootId } = makeLinearChain();

      const path = TreeUtils.getPath(nodes, rootId, 'root');

      expect(path.length).toBe(1);
      expect(path[0].id).toBe('root');
    });

    it('目标为叶节点时应返回完整路径', () => {
      const { nodes, rootId } = makeLinearChain();

      const path = TreeUtils.getPath(nodes, rootId, 'n3');

      expect(path.length).toBe(4);
      expect(path[0].id).toBe('root');
      expect(path[3].id).toBe('n3');
    });

    it('分支树中应返回对应分支的路径', () => {
      const { nodes, rootId } = makeBranchedTree();

      const pathA = TreeUtils.getPath(nodes, rootId, 'n2a');
      expect(pathA.length).toBe(3);
      expect(pathA[0].id).toBe('root');
      expect(pathA[1].id).toBe('n1a');
      expect(pathA[2].id).toBe('n2a');

      const pathB = TreeUtils.getPath(nodes, rootId, 'n2b');
      expect(pathB.length).toBe(3);
      expect(pathB[0].id).toBe('root');
      expect(pathB[1].id).toBe('n1b');
      expect(pathB[2].id).toBe('n2b');
    });

    it('空 rootId 应返回空数组', () => {
      const { nodes } = makeLinearChain();
      const path = TreeUtils.getPath(nodes, '', 'n2');
      expect(path).toEqual([]);
    });

    it('空 nodeId 应返回空数组', () => {
      const { nodes, rootId } = makeLinearChain();
      const path = TreeUtils.getPath(nodes, rootId, '');
      expect(path).toEqual([]);
    });

    it('不存在的 nodeId 应返回空数组', () => {
      const { nodes, rootId } = makeLinearChain();
      const path = TreeUtils.getPath(nodes, rootId, 'nonexistent');
      expect(path).toEqual([]);
    });

    it('空 nodes Map 应返回空数组', () => {
      const path = TreeUtils.getPath({}, 'root', 'n1');
      expect(path).toEqual([]);
    });
  });

  // ============================================================
  // getDepth
  // ============================================================

  describe('getDepth', () => {
    it('root 节点深度为 0', () => {
      const { nodes } = makeLinearChain();
      expect(TreeUtils.getDepth(nodes, 'root')).toBe(0);
    });

    it('子节点深度为 1', () => {
      const { nodes } = makeLinearChain();
      expect(TreeUtils.getDepth(nodes, 'n1')).toBe(1);
    });

    it('深层节点深度正确', () => {
      const { nodes } = makeLinearChain();
      expect(TreeUtils.getDepth(nodes, 'n2')).toBe(2);
      expect(TreeUtils.getDepth(nodes, 'n3')).toBe(3);
    });

    it('分支树中各分支节点深度正确', () => {
      const { nodes } = makeBranchedTree();
      expect(TreeUtils.getDepth(nodes, 'root')).toBe(0);
      expect(TreeUtils.getDepth(nodes, 'n1a')).toBe(1);
      expect(TreeUtils.getDepth(nodes, 'n1b')).toBe(1);
      expect(TreeUtils.getDepth(nodes, 'n2a')).toBe(2);
      expect(TreeUtils.getDepth(nodes, 'n2b')).toBe(2);
    });

    it('不存在的节点深度为 0', () => {
      const { nodes } = makeLinearChain();
      expect(TreeUtils.getDepth(nodes, 'nonexistent')).toBe(0);
    });
  });

  // ============================================================
  // getLeafNodes
  // ============================================================

  describe('getLeafNodes', () => {
    it('线性链应返回一个叶节点', () => {
      const { nodes, rootId } = makeLinearChain();
      const leaves = TreeUtils.getLeafNodes(nodes, rootId);

      expect(leaves.length).toBe(1);
      expect(leaves[0].id).toBe('n3');
    });

    it('分支树应返回多个叶节点', () => {
      const { nodes, rootId } = makeBranchedTree();
      const leaves = TreeUtils.getLeafNodes(nodes, rootId);

      expect(leaves.length).toBe(2);
      const leafIds = leaves.map((l) => l.id);
      expect(leafIds).toContain('n2a');
      expect(leafIds).toContain('n2b');
    });

    it('单节点树应返回该节点作为叶节点', () => {
      const nodes: Record<string, SessionNode> = {
        only: makeNode('only', null, 'user', 'content', {}, []),
      };
      const leaves = TreeUtils.getLeafNodes(nodes, 'only');

      expect(leaves.length).toBe(1);
      expect(leaves[0].id).toBe('only');
    });

    it('空 nodes 应返回空数组', () => {
      const leaves = TreeUtils.getLeafNodes({}, 'root');
      expect(leaves).toEqual([]);
    });
  });

  // ============================================================
  // findBranches
  // ============================================================

  describe('findBranches', () => {
    it('线性链应返回一个分支', () => {
      const { nodes, rootId } = makeLinearChain();
      const branches = TreeUtils.findBranches(nodes, rootId);

      expect(branches.length).toBe(1);
      expect(branches[0].leafNode.id).toBe('n3');
      expect(branches[0].pathLength).toBe(4);
    });

    it('分支树应返回多个分支', () => {
      const { nodes, rootId } = makeBranchedTree();
      const branches = TreeUtils.findBranches(nodes, rootId);

      expect(branches.length).toBe(2);
      const leafIds = branches.map((b) => b.leafNode.id);
      expect(leafIds).toContain('n2a');
      expect(leafIds).toContain('n2b');
    });

    it('应返回正确的路径长度', () => {
      const { nodes, rootId } = makeBranchedTree();
      const branches = TreeUtils.findBranches(nodes, rootId);

      for (const branch of branches) {
        expect(branch.pathLength).toBe(3); // root → n1x → n2x
      }
    });

    it('应提取路径上的 branchReason', () => {
      const { nodes, rootId } = makeBranchedTree();
      const branches = TreeUtils.findBranches(nodes, rootId);

      // 两个分支都经过 root，root 有 branchReason 'initial'
      for (const branch of branches) {
        expect(branch.branchReason).toBeDefined();
      }

      // n1b 分支应包含 'alternative approach'
      const branchB = branches.find((b) => b.leafNode.id === 'n2b');
      // findBranches 取路径上第一个 branchReason，root 的 'initial' 先于 n1b 的
      expect(branchB!.branchReason).toBe('initial');
    });

    it('无 branchReason 的分支应返回 undefined', () => {
      const { nodes, rootId } = makeLinearChain();
      const branches = TreeUtils.findBranches(nodes, rootId);

      // 线性链中的节点没有 branchReason
      expect(branches[0].branchReason).toBeUndefined();
    });
  });

  // ============================================================
  // nodeToMessage
  // ============================================================

  describe('nodeToMessage', () => {
    it('user 节点应转换为 user 消息', () => {
      const node = makeNode('n1', null, 'user', 'Hello world', {});

      const msg = TreeUtils.nodeToMessage(node);

      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('user');
      expect(msg!.content).toBe('Hello world');
      expect(msg!.toolCallId).toBeUndefined();
    });

    it('assistant 节点应转换为 assistant 消息', () => {
      const node = makeNode('n1', null, 'assistant', 'Hi there', {});

      const msg = TreeUtils.nodeToMessage(node);

      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('assistant');
      expect(msg!.content).toBe('Hi there');
    });

    it('tool_call 节点应转换为含 tool_use block 的 assistant 消息', () => {
      const node = makeNode('n1', null, 'tool_call', 'Thinking about tool', {
        toolName: 'bash',
        toolParams: { command: 'ls -la' },
        toolCallId: 'call_123',
      });

      const msg = TreeUtils.nodeToMessage(node);

      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('assistant');
      expect(Array.isArray(msg!.content)).toBe(true);

      const blocks = msg!.content as ContentBlock[];
      // 应包含 text block + tool_use block
      expect(blocks.length).toBe(2);
      expect(blocks[0].type).toBe('text');
      expect(blocks[0].text).toBe('Thinking about tool');
      expect(blocks[1].type).toBe('tool_use');
      expect(blocks[1].toolName).toBe('bash');
      expect(blocks[1].toolCallId).toBe('call_123');
      expect(blocks[1].input).toEqual({ command: 'ls -la' });
      expect(msg!.toolCallId).toBe('call_123');
    });

    it('tool_call 节点空文本内容时只应有 tool_use block', () => {
      const node = makeNode('n1', null, 'tool_call', '', {
        toolName: 'read',
        toolParams: { path: '/tmp/test' },
        toolCallId: 'call_456',
      });

      const msg = TreeUtils.nodeToMessage(node);

      expect(msg).not.toBeNull();
      const blocks = msg!.content as ContentBlock[];
      expect(blocks.length).toBe(1);
      expect(blocks[0].type).toBe('tool_use');
    });

    it('tool_call 节点 ContentBlock[] 内容时应直接扩展', () => {
      const existingBlocks: ContentBlock[] = [
        { type: 'text', text: 'existing text' },
      ];
      const node = makeNode('n1', null, 'tool_call', existingBlocks, {
        toolName: 'write',
        toolParams: { path: '/tmp/out' },
        toolCallId: 'call_789',
      });

      const msg = TreeUtils.nodeToMessage(node);

      const blocks = msg!.content as ContentBlock[];
      expect(blocks.length).toBe(2);
      expect(blocks[0].type).toBe('text');
      expect(blocks[1].type).toBe('tool_use');
    });

    it('tool_result 节点应转换为 tool 消息', () => {
      const node = makeNode('n1', null, 'tool_result', 'command output here', {
        toolCallId: 'call_123',
        toolResult: 'command output here',
      });

      const msg = TreeUtils.nodeToMessage(node);

      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('tool');
      expect(msg!.content).toBe('command output here');
      expect(msg!.toolCallId).toBe('call_123');
    });

    it('tool_result 节点 ContentBlock[] content 时应回退到 metadata.toolResult', () => {
      const node = makeNode(
        'n1',
        null,
        'tool_result',
        [{ type: 'text', text: 'block' }] as ContentBlock[],  // 非字符串 content
        {
          toolCallId: 'call_123',
          toolResult: 'fallback result',
        },
      );

      const msg = TreeUtils.nodeToMessage(node);

      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('tool');
      // content 为非字符串时回退到 metadata.toolResult
      expect(msg!.content).toBe('fallback result');
    });

    it('summary 节点应转换为 assistant 消息，使用 summaryText', () => {
      const node = makeNode('n1', null, 'summary', 'raw content', {
        summaryText: 'This is a summary of the conversation.',
        sourceBranchLeafId: 'old-leaf',
      });

      const msg = TreeUtils.nodeToMessage(node);

      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('assistant');
      expect(msg!.content).toBe('This is a summary of the conversation.');
    });

    it('summary 节点无 summaryText 时回退到 content', () => {
      const node = makeNode('n1', null, 'summary', 'fallback content', {
        sourceBranchLeafId: 'old-leaf',
      });

      const msg = TreeUtils.nodeToMessage(node);

      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('assistant');
      expect(msg!.content).toBe('fallback content');
    });

    it('summary 节点无 summaryText 且 content 为数组时应返回空字符串', () => {
      const node = makeNode(
        'n1',
        null,
        'summary',
        [{ type: 'text', text: 'block' }] as ContentBlock[],
        {},
      );

      const msg = TreeUtils.nodeToMessage(node);

      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('assistant');
      expect(msg!.content).toBe('');
    });

    it('未知节点类型应返回 null', () => {
      const node = makeNode('n1', null, 'user' as NodeType, 'content', {});
      // 强制篡改 type 为非法值
      (node as Record<string, unknown>).type = 'unknown_type';

      const msg = TreeUtils.nodeToMessage(node);

      expect(msg).toBeNull();
    });
  });

  // ============================================================
  // messagesToNodes
  // ============================================================

  describe('messagesToNodes', () => {
    it('空消息数组应返回空 nodes 和空 rootId', () => {
      const result = TreeUtils.messagesToNodes([]);

      expect(Object.keys(result.nodes).length).toBe(0);
      expect(result.rootId).toBe('');
      expect(result.leafId).toBe('');
    });

    it('应将 user 消息转换为 user 节点', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
      ];

      const result = TreeUtils.messagesToNodes(messages);

      expect(Object.keys(result.nodes).length).toBe(1);
      expect(result.rootId).toBeTruthy();
      expect(result.leafId).toBe(result.rootId);

      const root = result.nodes[result.rootId];
      expect(root.type).toBe('user');
      expect(root.content).toBe('Hello');
      expect(root.parentId).toBeNull();
      expect(root.childrenIds).toEqual([]);
    });

    it('应将 assistant 消息转换为 assistant 节点', () => {
      const messages: Message[] = [
        { role: 'user', content: 'question' },
        { role: 'assistant', content: 'answer' },
      ];

      const result = TreeUtils.messagesToNodes(messages);

      expect(Object.keys(result.nodes).length).toBe(2);
      const ids = Object.keys(result.nodes);

      const assistantNode = result.nodes[ids[1]];
      expect(assistantNode.type).toBe('assistant');
      expect(assistantNode.content).toBe('answer');
    });

    it('应将 tool 消息转换为 tool_result 节点', () => {
      const messages: Message[] = [
        { role: 'user', content: 'run command' },
        { role: 'tool', content: 'command output', toolCallId: 'call_1' },
      ];

      const result = TreeUtils.messagesToNodes(messages);

      const ids = Object.keys(result.nodes);
      const toolNode = result.nodes[ids[1]];

      expect(toolNode.type).toBe('tool_result');
      expect(toolNode.content).toBe('command output');
      expect(toolNode.metadata.toolCallId).toBe('call_1');
      expect(toolNode.metadata.toolResult).toBe('command output');
    });

    it('应将 system 消息当作 assistant 节点处理', () => {
      const messages: Message[] = [
        { role: 'system', content: 'system prompt' },
      ];

      const result = TreeUtils.messagesToNodes(messages);

      const ids = Object.keys(result.nodes);
      const systemNode = result.nodes[ids[0]];

      expect(systemNode.type).toBe('assistant');
      expect(systemNode.content).toBe('system prompt');
    });

    it('应构建正确的线性链结构', () => {
      const messages: Message[] = [
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'reply1' },
        { role: 'user', content: 'msg2' },
        { role: 'assistant', content: 'reply2' },
      ];

      const result = TreeUtils.messagesToNodes(messages);

      expect(Object.keys(result.nodes).length).toBe(4);

      // 验证链结构
      const rootId = result.rootId;
      const leafId = result.leafId;

      // root: parentId=null, has 1 child
      expect(result.nodes[rootId].parentId).toBeNull();
      expect(result.nodes[rootId].childrenIds.length).toBe(1);

      // leaf: parentId=prev, no children
      expect(result.nodes[leafId].childrenIds).toEqual([]);
      expect(result.nodes[leafId].parentId).toBeTruthy();

      // root != leaf (4 nodes)
      expect(rootId).not.toBe(leafId);
    });

    it('应正确设置 parentId 和 childrenIds', () => {
      const messages: Message[] = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ];

      const result = TreeUtils.messagesToNodes(messages);
      const root = result.nodes[result.rootId];
      const leaf = result.nodes[result.leafId];

      expect(root.parentId).toBeNull();
      expect(root.childrenIds).toContain(result.leafId);
      expect(leaf.parentId).toBe(result.rootId);
      expect(leaf.childrenIds).toEqual([]);
    });

    it('tool 消息的 ContentBlock[] content 应被 JSON 序列化', () => {
      const blocks: ContentBlock[] = [{ type: 'text', text: 'block content' }];
      const messages: Message[] = [
        { role: 'tool', content: blocks, toolCallId: 'call_1' },
      ];

      const result = TreeUtils.messagesToNodes(messages);
      const ids = Object.keys(result.nodes);
      const toolNode = result.nodes[ids[0]];

      expect(toolNode.type).toBe('tool_result');
      // ContentBlock[] content 应被 JSON.stringify
      expect(typeof toolNode.content).toBe('string');
      expect(toolNode.metadata.toolResult).toContain('block content');
    });
  });
});
