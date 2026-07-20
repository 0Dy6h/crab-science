import * as os from 'os';
import * as path from 'path';

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
    return path.join(os.homedir(), filePath.slice(1));
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
