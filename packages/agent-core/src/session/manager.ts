import * as fs from 'fs';
import * as path from 'path';
import type { Session, SessionMeta, Message } from '@crab-science/shared';
import {
  SESSIONS_DIR,
  generateId,
  expandTilde,
  nowISO,
  truncateOutput,
} from '@crab-science/shared';
import type { CreateSessionOptions } from './types.js';

/**
 * Session 管理器
 * 负责创建、加载、保存、列出、删除 Session
 * Session 全量 JSON 序列化到 ~/.crab-science/sessions/{id}.json
 */
export class SessionManager {
  private sessionsDir: string;

  constructor(sessionsDir?: string) {
    this.sessionsDir = expandTilde(sessionsDir ?? SESSIONS_DIR);
  }

  /** 确保目录存在 */
  private ensureDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /** 获取 session 文件路径 */
  private getFilePath(id: string): string {
    return path.join(this.sessionsDir, `${id}.json`);
  }

  /**
   * 创建新 Session
   */
  create(options: CreateSessionOptions): Session {
    const now = nowISO();
    const session: Session = {
      id: generateId('sess'),
      messages: [],
      model: options.model,
      provider: options.provider,
      createdAt: now,
      updatedAt: now,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
    };
    this.save(session);
    return session;
  }

  /**
   * 从 JSON 文件加载 Session
   * @returns Session 对象，文件损坏时返回 null
   */
  load(id: string): Session | null {
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const session = JSON.parse(raw) as Session;
      return session;
    } catch (err) {
      console.error(`[SessionManager] 加载 session ${id} 失败: ${err}`);
      return null;
    }
  }

  /**
   * 保存 Session（全量序列化）
   */
  save(session: Session): void {
    this.ensureDir();
    session.updatedAt = nowISO();
    const filePath = this.getFilePath(session.id);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * 列出所有历史 Session
   */
  list(): SessionMeta[] {
    this.ensureDir();
    const files = fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith('.json'));
    const metas: SessionMeta[] = [];

    for (const file of files) {
      const filePath = path.join(this.sessionsDir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const session = JSON.parse(raw) as Session;
        metas.push({
          id: session.id,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          model: session.model,
          provider: session.provider,
          messageCount: session.messages.length,
        });
      } catch {
        // 跳过损坏的文件
      }
    }

    // 按更新时间倒序
    metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return metas;
  }

  /**
   * 追加消息到 Session 并更新时间戳
   */
  addMessage(session: Session, message: Message): void {
    session.messages.push(message);
    session.updatedAt = nowISO();
  }

  /**
   * 更新 Session 的 token 统计
   */
  updateUsage(session: Session, inputTokens: number, outputTokens: number, cost: number): void {
    session.totalInputTokens += inputTokens;
    session.totalOutputTokens += outputTokens;
    session.totalCost += cost;
  }

  /**
   * 删除 Session
   */
  delete(id: string): void {
    const filePath = this.getFilePath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * 获取 Session 摘要（用于显示）
   */
  getSummary(session: Session, maxMessages = 5): string {
    const recentMessages = session.messages.slice(-maxMessages);
    const lines = recentMessages.map((msg) => {
      const role = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Crab' : msg.role;
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return `${role}: ${truncateOutput(content, 3)}`;
    });
    return lines.join('\n');
  }
}
