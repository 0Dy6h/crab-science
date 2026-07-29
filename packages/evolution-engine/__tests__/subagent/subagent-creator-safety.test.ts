import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PatternMatch, SubagentDefinition } from '@crab-science/shared';
import type { LLMOptions, LLMProvider, ModelInfo, StreamEvent } from '@crab-science/llm-layer';
import { SubagentCreator } from '../../src/subagent/subagent-creator.js';

/**
 * SubagentCreator 安全与模型线路回归测试 (EVO-001 / SEC-03 / EVO-007)
 */

class RecordingProvider implements LLMProvider {
  name = 'deepseek';
  lastModel = '__unset__';

  constructor(private readonly markdown: string) {}

  async *complete(_messages: unknown, options: LLMOptions): AsyncGenerator<StreamEvent> {
    this.lastModel = options.model;
    yield { type: 'text_delta', content: this.markdown };
    yield { type: 'message_end', usage: { inputTokens: 1, outputTokens: 1, cost: 0 } };
  }

  listModels(): ModelInfo[] {
    return [];
  }
}

function makePattern(): PatternMatch {
  return {
    signature: 'sig',
    matchingTasks: [],
    count: 3,
    suggestedName: 'safe-name',
    suggestedDescription: 'desc',
  };
}

const fakeGit = { commit: async () => 'hash' } as never;

const cleanup: string[] = [];
afterEach(() => {
  for (const d of cleanup.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('SubagentCreator 安全与模型线路', () => {
  it('把配置的进化模型传给 provider（不再是空字符串）', async () => {
    const provider = new RecordingProvider(
      '---\nname: "x"\ndescription: "d"\n---\n# body',
    );
    const creator = new SubagentCreator(provider, fakeGit, 'deepseek-chat');
    await creator.createDraft(makePattern());
    expect(provider.lastModel).toBe('deepseek-chat');
  });

  it('净化 LLM 返回的路径穿越 name', async () => {
    const provider = new RecordingProvider(
      '---\nname: "../../etc/evil"\ndescription: "d"\n---\n# body',
    );
    const creator = new SubagentCreator(provider, fakeGit, 'deepseek-chat');
    const draft = await creator.createDraft(makePattern());
    // 结果名称必须是安全的、不含路径分隔符
    expect(draft.meta.name).not.toContain('/');
    expect(draft.meta.name).not.toContain('..');
  });

  it('save() 拒绝写出 subagents 目录之外（非法 name）', async () => {
    const provider = new RecordingProvider('# body');
    const creator = new SubagentCreator(provider, fakeGit, 'deepseek-chat');
    const evil: SubagentDefinition = {
      meta: {
        name: '../../escape',
        description: 'd',
        mode: 'autonomous',
        model: 'inherit',
        tools: ['read'],
      },
      path: '',
      content: '# body',
    };
    await expect(creator.save(evil)).rejects.toThrow();
  });
});
