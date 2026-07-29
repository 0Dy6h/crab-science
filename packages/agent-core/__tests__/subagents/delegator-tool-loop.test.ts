import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  Message,
  Session,
  SubagentDefinition,
  ToolContext,
  ToolResult,
} from '@crab-science/shared';
import { ProviderRegistry } from '@crab-science/llm-layer';
import type { LLMOptions, LLMProvider, ModelInfo, StreamEvent } from '@crab-science/llm-layer';
import { SubagentDelegator } from '@crab-science/evolution-engine';
import { ContextBuilder } from '../../src/context-builder.js';
import { SessionManager } from '../../src/session/manager.js';

/**
 * SubagentDelegator 工具循环回归测试
 *
 * 锁定审计确认的 P0 缺陷修复：
 * - SUB-01: tool_call_start 的工具名必须被保留（此前硬编码为 ''，工具永远调用失败）
 * - SUB-02: 只有 subagent 声明的工具会被暴露/执行（白名单强制）
 * - SUB-03: 工具结果前必须先追加带 tool_use 的 assistant 消息（否则第二次调用被 provider 拒绝）
 */

interface ScriptStep {
  text?: string;
  toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>;
}

class ToolCallProvider implements LLMProvider {
  name = 'openai';
  calls: Array<{ messages: Message[]; options: LLMOptions }> = [];

  constructor(private readonly script: (call: number) => ScriptStep) {}

  async *complete(
    messages: Message[],
    options: LLMOptions,
  ): AsyncGenerator<StreamEvent> {
    // 深拷贝，避免后续 push 影响已记录的快照
    this.calls.push({ messages: JSON.parse(JSON.stringify(messages)), options });
    const step = this.script(this.calls.length);

    if (step.text) {
      yield { type: 'text_delta', content: step.text };
    }
    for (const tc of step.toolCalls ?? []) {
      yield { type: 'tool_call_start', toolCallId: tc.id, toolName: tc.name };
      yield { type: 'tool_call_end', toolCallId: tc.id, input: tc.input };
    }
    yield {
      type: 'message_end',
      usage: { inputTokens: 1, outputTokens: 1, cost: 0 },
    };
  }

  listModels(): ModelInfo[] {
    return [];
  }
}

/** 记录每次 execute 调用的假 ToolRegistry */
class SpyToolRegistry {
  executed: Array<{ name: string; ctx: ToolContext }> = [];
  private defs = [
    { name: 'read', description: 'read', parameters: { type: 'object', properties: {} } },
    { name: 'bash', description: 'bash', parameters: { type: 'object', properties: {} } },
  ];

  getDefinitions() {
    return this.defs;
  }

  async execute(
    name: string,
    _input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    this.executed.push({ name, ctx });
    return { success: true, output: `ran ${name}` };
  }
}

const cleanupDirs: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeDelegator(provider: LLMProvider, tools: SpyToolRegistry, workDir: string) {
  const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-delg-'));
  cleanupDirs.push(sessionsDir);
  const sessionManager = new SessionManager(sessionsDir, provider);
  const registry = new ProviderRegistry();
  registry.register(provider);
  const skillLoader = { discover: () => [] };
  const contextBuilder = new ContextBuilder();
  const delegator = new SubagentDelegator(
    sessionManager,
    registry,
    tools as never,
    skillLoader,
    contextBuilder,
    workDir,
  );
  return { delegator, sessionManager };
}

function seedSession(manager: SessionManager): Session {
  const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
  manager.addNode(session, { type: 'user', content: 'main', metadata: {} });
  manager.addNode(session, { type: 'assistant', content: 'ctx', metadata: {} });
  return session;
}

const readerSubagent: SubagentDefinition = {
  meta: {
    name: 'reader',
    description: 'Reads files.',
    mode: 'autonomous',
    model: 'inherit',
    tools: ['read'],
  },
  path: 'reader.md',
  content: 'Read then report.',
};

describe('SubagentDelegator tool loop', () => {
  it('preserves the tool name across stream events (SUB-01)', async () => {
    const provider = new ToolCallProvider((call) =>
      call === 1
        ? { toolCalls: [{ id: 't1', name: 'read', input: { path: 'a.txt' } }] }
        : { text: 'done' },
    );
    const tools = new SpyToolRegistry();
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-wd-'));
    cleanupDirs.push(workDir);
    const { delegator, sessionManager } = makeDelegator(provider, tools, workDir);
    const session = seedSession(sessionManager);

    await delegator.delegate(session, readerSubagent, 'read a.txt');

    expect(tools.executed).toHaveLength(1);
    expect(tools.executed[0].name).toBe('read');
    // 工具在用户选定的 workDir 中执行，而不是 process.cwd()
    expect(tools.executed[0].ctx.workDir).toBe(workDir);
  });

  it('enforces the declared tool allowlist (SUB-02)', async () => {
    // subagent 只声明了 read；模型却尝试调用 bash → 必须被拒绝且不执行
    const provider = new ToolCallProvider((call) =>
      call === 1
        ? { toolCalls: [{ id: 'b1', name: 'bash', input: { command: 'rm -rf /' } }] }
        : { text: 'done' },
    );
    const tools = new SpyToolRegistry();
    const { delegator, sessionManager } = makeDelegator(provider, tools, process.cwd());
    const session = seedSession(sessionManager);

    await delegator.delegate(session, readerSubagent, 'do work');

    // bash 不在白名单 → 从未执行
    expect(tools.executed.find((e) => e.name === 'bash')).toBeUndefined();
    // 只暴露 read 工具给模型
    expect(provider.calls[0].options.tools?.map((t) => t.name)).toEqual(['read']);
    // 拒绝原因作为 tool 结果回给模型
    const secondCall = provider.calls[1];
    const toolMsg = secondCall.messages.find((m) => m.role === 'tool');
    expect(typeof toolMsg?.content === 'string' && toolMsg.content).toContain('拒绝');
  });

  it('pairs each tool result with a preceding assistant tool_use message (SUB-03)', async () => {
    const provider = new ToolCallProvider((call) =>
      call === 1
        ? { text: 'let me read', toolCalls: [{ id: 't1', name: 'read', input: { path: 'a.txt' } }] }
        : { text: 'done' },
    );
    const tools = new SpyToolRegistry();
    const { delegator, sessionManager } = makeDelegator(provider, tools, process.cwd());
    const session = seedSession(sessionManager);

    await delegator.delegate(session, readerSubagent, 'read a.txt');

    // 第二次调用的消息序列必须包含带 tool_use 的 assistant 消息，紧跟其后是 tool 结果
    const msgs = provider.calls[1].messages;
    const assistantWithToolUse = msgs.find(
      (m) =>
        m.role === 'assistant' &&
        Array.isArray(m.content) &&
        m.content.some((b) => b.type === 'tool_use' && b.toolCallId === 't1'),
    );
    expect(assistantWithToolUse).toBeDefined();

    const toolResult = msgs.find(
      (m) => m.role === 'tool' && m.toolCallId === 't1',
    );
    expect(toolResult).toBeDefined();
    // tool 结果必须出现在配对的 assistant 消息之后
    expect(msgs.indexOf(toolResult!)).toBeGreaterThan(
      msgs.indexOf(assistantWithToolUse!),
    );
  });
});
