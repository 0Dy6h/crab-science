import * as os from 'os';
import * as path from 'path';
import type { SessionNode } from './types.js';

/**
 * 生成唯一 ID
 * @param prefix - 前缀（如 'sess'）
 * @returns 形如 `sess_20260720_a1b2c3` 的 ID
 */
export function generateId(prefix: string): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const randStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${dateStr}_${randStr}`;
}

/**
 * 展开 `~` 为用户 home 目录
 */
export function expandTilde(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
    return path.join(homeDir, filePath.slice(1));
  }
  return filePath;
}

/**
 * 简易 token 估算（字符数 / 4）
 * Phase 1 使用此简易方法，后续可集成 tiktoken
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * 截断长输出
 * @param text - 原始文本
 * @param maxLines - 最大行数
 * @returns 截断后的文本
 */
export function truncateOutput(text: string, maxLines: number): string {
  if (!text) return '';
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  const truncated = lines.slice(0, maxLines).join('\n');
  return `${truncated}\n... (共 ${lines.length} 行，已截断)`;
}

/**
 * 格式化成本显示
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * 格式化 token 数显示（如 12.4K）
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return String(tokens);
}

/**
 * 检查路径是否包含 glob 字符
 */
export function isGlobPattern(filePath: string): boolean {
  return /[*?[\]{}]/.test(filePath);
}

/**
 * 合法的自进化 artifact 名称（Skill / Subagent 名）。
 * 名称会被拼接进文件系统路径与 Git filepath，必须严格限制以防路径穿越。
 */
const SAFE_ARTIFACT_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/**
 * 校验 artifact 名称是否安全（可安全用作文件名/路径片段）。
 */
export function isSafeArtifactName(name: string): boolean {
  return typeof name === 'string' && SAFE_ARTIFACT_NAME.test(name);
}

/**
 * 断言 artifact 名称安全，否则抛错。
 * 用于任何将 LLM 生成的名称落地到文件系统的写入路径。
 */
export function assertSafeArtifactName(name: string): void {
  if (!isSafeArtifactName(name)) {
    throw new Error(
      `非法 artifact 名称: ${JSON.stringify(name)}（仅允许字母、数字、-、_，长度 1-64，且不得以 -/_ 开头）`,
    );
  }
}

/**
 * 将任意字符串净化为安全的 artifact 名称；无法净化时返回 fallback。
 */
export function sanitizeArtifactName(name: string, fallback: string): string {
  if (isSafeArtifactName(name)) return name;
  const cleaned = (name ?? '')
    .toString()
    .trim()
    .replace(/[^a-z0-9_-]/gi, '-')
    .replace(/^[-_]+/, '')
    .slice(0, 64);
  return isSafeArtifactName(cleaned) ? cleaned : fallback;
}

/**
 * 检查目标路径是否在指定目录内
 */
export function isPathWithin(targetPath: string, dirPath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedDir = path.resolve(dirPath);
  const relative = path.relative(resolvedDir, resolvedTarget);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * 获取当前时间戳（ISO 8601）
 */
export function nowISO(): string {
  return new Date().toISOString();
}

// ============ Phase 2 新增工具函数 ============

/**
 * 从扁平节点 Map 中提取从 root 到目标节点的路径
 * @param nodes - 扁平节点 Map
 * @param rootId - 根节点 ID
 * @param targetId - 目标节点 ID
 * @returns 从 root 到 target 的节点数组（有序）
 */
export function getPathFromRoot(
  nodes: Record<string, SessionNode>,
  rootId: string,
  targetId: string,
): SessionNode[] {
  if (!rootId || !targetId || !nodes[targetId]) {
    return [];
  }

  const path: SessionNode[] = [];
  let currentId: string | null = targetId;

  while (currentId && nodes[currentId]) {
    path.unshift(nodes[currentId]);
    if (currentId === rootId) break;
    currentId = nodes[currentId].parentId;
  }

  return path;
}
