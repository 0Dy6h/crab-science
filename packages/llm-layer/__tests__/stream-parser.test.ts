import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIStreamParser, AnthropicStreamParser } from '@crab-science/llm-layer';
import type { StreamEvent } from '@crab-science/llm-layer';

describe('OpenAIStreamParser', () => {
  let parser: OpenAIStreamParser;

  beforeEach(() => {
    parser = new OpenAIStreamParser();
  });

  it('应解析文本增量（text_delta）', () => {
    const chunk = {
      choices: [
        {
          delta: { content: 'Hello' },
          finish_reason: null,
        },
      ],
    };

    const events = parser.parse(chunk);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('text_delta');
    expect((events[0] as { content: string }).content).toBe('Hello');
  });

  it('应解析多个文本增量', () => {
    const events1 = parser.parse({
      choices: [{ delta: { content: 'Hello' } }],
    });
    const events2 = parser.parse({
      choices: [{ delta: { content: ', ' } }],
    });
    const events3 = parser.parse({
      choices: [{ delta: { content: 'World!' } }],
    });

    expect(events1[0]).toMatchObject({ type: 'text_delta', content: 'Hello' });
    expect(events2[0]).toMatchObject({ type: 'text_delta', content: ', ' });
    expect(events3[0]).toMatchObject({ type: 'text_delta', content: 'World!' });
  });

  it('应解析工具调用增量（tool_call_start + delta + end）', () => {
    // 第一个 chunk：工具调用开始
    const chunk1 = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_abc123',
                function: { name: 'read', arguments: '' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };
    const events1 = parser.parse(chunk1);

    expect(events1.some((e) => e.type === 'tool_call_start')).toBe(true);
    const startEvent = events1.find((e) => e.type === 'tool_call_start') as {
      type: string;
      toolCallId: string;
      toolName: string;
    };
    expect(startEvent.toolCallId).toBe('call_abc123');
    expect(startEvent.toolName).toBe('read');

    // 第二个 chunk：参数增量
    const chunk2 = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: '{"path":"test.txt"}' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };
    const events2 = parser.parse(chunk2);

    expect(events2.some((e) => e.type === 'tool_call_delta')).toBe(true);

    // 第三个 chunk：finish_reason = tool_calls
    const chunk3 = {
      choices: [
        {
          delta: {},
          finish_reason: 'tool_calls',
        },
      ],
    };
    const events3 = parser.parse(chunk3);

    expect(events3.some((e) => e.type === 'tool_call_end')).toBe(true);
    const endEvent = events3.find((e) => e.type === 'tool_call_end') as {
      type: string;
      toolCallId: string;
      input: Record<string, unknown>;
    };
    expect(endEvent.toolCallId).toBe('call_abc123');
    expect(endEvent.input).toEqual({ path: 'test.txt' });
  });

  it('应处理分片到达的工具调用参数', () => {
    // 开始
    parser.parse({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'call_1', function: { name: 'write', arguments: '' } },
            ],
          },
        },
      ],
    });

    // 参数分片到达
    parser.parse({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '{"path":' } }],
          },
        },
      ],
    });
    parser.parse({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '"out.txt",' } }],
          },
        },
      ],
    });
    parser.parse({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '"content":"hi"}' } }],
          },
        },
      ],
    });

    // 完成
    const events = parser.parse({
      choices: [{ delta: {}, finish_reason: 'tool_calls' }],
    });

    const endEvent = events.find((e) => e.type === 'tool_call_end') as {
      input: Record<string, unknown>;
    };
    expect(endEvent.input).toEqual({ path: 'out.txt', content: 'hi' });
  });

  it('应解析 usage 信息（message_end）', () => {
    const chunk = {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    };

    const events = parser.parse(chunk);

    const endEvent = events.find((e) => e.type === 'message_end') as {
      usage: { inputTokens: number; outputTokens: number; cost: number };
    };
    expect(endEvent).toBeDefined();
    expect(endEvent.usage.inputTokens).toBe(100);
    expect(endEvent.usage.outputTokens).toBe(50);
    expect(endEvent.usage.cost).toBe(0);
  });

  it('应在无 choices 时处理 usage-only chunk', () => {
    const chunk = {
      usage: { prompt_tokens: 200, completion_tokens: 100 },
    };

    const events = parser.parse(chunk);

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('message_end');
  });

  it('应在 stop 完成时发射 tool_call_end', () => {
    // 先开始一个工具调用
    parser.parse({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'call_1', function: { name: 'bash', arguments: '{"command":"ls"}' } },
            ],
          },
        },
      ],
    });

    // stop 完成
    const events = parser.parse({
      choices: [{ delta: {}, finish_reason: 'stop' }],
    });

    expect(events.some((e) => e.type === 'tool_call_end')).toBe(true);
  });

  it('应处理无效的 JSON 参数（回退到 _raw）', () => {
    parser.parse({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'call_1', function: { name: 'read', arguments: 'invalid json' } },
            ],
          },
        },
      ],
    });

    const events = parser.parse({
      choices: [{ delta: {}, finish_reason: 'tool_calls' }],
    });

    const endEvent = events.find((e) => e.type === 'tool_call_end') as {
      input: Record<string, unknown>;
    };
    expect(endEvent.input).toEqual({ _raw: 'invalid json' });
  });

  it('reset 应清除解析器状态', () => {
    parser.parse({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'call_1', function: { name: 'read', arguments: '{}' } },
            ],
          },
        },
      ],
    });

    parser.reset();

    // reset 后不应有之前的工具调用
    const events = parser.parse({
      choices: [{ delta: {}, finish_reason: 'tool_calls' }],
    });

    expect(events.find((e) => e.type === 'tool_call_end')).toBeUndefined();
  });

  it('空 delta 不应产生事件', () => {
    const events = parser.parse({
      choices: [{ delta: {}, finish_reason: null }],
    });

    expect(events).toEqual([]);
  });
});

describe('AnthropicStreamParser', () => {
  let parser: AnthropicStreamParser;

  beforeEach(() => {
    parser = new AnthropicStreamParser();
  });

  it('应解析文本增量（text_delta）', () => {
    const events = parser.parse({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });

    // content_block_start for text 不产生事件
    expect(events).toEqual([]);

    const events2 = parser.parse({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hello' },
    });

    expect(events2.length).toBe(1);
    expect(events2[0].type).toBe('text_delta');
    expect((events2[0] as { content: string }).content).toBe('Hello');
  });

  it('应解析多个文本增量', () => {
    parser.parse({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });

    const e1 = parser.parse({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hello' },
    });
    const e2 = parser.parse({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: ' World' },
    });

    expect((e1[0] as { content: string }).content).toBe('Hello');
    expect((e2[0] as { content: string }).content).toBe(' World');
  });

  it('应解析工具调用（tool_use）完整流程', () => {
    // 1. content_block_start (tool_use)
    const events1 = parser.parse({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu_123', name: 'read' },
    });

    expect(events1.some((e) => e.type === 'tool_call_start')).toBe(true);
    const startEvent = events1.find((e) => e.type === 'tool_call_start') as {
      toolCallId: string;
      toolName: string;
    };
    expect(startEvent.toolCallId).toBe('toolu_123');
    expect(startEvent.toolName).toBe('read');

    // 2. content_block_delta (input_json_delta)
    const events2 = parser.parse({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"path":"test.txt"}' },
    });

    expect(events2.some((e) => e.type === 'tool_call_delta')).toBe(true);

    // 3. content_block_stop
    const events3 = parser.parse({
      type: 'content_block_stop',
      index: 1,
    });

    expect(events3.some((e) => e.type === 'tool_call_end')).toBe(true);
    const endEvent = events3.find((e) => e.type === 'tool_call_end') as {
      toolCallId: string;
      input: Record<string, unknown>;
    };
    expect(endEvent.toolCallId).toBe('toolu_123');
    expect(endEvent.input).toEqual({ path: 'test.txt' });
  });

  it('应处理分片的工具调用参数', () => {
    // 开始
    parser.parse({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'write' },
    });

    // 参数分片
    parser.parse({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"path":' },
    });
    parser.parse({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '"file.txt",' },
    });
    parser.parse({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '"content":"data"}' },
    });

    // 结束
    const events = parser.parse({
      type: 'content_block_stop',
      index: 0,
    });

    const endEvent = events.find((e) => e.type === 'tool_call_end') as {
      input: Record<string, unknown>;
    };
    expect(endEvent.input).toEqual({ path: 'file.txt', content: 'data' });
  });

  it('应解析 usage 信息（message_delta）', () => {
    const events = parser.parse({
      type: 'message_delta',
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('message_end');
    const endEvent = events[0] as {
      usage: { inputTokens: number; outputTokens: number; cost: number };
    };
    expect(endEvent.usage.inputTokens).toBe(100);
    expect(endEvent.usage.outputTokens).toBe(50);
    expect(endEvent.usage.cost).toBe(0);
  });

  it('应处理无效的 JSON 参数（回退到 _raw）', () => {
    parser.parse({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'read' },
    });

    parser.parse({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: 'not valid json' },
    });

    const events = parser.parse({
      type: 'content_block_stop',
      index: 0,
    });

    const endEvent = events.find((e) => e.type === 'tool_call_end') as {
      input: Record<string, unknown>;
    };
    expect(endEvent.input).toEqual({ _raw: 'not valid json' });
  });

  it('reset 应清除解析器状态', () => {
    parser.parse({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'read' },
    });

    parser.reset();

    // reset 后 content_block_stop 不应产生事件
    const events = parser.parse({
      type: 'content_block_stop',
      index: 0,
    });

    expect(events.find((e) => e.type === 'tool_call_end')).toBeUndefined();
  });

  it('message_start 不应产生事件', () => {
    const events = parser.parse({
      type: 'message_start',
      message: { usage: { input_tokens: 10, output_tokens: 0 } },
    });

    expect(events).toEqual([]);
  });

  it('message_stop 不应产生事件', () => {
    const events = parser.parse({
      type: 'message_stop',
    });

    expect(events).toEqual([]);
  });

  it('应支持文本和工具调用的混合输出', () => {
    // 文本块
    parser.parse({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });
    const textEvents = parser.parse({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Let me read that file.' },
    });
    parser.parse({ type: 'content_block_stop', index: 0 });

    // 工具调用块
    const toolStartEvents = parser.parse({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'read' },
    });
    parser.parse({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"path":"file.txt"}' },
    });
    const toolEndEvents = parser.parse({
      type: 'content_block_stop',
      index: 1,
    });

    expect(textEvents[0].type).toBe('text_delta');
    expect(toolStartEvents[0].type).toBe('tool_call_start');
    expect(toolEndEvents.some((e) => e.type === 'tool_call_end')).toBe(true);
  });
});
