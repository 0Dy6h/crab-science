import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WriteTool } from '../../src/tools/write-tool.js';
import type { ToolContext } from '@crab-science/shared';

describe('WriteTool', () => {
  let workDir: string;
  let ctx: ToolContext;
  let tool: WriteTool;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crab-test-'));
    ctx = { workDir, sessionId: 'test-session' };
    tool = new WriteTool();
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('应具有正确的工具名称', () => {
    expect(tool.name).toBe('write');
  });

  it('应具有参数 schema 包含 path 和 content', () => {
    expect(tool.parameters.properties).toHaveProperty('path');
    expect(tool.parameters.properties).toHaveProperty('content');
    expect(tool.parameters.required).toContain('path');
    expect(tool.parameters.required).toContain('content');
  });

  it('应成功创建新文件', async () => {
    const result = await tool.execute(
      { path: 'new-file.txt', content: 'Hello, World!' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('new-file.txt');
    expect(result.output).toContain('1 行');

    const written = fs.readFileSync(path.join(workDir, 'new-file.txt'), 'utf-8');
    expect(written).toBe('Hello, World!');
  });

  it('应成功覆盖已有文件', async () => {
    const filePath = 'existing.txt';
    fs.writeFileSync(path.join(workDir, filePath), 'old content');

    const result = await tool.execute(
      { path: filePath, content: 'new content' },
      ctx,
    );

    expect(result.success).toBe(true);
    const written = fs.readFileSync(path.join(workDir, filePath), 'utf-8');
    expect(written).toBe('new content');
  });

  it('应自动创建不存在的父目录', async () => {
    const result = await tool.execute(
      { path: 'deep/nested/dir/file.txt', content: 'nested content' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(workDir, 'deep/nested/dir/file.txt'))).toBe(true);
    const written = fs.readFileSync(path.join(workDir, 'deep/nested/dir/file.txt'), 'utf-8');
    expect(written).toBe('nested content');
  });

  it('应在路径越界时返回错误', async () => {
    const outsidePath = path.join(os.tmpdir(), 'outside-write.txt');

    const result = await tool.execute(
      { path: outsidePath, content: 'should fail' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');
    expect(fs.existsSync(outsidePath)).toBe(false);
  });

  it('应在使用 .. 逃逸时返回路径越界错误', async () => {
    const result = await tool.execute(
      { path: '../../../etc/crab-test-escape.txt', content: 'escape' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('路径越界');
  });

  it('应在 path 参数为空时返回错误', async () => {
    const result = await tool.execute({ path: '', content: 'content' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('path 参数不能为空');
  });

  it('应在 content 参数为 undefined 时返回错误', async () => {
    const result = await tool.execute({ path: 'file.txt', content: undefined }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('content 参数不能为空');
  });

  it('应在 content 参数为 null 时返回错误', async () => {
    const result = await tool.execute({ path: 'file.txt', content: null }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('content 参数不能为空');
  });

  it('应正确报告写入的字节数', async () => {
    const content = 'Hello, World!';
    const result = await tool.execute({ path: 'bytes.txt', content }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain(`${Buffer.byteLength(content, 'utf-8')} 字节`);
  });

  it('应支持多行内容写入', async () => {
    const content = 'line1\nline2\nline3\nline4';
    const result = await tool.execute({ path: 'multiline.txt', content }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toContain('4 行');

    const written = fs.readFileSync(path.join(workDir, 'multiline.txt'), 'utf-8');
    expect(written).toBe(content);
  });
});
