import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import { truncateOutput } from '@crab-science/shared';

interface ToolBlockProps {
  toolName: string;
  params: Record<string, unknown>;
  result?: { success: boolean; output: string; error?: string };
}

/** 工具图标映射 */
const TOOL_ICONS: Record<string, string> = {
  read: '📄',
  write: '✏️',
  edit: '🔧',
  bash: '💻',
};

/** 工具参数显示 */
function formatParams(toolName: string, params: Record<string, unknown>): string {
  switch (toolName) {
    case 'read':
      return `path: ${params.path ?? ''}`;
    case 'write':
      return `path: ${params.path ?? ''} (${String(params.content ?? '').split('\n').length} 行)`;
    case 'edit':
      return `path: ${params.path ?? ''}`;
    case 'bash':
      return `$ ${params.command ?? ''}`;
    default:
      return Object.entries(params)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(', ');
  }
}

/** 工具结果摘要 */
function formatResult(toolName: string, result: { success: boolean; output: string; error?: string }): string {
  const icon = result.success ? chalk.green('✓') : chalk.red('✗');
  const output = truncateOutput(result.output, 5);

  switch (toolName) {
    case 'read':
      return `${icon} ${result.success ? '读取成功' : '读取失败'}\n${output}`;
    case 'write':
      return `${icon} ${result.success ? '写入成功' : '写入失败'}\n${output}`;
    case 'edit':
      return `${icon} ${result.success ? '编辑成功' : '编辑失败'}\n${output}`;
    case 'bash':
      return `${icon} exit ${result.success ? 0 : 1}\n${output}`;
    default:
      return `${icon} ${output}`;
  }
}

/**
 * 工具调用可视化块
 */
export function ToolBlock({ toolName, params, result }: ToolBlockProps): React.ReactElement {
  const icon = TOOL_ICONS[toolName] ?? '🔧';
  const header = `${icon} ${toolName}`;
  const paramStr = formatParams(toolName, params);

  return (
    <Box flexDirection="column" marginY={1} paddingLeft={2}>
      <Text>
        {chalk.gray('┌─')} {chalk.yellow(header)} {chalk.gray('─────────────────────')}
      </Text>
      <Text>
        {chalk.gray('│')} {chalk.white(paramStr)}
      </Text>
      {result && (
        <Text>
          {chalk.gray('│')} {formatResult(toolName, result)}
        </Text>
      )}
      <Text>{chalk.gray('└────────────────────────────────────')}</Text>
    </Box>
  );
}
