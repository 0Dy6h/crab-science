import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionManager } from '../../src/session/manager.js';
import type { Session, Message } from '@crab-science/shared';

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

  describe('create', () => {
    it('应创建具有正确字段的 Session', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      expect(session.id).toBeTruthy();
      expect(session.id.startsWith('sess_')).toBe(true);
      expect(session.messages).toEqual([]);
      expect(session.model).toBe('gpt-4o');
      expect(session.provider).toBe('openai');
      expect(session.createdAt).toBeTruthy();
      expect(session.updatedAt).toBeTruthy();
      expect(session.totalInputTokens).toBe(0);
      expect(session.totalOutputTokens).toBe(0);
      expect(session.totalCost).toBe(0);
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

      // 等待一小段时间确保时间戳不同
      await new Promise((resolve) => setTimeout(resolve, 10));

      manager.save(session);

      expect(session.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('load', () => {
    it('应从 JSON 文件加载 Session', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addMessage(session, { role: 'user', content: 'Hello' });
      manager.save(session);

      const loaded = manager.load(session.id);

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(session.id);
      expect(loaded!.model).toBe('gpt-4o');
      expect(loaded!.messages.length).toBe(1);
      expect(loaded!.messages[0].content).toBe('Hello');
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
      manager.addMessage(session, { role: 'user', content: 'test' });
      manager.save(session);

      const list = manager.list();
      const meta = list.find((m) => m.id === session.id);

      expect(meta).toBeDefined();
      expect(meta!.id).toBe(session.id);
      expect(meta!.model).toBe('gpt-4o');
      expect(meta!.provider).toBe('openai');
      expect(meta!.messageCount).toBe(1);
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

  describe('addMessage', () => {
    it('应追加消息到 Session', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      manager.addMessage(session, { role: 'user', content: 'Hello' });

      expect(session.messages.length).toBe(1);
      expect(session.messages[0].role).toBe('user');
      expect(session.messages[0].content).toBe('Hello');
    });

    it('应追加多条消息', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });

      manager.addMessage(session, { role: 'user', content: 'msg1' });
      manager.addMessage(session, { role: 'assistant', content: 'reply1' });
      manager.addMessage(session, { role: 'user', content: 'msg2' });

      expect(session.messages.length).toBe(3);
      expect(session.messages[0].content).toBe('msg1');
      expect(session.messages[1].content).toBe('reply1');
      expect(session.messages[2].content).toBe('msg2');
    });

    it('应更新 updatedAt 时间戳', async () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      const originalUpdatedAt = session.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      manager.addMessage(session, { role: 'user', content: 'test' });

      expect(session.updatedAt).not.toBe(originalUpdatedAt);
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
    it('应返回最近消息的摘要', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      manager.addMessage(session, { role: 'user', content: 'What is CRISPR?' });
      manager.addMessage(session, { role: 'assistant', content: 'CRISPR is...' });

      const summary = manager.getSummary(session);

      expect(summary).toContain('You');
      expect(summary).toContain('What is CRISPR?');
      expect(summary).toContain('Crab');
      expect(summary).toContain('CRISPR is...');
    });

    it('应限制返回的消息数量', () => {
      const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
      for (let i = 0; i < 10; i++) {
        manager.addMessage(session, { role: 'user', content: `msg${i}` });
      }

      const summary = manager.getSummary(session, 3);

      // 应只包含最后 3 条
      expect(summary).toContain('msg7');
      expect(summary).toContain('msg8');
      expect(summary).toContain('msg9');
      expect(summary).not.toContain('msg0');
      expect(summary).not.toContain('msg6');
    });
  });
});
