import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EditTool } from '../../src/tools/edit-tool.js';
import type { ToolContext } from '@crab-science/shared';

describe('EditTool', () => {
  let workDir: string;
  let ctx: ToolContext;
  let tool: EditTool;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-test-'));
    ctx = { workDir, sessionId: 'test-session' };
    tool = new EditTool();
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('应具有正确的工具名称', () => {
    expect(tool.name).toBe('edit');
  });

  it('应具有参数 schema 包含 path, old_string, new_string', () => {
    expect(tool.parameters.properties).toHaveProperty('path');
    expect(tool.parameters.properties).toHaveProperty('old_string');
    expect(tool.parameters.properties).toHaveProperty('new_string');
    expect(tool.parameters.required).toContain('path');
    expect(tool.parameters.required).toContain('old_string');
    expect(tool.parameters.required).toContain('new_string');
  });

  it('应在唯一匹配时成功替换', async () => {
    const filePath = 'edit-test.txt';
    const original = 'Hello, World!\nThis is a test.\nGoodbye.';
    fs.writeFileSync(path.join(workDir, filePath), original);

    const result = await tool.execute(
      {
        path: filePath,
        old_string: 'This is a test.',
        new_string: 'This is an edited line.',
      },
      ctx,
    );

    expect(result.success).toBe(true);
    const written = fs.readFileSync(path.join(workDir, filePath), 'utf-8');
    expect(written).toContain('This is an edited line.');
    expect(written).not.toContain('This is a test.');
    expect(written).toContain('Hello, World!');
    expect(written).toContain('Goodbye.');
  });

  it('应在 0 次匹配时返回错误', async () => {
    const filePath = 'no-match.txt';
    fs.writeFileSync(path.join(workDir, filePath), 'Hello, World!');

    const result = await tool.execute(
      {
        path: filePath,
        old_string: 'This text does not exist',
        new_string: 'replacement',
      },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('未找到');

    // 文件内容不应改变
    const written = fs.readFileSync(path.join(workDir, filePath), 'utf-8');
    expect(written).toBe('Hello, World!');
  });

  it('应在多次匹配时返回错误', async () => {
    const filePath = 'multi-match.txt';
    const content = 'duplicate\nduplicate\nduplicate';
    fs.writeFileSync(path.join(workDir, filePath), content);

    const result = await tool.execute(
      {
        path: filePath,
        old_string: 'duplicate',
        new_string: 'unique',
      },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('匹配了 3 处');
    expect(result.error).toContain('更长的上下文');

    // 文件内容不应改变
    const written = fs.readFileSync(path.join(workDir, filePath), 'utf-8');
    expect(written).toBe(content);
  });

  it('应在文件不存在时返回错误', async () => {
    const result = await tool.execute(
      {
        path: 'nonexistent.txt',
        old_string: 'old',
        new_string: 'new',
      },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('文件不存在');
  });

  it('应在路径越界时返回错误', async () => {
    const outsidePath = path.join(os.tmpdir(), 'outside-edit.txt');
    fs.writeFileSync(outsidePath, 'content');

    const result = await tool.execute(
      {
        path: outsidePath,
        old_string: 'content',
        new_string: 'new content',
      },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');

    fs.unlinkSync(outsidePath);
  });

  it('应在使用 .. 逃逸时返回路径越界错误', async () => {
    const result = await tool.execute(
      {
        path: '../../../etc/passwd',
        old_string: 'old',
        new_string: 'new',
      },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');
  });

  it('应在 path 参数为空时返回错误', async () => {
    const result = await tool.execute(
      { path: '', old_string: 'old', new_string: 'new' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('path 参数不能为空');
  });

  it('应在 old_string 为 undefined 时返回错误', async () => {
    const result = await tool.execute(
      { path: 'file.txt', old_string: undefined, new_string: 'new' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('old_string 参数不能为空');
  });

  it('应在 new_string 为 null 时返回错误', async () => {
    const result = await tool.execute(
      { path: 'file.txt', old_string: 'old', new_string: null },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('new_string 参数不能为空');
  });

  it('应报告行数变化', async () => {
    const filePath = 'line-change.txt';
    fs.writeFileSync(path.join(workDir, filePath), 'line1\nline2\nline3');

    const result = await tool.execute(
      {
        path: filePath,
        old_string: 'line2',
        new_string: 'line2a\nline2b\nline2c',
      },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('3 → 5');
    expect(result.output).toContain('+2');
  });

  it('应支持减少行数的替换', async () => {
    const filePath = 'reduce-lines.txt';
    fs.writeFileSync(path.join(workDir, filePath), 'line1\nline2\nline3\nline4');

    const result = await tool.execute(
      {
        path: filePath,
        old_string: 'line2\nline3\nline4',
        new_string: 'merged',
      },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('4 → 2');
    expect(result.output).toContain('-2');
  });

  it('应支持包含特殊字符的替换', async () => {
    const filePath = 'special.txt';
    fs.writeFileSync(path.join(workDir, filePath), 'const x = "hello $world";');

    const result = await tool.execute(
      {
        path: filePath,
        old_string: 'const x = "hello $world";',
        new_string: 'const x = `hello ${world}`;',
      },
      ctx,
    );

    expect(result.success).toBe(true);
    const written = fs.readFileSync(path.join(workDir, filePath), 'utf-8');
    expect(written).toBe('const x = `hello ${world}`;');
  });
});
