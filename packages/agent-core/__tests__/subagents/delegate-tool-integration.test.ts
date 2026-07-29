import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  Message,
  Session,
  SessionNode,
  SubagentDefinition,
  ToolContext,
} from '@crab-science/shared';
import { ProviderRegistry } from '@crab-science/llm-layer';
import type { LLMOptions, LLMProvider, ModelInfo, StreamEvent } from '@crab-science/llm-layer';
import { SubagentDelegator } from '@crab-science/evolution-engine';
import { ContextBuilder } from '../../src/context-builder.js';
import { SessionManager } from '../../src/session/manager.js';
import { DelegateTool } from '../../src/subagents/delegate-tool.js';
import type { SubagentRegistry } from '../../src/subagents/registry.js';
import { ToolRegistry } from '../../src/tools/index.js';

type ProviderResponder = (
  messages: Message[],
  options: LLMOptions,
  callNumber: number,
) => string | Error;

class ScriptedProvider implements LLMProvider {
  name = 'openai';
  calls: Array<{ messages: Message[]; options: LLMOptions }> = [];

  constructor(private readonly responder: ProviderResponder) {}

  async *complete(
    messages: Message[],
    options: LLMOptions,
  ): AsyncGenerator<StreamEvent> {
    this.calls.push({ messages, options });
    const response = this.responder(messages, options, this.calls.length);

    if (response instanceof Error) {
      throw response;
    }

    yield { type: 'text_delta', content: response };
    yield {
      type: 'message_end',
      usage: { inputTokens: 10, outputTokens: 5, cost: 0 },
    };
  }

  listModels(): ModelInfo[] {
    return [];
  }
}

const subagent: SubagentDefinition = {
  meta: {
    name: 'reviewer',
    description: 'Reviews delegated research work.',
    mode: 'autonomous',
    model: 'inherit',
    tools: [],
  },
  path: 'reviewer.md',
  content: 'Return concise findings.',
};

const toolContext: ToolContext = {
  workDir: process.cwd(),
  sessionId: 'sess_test',
};

function createRegistry(): SubagentRegistry {
  return {
    get(name: string) {
      return name === subagent.meta.name ? subagent : null;
    },
    list() {
      return [subagent.meta];
    },
  } as unknown as SubagentRegistry;
}

function createSession(manager: SessionManager): Session {
  const session = manager.create({ model: 'gpt-4o', provider: 'openai' });
  manager.addNode(session, {
    type: 'user',
    content: 'Start the main task.',
    metadata: {},
  });
  manager.addNode(session, {
    type: 'assistant',
    content: 'Main task context.',
    metadata: {},
  });
  return session;
}

function createDelegateTool(
  session: Session,
  provider: LLMProvider,
  sessionManager: SessionManager,
): DelegateTool {
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);

  const toolRegistry = new ToolRegistry(false);
  const skillLoader = { discover: () => [] };
  const contextBuilder = new ContextBuilder();
  const delegator = new SubagentDelegator(
    sessionManager,
    providerRegistry,
    toolRegistry,
    skillLoader,
    contextBuilder,
  );

  return new DelegateTool(
    createRegistry(),
    (activeSession, activeSubagent, task) =>
      delegator.delegate(activeSession, activeSubagent, task),
    () => session,
  );
}

function findNode(
  session: Session,
  type: SessionNode['type'],
  content: string,
): SessionNode | undefined {
  return Object.values(session.nodes).find(
    (node) => node.type === type && node.content === content,
  );
}

describe('DelegateTool and SubagentDelegator integration', () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    for (const dir of cleanupDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function createSessionManager(provider: LLMProvider): SessionManager {
    const sessionsDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'crab-delegate-'),
    );
    cleanupDirs.push(sessionsDir);
    return new SessionManager(sessionsDir, provider);
  }

  it('records delegated work on a child branch and returns the branch summary', async () => {
    const provider = new ScriptedProvider((_messages, _options, callNumber) =>
      callNumber === 1
        ? 'Subagent completed branch work.'
        : 'Summary returned to caller.',
    );
    const manager = createSessionManager(provider);
    const session = createSession(manager);
    const forkPoint = session.currentNodeId;
    const tool = createDelegateTool(session, provider, manager);

    const result = await tool.execute(
      {
        subagent: 'reviewer',
        task: 'Review the methods section.',
      },
      toolContext,
    );

    expect(result).toMatchObject({
      success: true,
      output: 'Summary returned to caller.',
    });

    const taskNode = findNode(session, 'user', 'Review the methods section.');
    expect(taskNode?.parentId).toBe(forkPoint);

    const branchLeaf = findNode(
      session,
      'assistant',
      'Subagent completed branch work.',
    );
    expect(branchLeaf?.parentId).toBe(taskNode?.id);

    const summaryNode = Object.values(session.nodes).find(
      (node) =>
        node.type === 'summary' &&
        node.metadata.sourceBranchLeafId === branchLeaf?.id,
    );
    expect(summaryNode?.parentId).toBe(forkPoint);
    expect(summaryNode?.content).toBe('Summary returned to caller.');
    expect(session.currentNodeId).toBe(summaryNode?.id);
    expect(session.nodes[forkPoint].childrenIds).toEqual(
      expect.arrayContaining([taskNode!.id, summaryNode!.id]),
    );
    expect(session.nodes[forkPoint].metadata.branchReason).toBe(
      'subagent: reviewer',
    );
  });

  it('returns a failure summary without throwing when subagent execution fails', async () => {
    const provider = new ScriptedProvider((_messages, _options, callNumber) => {
      if (callNumber === 1) {
        return new Error('model unavailable');
      }
      return 'Failure branch summarized.';
    });
    const manager = createSessionManager(provider);
    const session = createSession(manager);
    const forkPoint = session.currentNodeId;
    const tool = createDelegateTool(session, provider, manager);

    const result = await tool.execute(
      {
        subagent: 'reviewer',
        task: 'Check the statistics.',
      },
      toolContext,
    );

    expect(result.success).toBe(false);
    expect(result.output).toContain('model unavailable');
    expect(result.error).toContain('model unavailable');

    const taskNode = findNode(session, 'user', 'Check the statistics.');
    expect(taskNode?.parentId).toBe(forkPoint);

    const branchLeaf = Object.values(session.nodes).find(
      (node) =>
        node.type === 'assistant' &&
        typeof node.content === 'string' &&
        node.content.includes('model unavailable'),
    );
    expect(branchLeaf?.parentId).toBe(taskNode?.id);
    expect(branchLeaf?.metadata.isError).toBe(true);

    const summaryNode = Object.values(session.nodes).find(
      (node) =>
        node.type === 'summary' &&
        node.metadata.sourceBranchLeafId === branchLeaf?.id,
    );
    expect(summaryNode?.parentId).toBe(forkPoint);
    expect(session.currentNodeId).toBe(summaryNode?.id);
  });
});
