import { describe, it, expect } from 'vitest';
import {
  generateId,
  expandTilde,
  estimateTokens,
  truncateOutput,
  formatCost,
  formatTokens,
  isGlobPattern,
  isPathWithin,
  nowISO,
} from '@crab-science/shared';
import * as os from 'os';
import * as path from 'path';

describe('generateId', () => {
  it('应返回以指定前缀开头的 ID', () => {
    const id = generateId('sess');
    expect(id.startsWith('sess_')).toBe(true);
  });

  it('应包含当前日期（YYYYMMDD 格式）', () => {
    const id = generateId('sess');
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    expect(id).toContain(dateStr);
  });

  it('应生成唯一 ID（连续调用不重复）', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId('msg'));
    }
    expect(ids.size).toBe(100);
  });

  it('应支持不同前缀', () => {
    expect(generateId('sess').startsWith('sess_')).toBe(true);
    expect(generateId('msg').startsWith('msg_')).toBe(true);
    expect(generateId('tool').startsWith('tool_')).toBe(true);
  });
});

describe('expandTilde', () => {
  it('应将 ~/ 展开为用户 home 目录', () => {
    const result = expandTilde('~/documents/file.txt');
    expect(result).toBe(path.join(os.homedir(), 'documents/file.txt'));
  });

  it('应将单独的 ~ 展开为 home 目录', () => {
    const result = expandTilde('~');
    expect(result).toBe(os.homedir());
  });

  it('不应修改非 tilde 开头的路径', () => {
    expect(expandTilde('/usr/local/bin')).toBe('/usr/local/bin');
    expect(expandTilde('relative/path')).toBe('relative/path');
    expect(expandTilde('./current/dir')).toBe('./current/dir');
  });

  it('不应展开路径中间的 ~', () => {
    const result = expandTilde('/home/~user/file');
    expect(result).toBe('/home/~user/file');
  });
});

describe('estimateTokens', () => {
  it('空字符串应返回 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('应返回字符数 / 4 的向上取整', () => {
    expect(estimateTokens('abcd')).toBe(1); // 4/4 = 1
    expect(estimateTokens('abc')).toBe(1); // 3/4 = 0.75 → ceil = 1
    expect(estimateTokens('abcde')).toBe(2); // 5/4 = 1.25 → ceil = 2
    expect(estimateTokens('abcdefgh')).toBe(2); // 8/4 = 2
  });

  it('应处理长文本', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBe(100);
    const text2 = 'a'.repeat(401);
    expect(estimateTokens(text2)).toBe(101);
  });
});

describe('truncateOutput', () => {
  it('空字符串应返回空', () => {
    expect(truncateOutput('', 10)).toBe('');
  });

  it('行数不超过 maxLines 时应原样返回', () => {
    const text = 'line1\nline2\nline3';
    expect(truncateOutput(text, 5)).toBe(text);
    expect(truncateOutput(text, 3)).toBe(text);
  });

  it('行数超过 maxLines 时应截断并添加提示', () => {
    const text = 'line1\nline2\nline3\nline4\nline5';
    const result = truncateOutput(text, 3);
    expect(result).toContain('line1');
    expect(result).toContain('line2');
    expect(result).toContain('line3');
    expect(result).not.toContain('line4');
    expect(result).not.toContain('line5');
    expect(result).toContain('共 5 行');
    expect(result).toContain('已截断');
  });

  it('单行文本不应被截断', () => {
    const text = 'single line text';
    expect(truncateOutput(text, 1)).toBe(text);
  });
});

describe('formatCost', () => {
  it('小于 0.01 的成本应显示 4 位小数', () => {
    expect(formatCost(0.001)).toBe('$0.0010');
    expect(formatCost(0.005)).toBe('$0.0050');
    expect(formatCost(0.009)).toBe('$0.0090');
  });

  it('大于等于 0.01 的成本应显示 2 位小数', () => {
    expect(formatCost(0.01)).toBe('$0.01');
    expect(formatCost(0.1)).toBe('$0.10');
    expect(formatCost(1.5)).toBe('$1.50');
    expect(formatCost(10)).toBe('$10.00');
  });
});

describe('formatTokens', () => {
  it('小于 1000 的 token 数应直接显示', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('大于等于 1000 的 token 数应以 K 为单位显示', () => {
    expect(formatTokens(1000)).toBe('1.0K');
    expect(formatTokens(12400)).toBe('12.4K');
    expect(formatTokens(1000000)).toBe('1000.0K');
  });
});

describe('isGlobPattern', () => {
  it('应识别 * 通配符', () => {
    expect(isGlobPattern('*.ts')).toBe(true);
    expect(isGlobPattern('**/*.csv')).toBe(true);
  });

  it('应识别 ? 通配符', () => {
    expect(isGlobPattern('file?.txt')).toBe(true);
  });

  it('应识别 [] 字符集', () => {
    expect(isGlobPattern('file[0-9].txt')).toBe(true);
  });

  it('应识别 {} 模式组', () => {
    expect(isGlobPattern('file.{ts,js}')).toBe(true);
  });

  it('普通路径不应被识别为 glob', () => {
    expect(isGlobPattern('src/index.ts')).toBe(false);
    expect(isGlobPattern('README.md')).toBe(false);
    expect(isGlobPattern('/usr/local/bin')).toBe(false);
  });
});

describe('isPathWithin', () => {
  it('工作目录内的路径应返回 true', () => {
    expect(isPathWithin('/work/src/file.ts', '/work')).toBe(true);
    expect(isPathWithin('/work/deep/nested/file.ts', '/work')).toBe(true);
    expect(isPathWithin('/work', '/work')).toBe(true);
  });

  it('工作目录外的路径应返回 false', () => {
    expect(isPathWithin('/etc/passwd', '/work')).toBe(false);
    expect(isPathWithin('/other/file.ts', '/work')).toBe(false);
  });

  it('使用 .. 逃逸的路径应返回 false', () => {
    expect(isPathWithin('/work/../etc/passwd', '/work')).toBe(false);
  });

  it('相对路径应正确解析', () => {
    const cwd = process.cwd();
    expect(isPathWithin('src/file.ts', cwd)).toBe(true);
    expect(isPathWithin('../outside/file.ts', cwd)).toBe(false);
  });
});

describe('nowISO', () => {
  it('应返回有效的 ISO 8601 时间字符串', () => {
    const result = nowISO();
    const parsed = new Date(result);
    expect(parsed.toString()).not.toBe('Invalid Date');
  });

  it('应接近当前时间', () => {
    const before = Date.now();
    const result = new Date(nowISO()).getTime();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});
