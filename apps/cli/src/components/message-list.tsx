import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { marked } from 'marked';
import { highlight } from 'cli-highlight';
import type { DisplayMessage } from '../hooks/use-agent.js';
import { ToolBlock } from './tool-block.js';

interface MessageListProps {
  messages: DisplayMessage[];
}

/**
 * 渲染 Markdown 文本（简易）
 * 代码块高亮，其他保留原始格式
 */
function renderMarkdown(text: string): string {
  if (!text) return '';
  try {
    const tokens = marked.lexer(text);
    const parts: string[] = [];

    for (const token of tokens) {
      const t = token as { type: string; text?: string; raw?: string; lang?: string; items?: Array<{ text: string }> };

      switch (t.type) {
        case 'code': {
          const codeText = t.text ?? '';
          const highlighted = highlight(codeText, {
            language: t.lang || 'auto',
            ignoreIllegals: true,
          });
          parts.push(chalk.gray('┌─ code ──────────────────────'));
          parts.push(highlighted);
          parts.push(chalk.gray('└─────────────────────────────'));
          break;
        }
        case 'heading': {
          parts.push(chalk.bold(t.text ?? ''));
          break;
        }
        case 'list': {
          if (t.items) {
            for (const item of t.items) {
              parts.push(`  • ${item.text}`);
            }
          }
          break;
        }
        case 'paragraph': {
          parts.push(t.text ?? '');
          break;
        }
        case 'space': {
          parts.push('');
          break;
        }
        default: {
          if (t.raw) parts.push(t.raw);
          break;
        }
      }
    }

    return parts.length > 0 ? parts.join('\n') : text;
  } catch {
    return text;
  }
}

/**
 * 对话区域组件
 * 渲染消息列表（用户消息 + Agent 消息 + 工具调用块）
 */
export function MessageList({ messages }: MessageListProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      {messages.map((msg) => {
        // 工具消息
        if (msg.role === 'tool') {
          return (
            <ToolBlock
              key={msg.id}
              toolName={msg.toolName || 'unknown'}
              params={msg.toolParams || {}}
              result={msg.toolResult}
            />
          );
        }

        // 用户消息
        if (msg.role === 'user') {
          return (
            <Box key={msg.id} marginBottom={1}>
              <Text>
                {chalk.green('You:')} {msg.content}
              </Text>
            </Box>
          );
        }

        // 摘要消息
        if (msg.role === 'summary') {
          return (
            <Box key={msg.id} marginBottom={1} flexDirection="column">
              <Text>
                {chalk.magenta('📝 Summary:')} {chalk.gray('(分支摘要)')}
              </Text>
              <Text color="gray">{renderMarkdown(msg.content)}</Text>
            </Box>
          );
        }

        // 系统消息（命令输出等）
        if (msg.isSystem) {
          return (
            <Box key={msg.id} marginBottom={1}>
              <Text color="yellow">{'⚡ '}{msg.content}</Text>
            </Box>
          );
        }

        // Assistant 消息
        const rendered = renderMarkdown(msg.content);
        return (
          <Box key={msg.id} marginBottom={1} flexDirection="column">
            <Text>
              {chalk.cyan('Crab:')} {rendered || (msg.isStreaming ? chalk.gray('思考中...') : '')}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
