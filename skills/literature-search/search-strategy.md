# 文献检索策略指南

## 检索策略设计流程

### Step 1: PICO 框架明确检索需求

```
P (Population/Problem): 研究对象/问题
I (Intervention): 干预措施/暴露因素
C (Comparison): 对照
O (Outcome): 结局指标

示例：
P: CRISPR-Cas9 基因编辑
I: 脱靶效应检测方法
C: 不同检测方法比较
O: 检测灵敏度和特异性
```

### Step 2: 关键词扩展

#### 同义词扩展表

| 概念 | 主要词 | 同义词 | 缩写 | MeSH 词 |
|------|--------|--------|------|---------|
| CRISPR | CRISPR | clustered regularly interspaced short palindromic repeats | CRISPR-Cas9 | CRISPR-Cas Systems |
| 脱靶 | off-target | off-target effects, unintended edits | OTE | — |
| 检测 | detection | identification, evaluation, assessment | — | — |

#### 布尔逻辑组合

```
("CRISPR" OR "CRISPR-Cas9" OR "clustered regularly interspaced")
AND
("off-target" OR "off target" OR "unintended")
AND
("detection" OR "identification" OR "evaluation")
```

### Step 3: 数据库选择策略

| 数据库 | 适用领域 | 检索特点 | 优先级 |
|--------|---------|---------|--------|
| Semantic Scholar | 全领域 | AI 增强，引用网络 | ★★★ |
| arXiv | 物理/CS/数学 | 预印本，最新研究 | ★★★ |
| PubMed | 生物医学 | MeSH 词，临床研究 | ★★★ |
| Google Scholar | 全领域 | 覆盖广，灰色文献 | ★★ |
| Web of Science | 全领域 | 引文索引，影响因子 | ★★ |
| IEEE Xplore | 工程/CS | 会议论文 | ★★ |

### Step 4: 检索式构建

#### Semantic Scholar
```
query: "CRISPR off-target detection"
fields: title,authors,year,abstract,citationCount,url
limit: 20
```

#### arXiv
```
search_query: all:CRISPR AND all:off-target AND all:detection
sortBy: relevance
max_results: 20
```

#### PubMed
```
esearch: ("CRISPR-Cas Systems"[MeSH] OR "CRISPR"[Title/Abstract])
AND ("off-target"[Title/Abstract])
AND ("detection"[Title/Abstract])
retmax: 20
```

### Step 5: 筛选与去重流程

```
检索结果（N篇）
  ↓
标题筛选 → 排除不相关（排除 ~50%）
  ↓
摘要筛选 → 排除不符合标准（排除 ~30%）
  ↓
全文筛选 → 排除方法不适用（排除 ~10%）
  ↓
最终纳入（~10% of N）
  ↓
去重（使用 dedup.py）
  ↓
质量评估
  ↓
数据提取
```

## 检索策略优化

### 查全率 vs 查准率

```
查全率 (Recall) = 相关文献检出数 / 相关文献总数
查准率 (Precision) = 相关文献检出数 / 检出文献总数

策略：
- 需要高查全率（系统综述）→ 放宽检索式，增加同义词
- 需要高查准率（快速调研）→ 收紧检索式，限定字段
```

### 检索式调试

1. **检出太多**（>500篇）：
   - 增加 AND 条件
   - 限定到 Title 字段
   - 增加年份限制

2. **检出太少**（<10篇）：
   - 减少 AND 条件
   - 增加同义词（OR）
   - 使用更宽泛的关键词
   - 检查拼写

### 引文追溯法

1. **前向追溯**：查找引用了关键文献的后续研究
   - 在 Google Scholar 中点击"被引用次数"
   - 在 Semantic Scholar 中查看 Citations

2. **后向追溯**：查找关键文献引用的前序研究
   - 阅读关键文献的 References
   - 优先关注被多篇文献共同引用的论文

## 时间范围策略

| 研究类型 | 推荐时间范围 | 原因 |
|---------|-------------|------|
| 最新进展 | 近 2-3 年 | 追踪前沿 |
| 系统综述 | 近 10 年 | 全面覆盖 |
| 经典理论 | 不限时间 | 追溯起源 |
| 快速调研 | 近 5 年 | 平衡全面与效率 |

## 检索记录模板

```markdown
# 文献检索记录

## 检索 1
- 日期：{date}
- 数据库：{database}
- 检索式：{query}
- 结果数：{count}
- 备注：{observations}

## 检索 2
- 日期：{date}
- 数据库：{database}
- 检索式：{query}
- 结果数：{count}
- 备注：{observations}

## 汇总
- 总检出：{total}
- 去重后：{unique}
- 筛选后：{included}
```
