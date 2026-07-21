/** 检查 better-sqlite3 是否可用（原生模块可能未编译） */
let sqliteAvailable: boolean | null = null;

export function isSqliteAvailable(): boolean {
  if (sqliteAvailable !== null) return sqliteAvailable;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.close();
    sqliteAvailable = true;
  } catch {
    sqliteAvailable = false;
  }
  return sqliteAvailable;
}

/** 数据库测试的跳过条件 */
export const skipIfNoSqlite = isSqliteAvailable() ? {} : { skip: true };
