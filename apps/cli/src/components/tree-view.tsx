import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';
import type { SessionNode } from '@crab-science/shared';

/** 树视图属性 */
interface TreeViewProps {
  /** 扁平节点 Map */
  nodes: Record<string, SessionNode>;
  /** 根节点 ID */
  rootId: string;
  /** 当前节点 ID */
  currentNodeId: string;
  /** 是否激活显示 */
  isActive: boolean;
  /** 关闭回调 */
  onClose: () => void;
}

/** 节点类型配置 */
const NODE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  user: { icon: '👤', label: '用户', color: 'green' },
  assistant: { icon: '🤖', label: '助手', color: 'cyan' },
  tool_call: { icon: '🔧', label: '工具', color: 'yellow' },
  tool_result: { icon: '📋', label: '结果', color: 'gray' },
  summary: { icon: '📝', label: '摘要', color: 'magenta' },
};

/**
 * 渲染单个节点的摘要文本
 */
function getNodeSummary(node: SessionNode): string {
  if (node.type === 'tool_call') {
    return node.metadata.toolName ?? 'unknown';
  }

  if (typeof node.content === 'string') {
    return node.content.substring(0, 50).replace(/\n/g, ' ');
  }

  if (Array.isArray(node.content)) {
    const textParts = node.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '');
    return textParts.join('').substring(0, 50).replace(/\n/g, ' ');
  }

  return '';
}

/**
 * 树节点渲染行
 */
interface TreeLine {
  node: SessionNode;
  prefix: string;
  connector: string;
  isCurrent: boolean;
  depth: number;
}

/**
 * 递归收集树节点渲染行
 */
function collectTreeLines(
  nodes: Record<string, SessionNode>,
  nodeId: string,
  prefix: string,
  isLast: boolean,
  currentNodeId: string,
  depth: number,
  lines: TreeLine[],
): void {
  const node = nodes[nodeId];
  if (!node) return;

  const connector = isLast ? '└── ' : '├── ';
  lines.push({
    node,
    prefix,
    connector,
    isCurrent: node.id === currentNodeId,
    depth,
  });

  const childPrefix = prefix + (isLast ? '    ' : '│   ');
  const children = node.childrenIds;
  for (let i = 0; i < children.length; i++) {
    const childIsLast = i === children.length - 1;
    collectTreeLines(
      nodes,
      children[i],
      childPrefix,
      childIsLast,
      currentNodeId,
      depth + 1,
      lines,
    );
  }
}

/**
 * Session 树可视化组件（Phase 2 新增）
 *
 * 以树形结构渲染当前 Session 的所有节点和分支，
 * 高亮当前所在节点，支持分支结构展示。
 *
 * 使用方式：在 App.tsx 中条件渲染，通过 /tree 命令触发显示。
 */
export function TreeView({
  nodes,
  rootId,
  currentNodeId,
  isActive,
  onClose,
}: TreeViewProps): React.ReactElement | null {
  const [lines, setLines] = useState<TreeLine[]>([]);

  useEffect(() => {
    if (!isActive || !rootId) {
      setLines([]);
      return;
    }

    const collected: TreeLine[] = [];
    collectTreeLines(nodes, rootId, '', true, currentNodeId, 0, collected);
    setLines(collected);
  }, [isActive, nodes, rootId, currentNodeId]);

  // 键盘监听：ESC 或 q 关闭
  useEffect(() => {
    if (!isActive) return;

    const handleKey = (data: Buffer) => {
      const key = data.toString();
      if (key === '\x1b' || key === 'q' || key === '\x03') {
        onClose();
      }
    };

    process.stdin.on('data', handleKey);
    return () => {
      process.stdin.off('data', handleKey);
    };
  }, [isActive, onClose]);

  if (!isActive || !rootId || lines.length === 0) {
    return null;
  }

  // 统计信息
  const totalNodes = Object.keys(nodes).length;
  const leafCount = lines.filter((l) => l.node.childrenIds.length === 0).length;
  const maxDepth = Math.max(...lines.map((l) => l.depth), 0);

  return (
    <Box flexDirection="column" paddingX={1} paddingBottom={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'═'.repeat(60)}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📊 Session 树结构
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="gray">
          {`节点: ${totalNodes} | 分支(叶): ${leafCount} | 最大深度: ${maxDepth} | 按 ESC/q 退出`}
        </Text>
      </Box>
      <Box flexDirection="column">
        {lines.map((line, idx) => {
          const config = NODE_CONFIG[line.node.type] ?? {
            icon: '•',
            label: line.node.type,
            color: 'white',
          };
          const summary = getNodeSummary(line.node);
          const idShort = line.node.id.substring(0, 8);
          const currentMarker = line.isCurrent ? chalk.bgBlue.white(' ← 当前 ') : '';
          const branchReason = line.node.metadata.branchReason
            ? chalk.yellow(` [fork: ${line.node.metadata.branchReason}]`)
            : '';

          return (
            <Text key={line.node.id}>
              <Text color="gray">{line.prefix}</Text>
              <Text color="gray">{line.connector}</Text>
              <Text>{config.icon} </Text>
              <Text color={config.color}>{config.label}</Text>
              <Text color="gray"> [{idShort}]</Text>
              {summary && <Text> - {summary}</Text>}
              {branchReason}
              {currentMarker && <Text> {currentMarker}</Text>}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color="gray">{'═'.repeat(60)}</Text>
      </Box>
    </Box>
  );
}
