import { describe, it, expect } from 'vitest';
import {
  isSafeArtifactName,
  assertSafeArtifactName,
  sanitizeArtifactName,
} from '../src/index.js';

/**
 * Artifact 名称校验 (SEC-03 / EVO-007)
 *
 * LLM 生成的 Skill/Subagent 名称会被拼进文件系统路径与 Git filepath，
 * 必须严格限制以防路径穿越。
 */
describe('artifact 名称校验', () => {
  it('接受普通名称', () => {
    expect(isSafeArtifactName('literature-search')).toBe(true);
    expect(isSafeArtifactName('data_analysis2')).toBe(true);
  });

  it('拒绝路径穿越与分隔符', () => {
    expect(isSafeArtifactName('../evil')).toBe(false);
    expect(isSafeArtifactName('a/b')).toBe(false);
    expect(isSafeArtifactName('a\\b')).toBe(false);
    expect(isSafeArtifactName('/etc/passwd')).toBe(false);
    expect(isSafeArtifactName('..')).toBe(false);
    expect(isSafeArtifactName('')).toBe(false);
    expect(isSafeArtifactName('-leading')).toBe(false);
  });

  it('assertSafeArtifactName 对非法名称抛错', () => {
    expect(() => assertSafeArtifactName('../../x')).toThrow();
    expect(() => assertSafeArtifactName('good-name')).not.toThrow();
  });

  it('sanitizeArtifactName 净化非法字符', () => {
    expect(sanitizeArtifactName('../evil name', 'fallback')).toBe('evil-name');
    // 完全无法净化时返回 fallback
    expect(sanitizeArtifactName('///', 'fallback')).toBe('fallback');
    expect(sanitizeArtifactName('good', 'fallback')).toBe('good');
  });
});
