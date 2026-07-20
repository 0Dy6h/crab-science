import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ContextBuilder } from '../src/context-builder.js';
import { SessionManager } from '../src/session/manager.js';
import type { AppConfig, SkillMeta } from '@crab-science/shared';

describe('ContextBuilder (Phase 2 树形 Session)', () => {
  let sessionsDir: string;
  let manager: SessionManager;
  let builder: ContextBuilder;

  const config: AppConfig = {
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o',
    maxIterations: 10,
    bashTimeoutMs: 30000,
    workDir: '/test/workdir',
  };

  const skills: SkillMeta[] = [
    { name: 'literature-search', description: '文献检索', version: 1 },
    { name: 'data-analysis', description: '数据分析', version: 1 },
  ];

  beforeEach(() => {
    sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-ctx-'));
    manager = new SessionManager(sessionsDir);
    builder = new ContextBuilder();
  });

  afterEach(() => {
    fs.rmSync(sessionsDir, { recursive: true, force: true });
  });

  // ============================================================
  // build
  // ============================================================

  describe('build', () => {
    it('应返回 systemPrompt 和 messages', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'Hello', metadata: {} });

      const result = builder.build(session, skills, config);

      expect(result.systemPrompt).toBeTruthy();
      expect(result.systemPrompt).toContain('Crab-Science');
      expect(result.messages.length).toBe(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hello');
    });

    it('systemPrompt 应包含 skill 元数据', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      const result = builder.build(session, skills, config);

      expect(result.systemPrompt).toContain('literature-search');
      expect(result.systemPrompt).toContain('文献检索');
      expect(result.systemPrompt).toContain('data-analysis');
    });

    it('systemPrompt 应包含工作目录配置', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      const result = builder.build(session, [], config);

      expect(result.systemPrompt).toContain('/test/workdir');
      expect(result.systemPrompt).toContain('10');
    });

    it('应包含 extension 工具描述', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const extensionTools = [
        {
          name: 'web-search',
          description: 'Search the web',
          parameters: {
            type: 'object' as const,
            properties: { query: { type: 'string', description: 'query' } },
            required: ['query'],
          },
        },
      ];

      const result = builder.build(session, [], config, extensionTools);

      expect(result.systemPrompt).toContain('web-search');
      expect(result.systemPrompt).toContain('Search the web');
    });

    it('空 skills 时 systemPrompt 不应包含 skill 部分', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      const result = builder.build(session, [], config);

      expect(result.systemPrompt).not.toContain('可用技能');
    });
  });

  // ============================================================
  // 路径消息提取（核心）
  // ============================================================

  describe('路径消息提取', () => {
    it('应从 root 到 currentNodeId 提取消息', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });
      manager.addNode(session, { type: 'user', content: 'msg2', metadata: {} });

      const result = builder.build(session, [], config);

      expect(result.messages.length).toBe(3);
      expect(result.messages[0].content).toBe('msg1');
      expect(result.messages[1].content).toBe('reply1');
      expect(result.messages[2].content).toBe('msg2');
    });

    it('空 Session 应返回空 messages', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      const result = builder.build(session, [], config);

      expect(result.messages).toEqual([]);
    });

    it('分支中的消息不应进入主路径 context', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      // 主路径: root → n1 → n2
      manager.addNode(session, { type: 'user', content: 'main-msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'main-reply1', metadata: {} });

      // 保存 fork 点（当前节点 = main-reply1）
      const forkPoint = session.currentNodeId;

      // Fork 并添加分支消息
      manager.fork(session, { reason: 'alternative approach' });
      manager.addNode(session, { type: 'user', content: 'branch-msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'branch-reply1', metadata: {} });

      // 回退到 fork 点（main-reply1）
      manager.rollback(session, forkPoint);

      // 继续主路径
      manager.addNode(session, { type: 'user', content: 'main-msg2', metadata: {} });

      // 构建上下文
      const result = builder.build(session, [], config);

      // 主路径: main-msg1, main-reply1, main-msg2（不包含 branch 消息）
      expect(result.messages.length).toBe(3);
      const contents = result.messages.map((m) => m.content);
      expect(contents).toContain('main-msg1');
      expect(contents).toContain('main-reply1');
      expect(contents).toContain('main-msg2');
      // 分支消息不应出现
      expect(contents).not.toContain('branch-msg1');
      expect(contents).not.toContain('branch-reply1');
    });

    it('jump 到分支后应提取该分支路径的消息', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      // 主路径
      manager.addNode(session, { type: 'user', content: 'main-msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'main-reply1', metadata: {} });

      // Fork 并添加分支
      manager.fork(session, { reason: 'branch A' });
      manager.addNode(session, { type: 'user', content: 'branchA-msg1', metadata: {} });
      const branchALeaf = session.currentNodeId;

      // 回退到 fork 点并添加另一分支
      const forkPoint = session.nodes[branchALeaf].parentId!;
      manager.rollback(session, forkPoint);
      manager.addNode(session, { type: 'user', content: 'branchB-msg1', metadata: {} });
      const branchBLeaf = session.currentNodeId;

      // Jump 到 branchA
      manager.jump(session, branchALeaf);

      const resultA = builder.build(session, [], config);
      const contentsA = resultA.messages.map((m) => m.content);
      expect(contentsA).toContain('main-msg1');
      expect(contentsA).toContain('main-reply1');
      expect(contentsA).toContain('branchA-msg1');
      expect(contentsA).not.toContain('branchB-msg1');

      // Jump 到 branchB
      manager.jump(session, branchBLeaf);

      const resultB = builder.build(session, [], config);
      const contentsB = resultB.messages.map((m) => m.content);
      expect(contentsB).toContain('main-msg1');
      expect(contentsB).toContain('main-reply1');
      expect(contentsB).toContain('branchB-msg1');
      expect(contentsB).not.toContain('branchA-msg1');
    });

    it('rollback 后新消息应出现在路径中', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      manager.addNode(session, { type: 'user', content: 'msg1', metadata: {} });
      manager.addNode(session, { type: 'assistant', content: 'reply1', metadata: {} });

      // 回退到 msg1
      const msg1Id = session.rootId;
      manager.rollback(session, msg1Id);

      // 添加新消息
      manager.addNode(session, { type: 'assistant', content: 'new-reply', metadata: {} });

      const result = builder.build(session, [], config);

      expect(result.messages.length).toBe(2);
      expect(result.messages[0].content).toBe('msg1');
      expect(result.messages[1].content).toBe('new-reply');
      // 旧的 reply1 不应出现
      const contents = result.messages.map((m) => m.content);
      expect(contents).not.toContain('reply1');
    });

    it('应正确处理 tool_call 和 tool_result 节点', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      manager.addNode(session, { type: 'user', content: 'run ls', metadata: {} });
      manager.addNode(session, {
        type: 'tool_call',
        content: 'Running bash',
        metadata: {
          toolName: 'bash',
          toolParams: { command: 'ls' },
          toolCallId: 'call_1',
        },
      });
      manager.addNode(session, {
        type: 'tool_result',
        content: 'file1.txt\nfile2.txt',
        metadata: {
          toolCallId: 'call_1',
          toolResult: 'file1.txt\nfile2.txt',
        },
      });

      const result = builder.build(session, [], config);

      expect(result.messages.length).toBe(3);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[2].role).toBe('tool');
      expect(result.messages[2].content).toBe('file1.txt\nfile2.txt');
    });

    it('应正确处理 summary 节点', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      manager.addNode(session, { type: 'user', content: 'long conversation', metadata: {} });
      manager.addNode(session, {
        type: 'summary',
        content: 'Summary of conversation',
        metadata: {
          summaryText: 'Summary of conversation',
          sourceBranchLeafId: 'some-leaf',
        },
      });

      const result = builder.build(session, [], config);

      expect(result.messages.length).toBe(2);
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toBe('Summary of conversation');
    });
  });

  // ============================================================
  // getPromptBuilder
  // ============================================================

  describe('getPromptBuilder', () => {
    it('应返回 SystemPromptBuilder 实例', () => {
      const promptBuilder = builder.getPromptBuilder();

      expect(promptBuilder).toBeDefined();
      expect(promptBuilder.build).toBeDefined();
    });

    it('应能独立构建系统提示词', () => {
      const promptBuilder = builder.getPromptBuilder();
      const prompt = promptBuilder.build(skills, config);

      expect(prompt).toContain('Crab-Science');
      expect(prompt).toContain('literature-search');
    });
  });
});
