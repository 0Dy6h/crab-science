import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionManager } from '../../src/session/manager.js';
import { TreeUtils } from '../../src/session/tree-utils.js';
import type { Session, SessionNode, NodeType, NodeMetadata, Message } from '@crab-science/shared';
import type { LLMProvider, LLMOptions, StreamEvent } from '@crab-science/llm-layer';

describe('SessionManager', () => {
  let sessionsDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-sessions-'));
    manager = new SessionManager(sessionsDir);
  });

  afterEach(() => {
    fs.rmSync(sessionsDir, { recursive: true, force: true });
  });

  // ============================================================
  // Phase 2: 树形 Session 测试
  // ============================================================

  describe('create', () => {
    it('应创建具有正确字段的 Session', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      expect(session.id).toBeTruthy();
      expect(session.id.startsWith('sess_')).toBe(true);
      expect(session.nodes).toEqual({});
      expect(session.rootId).toBe('');
      expect(session.currentNodeId).toBe('');
      expect(session.model).toBe('gpt-4o');
      expect(session.provider).toBe('openai');
      expect(session.createdAt).toBeTruthy();
      expect(session.updatedAt).toBeTruthy();
      expect(session.totalInputTokens).toBe(0);
      expect(session.totalOutputTokens).toBe(0);
      expect(session.totalCost).toBe(0);
      expect(session.version).toBe(2);
    });

    it('创建后应自动保存到文件', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      const filePath = path.join(sessionsDir, `${session.id}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('应支持不同 provider 和 model', () => {
      const session = manager.create({
        model: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
      });

      expect(session.model).toBe('claude-sonnet-4-20250514');
      expect(session.provider).toBe('anthropic');
    });
  });

  describe('save', () => {
    it('应将 Session 序列化为 JSON 文件', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const filePath = path.join(sessionsDir, `${session.id}.json`);

      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      expect(parsed.id).toBe(session.id);
      expect(parsed.model).toBe(session.model);
    });

    it('保存后应更新 updatedAt 时间戳', async () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const originalUpdatedAt = session.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      manager.save(session);

      expect(session.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('load', () => {
    it('应从 JSON 文件加载 Session（树形）', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'Hello', metadata: {} });
      manager.save(session);

      const loaded = manager.load(session.id);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
      expect(loaded!.model).toBe('gpt-4o');
      expect(Object.keys(loaded!.nodes).length).toBe(1);
      expect(loaded!.version).toBe(2);
    });

    it('加载不存在的 Session 应返回 null', () => {
      const result = manager.load('nonexistent-session-id');

      expect(result).toBeNull();
    });

    it('加载损坏的 JSON 文件应返回 null', () => {
      const filePath = path.join(sessionsDir, 'corrupt.json');
      fs.writeFileSync(filePath, '{ invalid json }');

      const result = manager.load('corrupt');

      expect(result).toBeNull();
    });

    it('应自动迁移 V1（线性）Session 为 V2（树形）', () => {
      // 手动创建一个 V1 格式的 session 文件
      const v1Session = {
        id: 'sess_v1test',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ],
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        version: 1,
      };

      const filePath = path.join(sessionsDir, 'sess_v1test.json');
      fs.writeFileSync(filePath, JSON.stringify(v1Session, null, 2));

      const loaded = manager.load('sess_v1test');

      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe(2);
      expect(loaded!.messages).toBeUndefined();
      expect(Object.keys(loaded!.nodes).length).toBe(2);
      expect(loaded!.rootId).toBeTruthy();
      expect(loaded!.currentNodeId).toBeTruthy();

      // 验证节点链结构
      const root = loaded!.nodes[loaded!.rootId];
      expect(root).toBeDefined();
      expect(root.type).toBe('user');
      expect(root.content).toBe('Hello');
      expect(root.parentId).toBeNull();

      const leaf = loaded!.nodes[loaded!.currentNodeId];
      expect(leaf).toBeDefined();
      expect(leaf.type).toBe('assistant');
      expect(leaf.content).toBe('Hi there');
    });
  });

  describe('list', () => {
    it('应列出所有历史 Session', () => {
      manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.create({ model: 'claude-sonnet-4-20250514', provider: 'anthropic' });

      const list = manager.list();

      expect(list.length).toBe(2);
    });

    it('应返回正确的 SessionMeta 字段', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'test', metadata: {} });
      manager.save(session);

      const list = manager.list();
      const meta = list.find((m) => m.id === session.id);

      expect(meta).toBeDefined();
      expect(meta!.id).toBe(session.id);
      expect(meta!.model).toBe('gpt-4o');
      expect(meta!.provider).toBe('openai');
      expect(meta!.nodeCount).toBe(1);
      expect(meta!.version).toBe(2);
      expect(meta!.createdAt).toBeTruthy();
      expect(meta!.updatedAt).toBeTruthy();
    });

    it('应按更新时间倒序排列', async () => {
      const s1 = manager.create({ model: 'gpt-4o', provider: 'openai' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const s2 = manager.create({ model: 'gpt-4o-mini', provider: 'openai' });

      const list = manager.list();

      expect(list[0].id).toBe(s2.id);
      expect(list[1].id).toBe(s1.id);
    });

    it('无 Session 时应返回空数组', () => {
      const list = manager.list();
      expect(list).toEqual([]);
    });

    it('应跳过损坏的 session 文件', () => {
      manager.create({ model: 'gpt-4o', provider: 'openai' });
      fs.writeFileSync(path.join(sessionsDir, 'corrupt.json'), '{ invalid }');

      const list = manager.list();

      expect(list.length).toBe(1);
    });
  });

  describe('addNode', () => {
    it('应追加节点到 Session', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      const nodeId = manager.addNode(session, {
        type: 'user',
        content: 'Hello',
        metadata: {},
      });

      expect(nodeId).toBeTruthy();
      expect(nodeId.startsWith('node_')).toBe(true);
      expect(Object.keys(session.nodes).length).toBe(1);
      expect(session.rootId).toBe(nodeId);
      expect(session.currentNodeId).toBe(nodeId);

      const node = session.nodes[nodeId];
      expect(node.type).toBe('user');
      expect(node.content).toBe('Hello');
      expect(node.parentId).toBeNull();
      expect(node.childrenIds).toEqual([]);
    });

    it('应追加多个节点形成链', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      const id1 = manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      const id2 = manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });
      const id3 = manager.addNode(session, { type: 'user', content: 'msg2', metadata: {} });

      expect(Object.keys(session.nodes).length).toBe(3);
      expect(session.rootId).toBe(id1);
      expect(session.currentNodeId).toBe(id3);

      // 验证链结构
      const node1 = session.nodes[id1];
      const node2 = session.nodes[id2];
      const node3 = session.nodes[id3];

      expect(node1.parentId).toBeNull();
      expect(node1.childrenIds).toContain(id2);
      expect(node2.parentId).toBe(id1);
      expect(node2.childrenIds).toContain(id3);
      expect(node3.parentId).toBe(id2);
      expect(node3.childrenIds).toEqual([]);
    });

    it('应更新 updatedAt 时间戳', async () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const originalUpdatedAt = session.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      manager.addNode(session, { type: 'user', content: 'test', metadata: {} });

      expect(session.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('fork', () => {
    it('应从当前节点 fork 分支', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });

      const forkNodeId = manager.fork(session, { reason: 'test branch' });

      expect(forkNodeId).toBe(session.currentNodeId);
      expect(session.nodes[forkNodeId].metadata.branchReason).toBe('test branch');
    });

    it('fork 不改变 currentNodeId', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      const currentNodeId = session.currentNodeId;

      manager.fork(session);

      expect(session.currentNodeId).toBe(currentNodeId);
    });

    it('fork 后 addNode 创建新分支', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });

      const forkNodeId = session.currentNodeId;

      // Fork 并添加新节点
      manager.fork(session, { reason: 'alternative approach' });
      const newId = manager.addNode(session, { type: 'user', content: 'msg2', metadata: {} });

      // 新节点应该作为 fork 点的子节点
      expect(session.nodes[forkNodeId].childrenIds).toContain(newId);
      expect(session.nodes[newId].parentId).toBe(forkNodeId);
    });
  });

  describe('rollback', () => {
    it('应回退到指定节点', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const id1 = manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });

      expect(session.currentNodeId).not.toBe(id1);

      manager.rollback(session, id1);

      expect(session.currentNodeId).toBe(id1);
    });

    it('回退后原节点仍保留', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const id1 = manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      const id2 = manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });

      manager.rollback(session, id1);

      // id2 仍然存在
      expect(session.nodes[id2]).toBeDefined();
      expect(Object.keys(session.nodes).length).toBe(2);
    });
  });

  describe('jump', () => {
    it('应跳转到指定节点', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const id1 = manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      const id2 = manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });

      manager.jump(session, id1);
      expect(session.currentNodeId).toBe(id1);

      manager.jump(session, id2);
      expect(session.currentNodeId).toBe(id2);
    });
  });

  describe('getCurrentPathMessages', () => {
    it('应返回从 root 到当前节点的消息', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'Hello', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'Hi there', metadata: {} });

      const messages = manager.getCurrentPathMessages(session);

      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('Hi there');
    });

    it('空 Session 应返回空数组', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const messages = manager.getCurrentPathMessages(session);
      expect(messages).toEqual([]);
    });
  });

  describe('getTree', () => {
    it('应返回树结构', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });

      const tree = manager.getTree(session);

      expect(tree).not.toBeNull();
      expect(tree!.root).toBeDefined();
      expect(tree!.root.type).toBe('user');
      expect(tree!.branches.length).toBeGreaterThan(0);
    });
  });

  describe('listBranches', () => {
    it('应列出所有分支', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });

      const branches = manager.listBranches(session);

      expect(branches.length).toBe(1);
      expect(branches[0].leafNode).toBeDefined();
      expect(branches[0].pathLength).toBe(2);
    });

    it('多分支时应返回多个叶节点', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });

      // Fork 并添加新分支
      manager.fork(session, { reason: 'branch A' });
      manager.addNode(session, { type: 'user', content: 'branchA-msg', metadata: {} });

      // 回退到 fork 点并添加另一分支
      const forkPoint = session.nodes[session.currentNodeId].parentId!;
      manager.rollback(session, forkPoint);
      manager.addNode(session, { type: 'user', content: 'branchB-msg', metadata: {} });

      const branches = manager.listBranches(session);
      expect(branches.length).toBe(2);
    });
  });

  describe('delete', () => {
    it('应删除 Session 文件', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const filePath = path.join(sessionsDir, `${session.id}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      manager.delete(session.id);

      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('删除不存在的 Session 不应报错', () => {
      expect(() => manager.delete('nonexistent')).not.toThrow();
    });
  });

  describe('updateUsage', () => {
    it('应累加 token 统计', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      manager.updateUsage(session, 100, 50, 0.005);
      expect(session.totalInputTokens).toBe(100);
      expect(session.totalOutputTokens).toBe(50);
      expect(session.totalCost).toBeCloseTo(0.005, 6);

      manager.updateUsage(session, 200, 100, 0.01);
      expect(session.totalInputTokens).toBe(300);
      expect(session.totalOutputTokens).toBe(150);
      expect(session.totalCost).toBeCloseTo(0.015, 6);
    });
  });

  describe('getSummary', () => {
    it('应返回最近节点的摘要', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'What is CRISPR?', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'CRISPR is...', metadata: {} });

      const summary = manager.getSummary(session);

      expect(summary).toContain('You');
      expect(summary).toContain('What is CRISPR?');
      expect(summary).toContain('Crab');
      expect(summary).toContain('CRISPR is...');
    });

    it('应限制返回的节点数量', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      for (let i = 0; i < 10; i++) {
        manager.addNode(session, { type: 'user', content: `msg${i}`, metadata: {} });
      }

      const summary = manager.getSummary(session, 3);

      // 应只包含最后 3 个节点
      expect(summary).toContain('msg7');
      expect(summary).toContain('msg8');
      expect(summary).toContain('msg9');
      expect(summary).not.toContain('msg0');
      expect(summary).not.toContain('msg6');
    });
  });

  // ============================================================
  // Phase 2 补充测试：summarize / 错误处理 / 边界情况
  // ============================================================

  describe('summarize', () => {
    /** 创建 mock LLMProvider */
    function createMockProvider(summaryText: string): LLMProvider {
      return {
        name: 'mock',
        async *complete(
          _messages: Message[],
          _options: LLMOptions,
        ): AsyncGenerator<StreamEvent> {
          yield { type: 'text_delta', content: summaryText };
          yield {
            type: 'message_end',
            usage: { inputTokens: 100, outputTokens: 50, cost: 0.001 },
          };
        },
        listModels() {
          return [];
        },
      };
    }

    it('应用 LLM 生成分支摘要并创建 summary 节点', async () => {
      const mockProvider = createMockProvider('This is a summary.');
      const summaryManager = new SessionManager(sessionsDir, mockProvider);

      const session = summaryManager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'Hello', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'Hi there', metadata: {} });

      const branchLeaf = session.currentNodeId;
      const summaryNodeId = await summaryManager.summarize(session, branchLeaf);

      expect(summaryNodeId).toBeTruthy();
      expect(summaryNodeId.startsWith('node_')).toBe(true);

      // summary 节点应存在
      const summaryNode = session.nodes[summaryNodeId];
      expect(summaryNode).toBeDefined();
      expect(summaryNode.type).toBe('summary');
      expect(summaryNode.content).toBe('This is a summary.');
      expect(summaryNode.metadata.summaryText).toBe('This is a summary.');
      expect(summaryNode.metadata.sourceBranchLeafId).toBe(branchLeaf);
      expect(summaryNode.metadata.tokensUsed).toEqual({ inputTokens: 100, outputTokens: 50 });
    });

    it('summarize 后 currentNodeId 应为 summary 节点', async () => {
      const mockProvider = createMockProvider('Summary text.');
      const summaryManager = new SessionManager(sessionsDir, mockProvider);

      const session = summaryManager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'Hello', metadata: {} });

      const summaryNodeId = await summaryManager.summarize(session, session.currentNodeId);

      expect(session.currentNodeId).toBe(summaryNodeId);
    });

    it('summarize 应累加 token 使用量', async () => {
      const mockProvider = createMockProvider('Summary.');
      const summaryManager = new SessionManager(sessionsDir, mockProvider);

      const session = summaryManager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'Hello', metadata: {} });

      const beforeTokens = session.totalInputTokens;
      await summaryManager.summarize(session, session.currentNodeId);

      expect(session.totalInputTokens).toBe(beforeTokens + 100);
      expect(session.totalOutputTokens).toBe(50);
    });

    it('无 LLMProvider 时应抛出错误', async () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'Hello', metadata: {} });

      await expect(
        manager.summarize(session, session.currentNodeId),
      ).rejects.toThrow('LLMProvider');
    });

    it('不存在的 branchNodeId 应抛出错误', async () => {
      const mockProvider = createMockProvider('Summary.');
      const summaryManager = new SessionManager(sessionsDir, mockProvider);

      const session = summaryManager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'Hello', metadata: {} });

      await expect(
        summaryManager.summarize(session, 'nonexistent-node'),
      ).rejects.toThrow('不存在');
    });

    it('可通过参数传入 provider', async () => {
      const mockProvider = createMockProvider('Param provider summary.');

      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'Hello', metadata: {} });

      // manager 构造时没有 provider，通过参数传入
      const summaryNodeId = await manager.summarize(
        session,
        session.currentNodeId,
        undefined,
        mockProvider,
      );

      expect(summaryNodeId).toBeTruthy();
      const summaryNode = session.nodes[summaryNodeId];
      expect(summaryNode.content).toBe('Param provider summary.');
    });

    it('LLM 调用失败时应记录错误信息', async () => {
      const failingProvider: LLMProvider = {
        name: 'failing',
        async *complete(): AsyncGenerator<StreamEvent> {
          throw new Error('API connection failed');
        },
        listModels() {
          return [];
        },
      };
      const summaryManager = new SessionManager(sessionsDir, failingProvider);

      const session = summaryManager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'Hello', metadata: {} });

      const summaryNodeId = await summaryManager.summarize(session, session.currentNodeId);

      const summaryNode = session.nodes[summaryNodeId];
      expect(summaryNode.type).toBe('summary');
      expect(summaryNode.content).toContain('摘要生成失败');
      expect(summaryNode.content).toContain('API connection failed');
    });
  });

  describe('fork 边界情况', () => {
    it('应支持从指定节点 fork（fromNodeId）', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const id1 = manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      const id2 = manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });
      manager.addNode(session, { type: 'user', content: 'msg2', metadata: {} });

      // Fork from id1 (not currentNodeId)
      const forkNodeId = manager.fork(session, { fromNodeId: id1, reason: 'fork from earlier' });

      expect(forkNodeId).toBe(id1);
      expect(session.nodes[id1].metadata.branchReason).toBe('fork from earlier');
    });

    it('fork 不存在的节点应抛出错误', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });

      expect(() => manager.fork(session, { fromNodeId: 'nonexistent' })).toThrow('不存在');
    });

    it('fork 根节点应正常工作', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const rootId = manager.addNode(session, { type: 'user', content: 'root msg', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'reply', metadata: {} });

      // Fork from root
      const forkNodeId = manager.fork(session, { fromNodeId: rootId, reason: 'fork from root' });

      expect(forkNodeId).toBe(rootId);
      expect(session.nodes[rootId].metadata.branchReason).toBe('fork from root');
    });

    it('fork 无 reason 时不应设置 branchReason', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });

      manager.fork(session);

      expect(session.nodes[session.currentNodeId].metadata.branchReason).toBeUndefined();
    });
  });

  describe('rollback 错误处理', () => {
    it('回退到不存在的节点应抛出错误', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });

      expect(() => manager.rollback(session, 'nonexistent')).toThrow('不存在');
    });
  });

  describe('jump 错误处理', () => {
    it('跳转到不存在的节点应抛出错误', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });

      expect(() => manager.jump(session, 'nonexistent')).toThrow('不存在');
    });
  });

  describe('getPath', () => {
    it('应返回从 root 到指定节点的路径', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const id1 = manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      const id2 = manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });
      const id3 = manager.addNode(session, { type: 'user', content: 'msg2', metadata: {} });

      const path = manager.getPath(session, id3);

      expect(path.length).toBe(3);
      expect(path[0].id).toBe(id1);
      expect(path[1].id).toBe(id2);
      expect(path[2].id).toBe(id3);
    });

    it('路径到 root 应返回单元素', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const rootId = manager.addNode(session, { type: 'user', content: 'root', metadata: {} });

      const path = manager.getPath(session, rootId);

      expect(path.length).toBe(1);
      expect(path[0].id).toBe(rootId);
    });
  });

  describe('migrateFromV1 边界情况', () => {
    it('空消息数组应迁移为空 nodes', () => {
      const v1Session = {
        id: 'sess_empty_v1',
        messages: [],
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        version: 1,
      };

      const filePath = path.join(sessionsDir, 'sess_empty_v1.json');
      fs.writeFileSync(filePath, JSON.stringify(v1Session, null, 2));

      const loaded = manager.load('sess_empty_v1');

      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe(2);
      expect(Object.keys(loaded!.nodes).length).toBe(0);
      expect(loaded!.rootId).toBe('');
      expect(loaded!.currentNodeId).toBe('');
    });

    it('应保留原始 token 和 cost 统计', () => {
      const v1Session = {
        id: 'sess_stats_v1',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
        ],
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        totalInputTokens: 500,
        totalOutputTokens: 200,
        totalCost: 0.03,
        version: 1,
      };

      const filePath = path.join(sessionsDir, 'sess_stats_v1.json');
      fs.writeFileSync(filePath, JSON.stringify(v1Session, null, 2));

      const loaded = manager.load('sess_stats_v1');

      expect(loaded!.totalInputTokens).toBe(500);
      expect(loaded!.totalOutputTokens).toBe(200);
      expect(loaded!.totalCost).toBeCloseTo(0.03, 6);
    });

    it('迁移后应覆盖保存 V2 格式', () => {
      const v1Session = {
        id: 'sess_overwrite_v1',
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4o',
        provider: 'openai',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        version: 1,
      };

      const filePath = path.join(sessionsDir, 'sess_overwrite_v1.json');
      fs.writeFileSync(filePath, JSON.stringify(v1Session, null, 2));

      // 第一次加载触发迁移
      manager.load('sess_overwrite_v1');

      // 第二次加载应直接读 V2 格式
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      expect(parsed.version).toBe(2);
      expect(parsed.nodes).toBeDefined();
      expect(parsed.messages).toBeUndefined();
    });
  });

  describe('getCurrentPathMessages 分支隔离', () => {
    it('分支探索后主路径消息不应被污染', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      // 主路径: root → n1 → n2
      manager.addNode(session, { type: 'user', content: 'main1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'main2', metadata: {} });

      // 保存 fork 点（当前节点 = main2）
      const forkPoint = session.currentNodeId;

      // Fork 并探索分支
      manager.fork(session, { reason: 'explore' });
      manager.addNode(session, { type: 'user', content: 'branch1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'branch2', metadata: {} });

      // 回退到 fork 点（main2）
      manager.rollback(session, forkPoint);

      // 主路径消息
      const messages = manager.getCurrentPathMessages(session);

      expect(messages.length).toBe(2);
      expect(messages[0].content).toBe('main1');
      expect(messages[1].content).toBe('main2');
      // 分支消息不应出现
      const contents = messages.map((m) => m.content);
      expect(contents).not.toContain('branch1');
      expect(contents).not.toContain('branch2');
    });

    it('多分支跳转后路径消息应正确切换', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      // 公共路径
      manager.addNode(session, { type: 'user', content: 'common1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'common2', metadata: {} });

      // 分支 A
      manager.fork(session, { reason: 'branch A' });
      manager.addNode(session, { type: 'user', content: 'a1', metadata: {} });
      const branchALeaf = session.currentNodeId;

      // 分支 B
      manager.rollback(session, session.nodes[branchALeaf].parentId!);
      manager.fork(session, { reason: 'branch B' });
      manager.addNode(session, { type: 'user', content: 'b1', metadata: {} });
      const branchBLeaf = session.currentNodeId;

      // Jump 到分支 A
      manager.jump(session, branchALeaf);
      const msgsA = manager.getCurrentPathMessages(session);
      expect(msgsA.length).toBe(3);
      expect(msgsA[2].content).toBe('a1');

      // Jump 到分支 B
      manager.jump(session, branchBLeaf);
      const msgsB = manager.getCurrentPathMessages(session);
      expect(msgsB.length).toBe(3);
      expect(msgsB[2].content).toBe('b1');
    });
  });

  describe('getTree 多分支', () => {
    it('应返回正确的分支数量和结构', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'root', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'reply', metadata: {} });

      // 创建两个分支
      manager.fork(session, { reason: 'A' });
      manager.addNode(session, { type: 'user', content: 'a', metadata: {} });
      const aLeaf = session.currentNodeId;

      manager.rollback(session, session.nodes[aLeaf].parentId!);
      manager.fork(session, { reason: 'B' });
      manager.addNode(session, { type: 'user', content: 'b', metadata: {} });

      const tree = manager.getTree(session);

      expect(tree.root).toBeDefined();
      expect(tree.root.type).toBe('user');
      // 两个分支
      expect(tree.branches.length).toBe(2);
    });

    it('单路径应返回一个分支', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg', metadata: {} });

      const tree = manager.getTree(session);

      expect(tree.branches.length).toBe(1);
      expect(tree.branches[0].length).toBe(1);
    });
  });
});
