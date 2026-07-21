import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_BASH_TIMEOUT_MS,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  CONFIG_DIR,
  SESSIONS_DIR,
  GLOBAL_SKILLS_DIR,
  PROJECT_SKILLS_DIR,
  MAX_SYSTEM_PROMPT_TOKENS,
  MAX_FILE_LINES,
  MAX_TOOL_OUTPUT_LINES,
  GLOB_PREVIEW_LINES,
  ENV_KEY_PREFIX,
  VERSION,
} from '@crab-science/shared';

describe('常量值验证', () => {
  it('DEFAULT_MAX_ITERATIONS 应为 50', () => {
    expect(DEFAULT_MAX_ITERATIONS).toBe(50);
  });

  it('DEFAULT_BASH_TIMEOUT_MS 应为 30000', () => {
    expect(DEFAULT_BASH_TIMEOUT_MS).toBe(30000);
  });

  it('DEFAULT_PROVIDER 应为 anthropic', () => {
    expect(DEFAULT_PROVIDER).toBe('anthropic');
  });

  it('DEFAULT_MODEL 应为 claude-sonnet-4-20250514', () => {
    expect(DEFAULT_MODEL).toBe('claude-sonnet-4-20250514');
  });

  it('DEEPSEEK_BASE_URL 应为 https://api.deepseek.com', () => {
    expect(DEEPSEEK_BASE_URL).toBe('https://api.deepseek.com');
  });

  it('DEEPSEEK_DEFAULT_MODEL 应为 deepseek-chat', () => {
    expect(DEEPSEEK_DEFAULT_MODEL).toBe('deepseek-chat');
  });

  it('CONFIG_DIR 应为 ~/.crab-science', () => {
    expect(CONFIG_DIR).toBe('~/.crab-science');
  });

  it('SESSIONS_DIR 应为 ~/.crab-science/sessions', () => {
    expect(SESSIONS_DIR).toBe('~/.crab-science/sessions');
  });

  it('GLOBAL_SKILLS_DIR 应为 ~/.crab-science/skills', () => {
    expect(GLOBAL_SKILLS_DIR).toBe('~/.crab-science/skills');
  });

  it('PROJECT_SKILLS_DIR 应为 skills', () => {
    expect(PROJECT_SKILLS_DIR).toBe('skills');
  });

  it('MAX_SYSTEM_PROMPT_TOKENS 应为 1500', () => {
    expect(MAX_SYSTEM_PROMPT_TOKENS).toBe(1500);
  });

  it('MAX_FILE_LINES 应为 500', () => {
    expect(MAX_FILE_LINES).toBe(500);
  });

  it('MAX_TOOL_OUTPUT_LINES 应为 100', () => {
    expect(MAX_TOOL_OUTPUT_LINES).toBe(100);
  });

  it('GLOB_PREVIEW_LINES 应为 10', () => {
    expect(GLOB_PREVIEW_LINES).toBe(10);
  });

  it('ENV_KEY_PREFIX 应为 CRAB_SCIENCE', () => {
    expect(ENV_KEY_PREFIX).toBe('CRAB_SCIENCE');
  });

  it('VERSION 应为 0.3.0', () => {
    expect(VERSION).toBe('0.3.0');
  });
});
