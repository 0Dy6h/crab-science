---
name: data-analysis
description: 科研数据分析技能，涵盖统计检验方法选择、Python 分析脚本模板、数据可视化和数据清洗流程
version: 1
---

# Data Analysis Skill

## 概述

本技能指导你完成科研数据分析任务，包括：
- 数据清洗与预处理
- 统计检验方法选择
- Python 分析脚本模板
- 数据可视化（matplotlib/seaborn）

## 数据清洗流程

### 1. 读取与检查数据

```python
import pandas as pd
import numpy as np

# 读取 CSV
df = pd.read_csv('data.csv')

# 基本信息检查
print(f"形状: {df.shape}")
print(f"列: {df.columns.tolist()}")
print(f"数据类型:\n{df.dtypes}")
print(f"缺失值:\n{df.isnull().sum()}")
print(f"描述统计:\n{df.describe()}")
```

### 2. 缺失值处理

```python
# 数值列：用中位数填充
num_cols = df.select_dtypes(include=[np.number]).columns
df[num_cols] = df[num_cols].fillna(df[num_cols].median())

# 分类列：用众数填充
cat_cols = df.select_dtypes(include=['object']).columns
df[cat_cols] = df[cat_cols].fillna(df[cat_cols].mode().iloc[0])

# 或删除缺失值过多的行
df = df.dropna(thresh=len(df.columns) * 0.7)
```

### 3. 异常值检测

```python
# IQR 方法
def detect_outliers_iqr(df, col):
    Q1 = df[col].quantile(0.25)
    Q3 = df[col].quantile(0.75)
    IQR = Q3 - Q1
    lower = Q1 - 1.5 * IQR
    upper = Q3 + 1.5 * IQR
    return df[(df[col] < lower) | (df[col] > upper)]

# Z-score 方法
from scipy import stats
z_scores = np.abs(stats.zscore(df[num_cols]))
outliers = (z_scores > 3).any(axis=1)
```

## 统计检验方法选择

### 决策树

```
比较组数？
├── 2 组
│   ├── 独立样本 → 独立 t 检验 (scipy.stats.ttest_ind)
│   ├── 配对样本 → 配对 t 检验 (scipy.stats.ttest_rel)
│   └── 非正态 → Mann-Whitney U (scipy.stats.mannwhitneyu)
├── >2 组
│   ├── 独立样本 → 单因素 ANOVA (scipy.stats.f_oneway)
│   ├── 重复测量 → 重复测量 ANOVA
│   └── 非正态 → Kruskal-Wallis (scipy.stats.kruskal)
└── 关联分析
    ├── 线性 → Pearson 相关 (scipy.stats.pearsonr)
    ├── 非线性 → Spearman 相关 (scipy.stats.spearmanr)
    └── 预测 → 线性回归 (sklearn.linear_model.LinearRegression)
```

### 正态性检验

```python
from scipy import stats

# Shapiro-Wilk 检验（样本量 < 5000）
stat, p = stats.shapiro(data)
if p > 0.05:
    print("数据符合正态分布")
else:
    print("数据不符合正态分布")
```

### 常用检验模板

```python
from scipy import stats

# 独立 t 检验
stat, p = stats.ttest_ind(group1, group2)
print(f"t = {stat:.4f}, p = {p:.4f}")

# 单因素 ANOVA
stat, p = stats.f_oneway(group1, group2, group3)
print(f"F = {stat:.4f}, p = {p:.4f}")

# 卡方检验
chi2, p, dof, expected = stats.chi2_contingency(contingency_table)
print(f"chi2 = {chi2:.4f}, p = {p:.4f}")

# 线性回归
from sklearn.linear_model import LinearRegression
model = LinearRegression()
model.fit(X, y)
print(f"R² = {model.score(X, y):.4f}")
print(f"系数: {model.coef_}")
print(f"截距: {model.intercept_}")
```

## 数据可视化

### 科研论文风格（matplotlib + seaborn）

```python
import matplotlib.pyplot as plt
import seaborn as sns

# 设置科研风格
plt.rcParams.update({
    'font.size': 12,
    'font.family': 'serif',
    'figure.dpi': 300,
    'savefig.dpi': 300,
    'axes.linewidth': 1.2,
    'figure.figsize': (8, 6),
})
sns.set_style('whitegrid')
sns.set_palette('Set2')

# 箱线图 + 散点
fig, ax = plt.subplots(figsize=(8, 6))
sns.boxplot(data=df, x='group', y='value', ax=ax)
sns.stripplot(data=df, x='group', y='value', color='black', alpha=0.5, ax=ax)
ax.set_xlabel('Treatment Group')
ax.set_ylabel('Measurement Value')
ax.set_title('Effect of Treatment on Measurement')
plt.tight_layout()
plt.savefig('figure1.png', bbox_inches='tight')
plt.close()

# 相关性热图
fig, ax = plt.subplots(figsize=(10, 8))
corr = df[num_cols].corr()
sns.heatmap(corr, annot=True, fmt='.2f', cmap='coolwarm', center=0, ax=ax)
plt.title('Correlation Matrix')
plt.tight_layout()
plt.savefig('correlation.png', bbox_inches='tight')
plt.close()
```

## 完整分析流程

```python
#!/usr/bin/env python3
"""数据分析模板脚本"""
import pandas as pd
import numpy as np
from scipy import stats
import matplotlib.pyplot as plt
import seaborn as sns

# 1. 加载数据
df = pd.read_csv('data.csv')

# 2. 数据清洗
print("=== 数据概览 ===")
print(df.describe())

# 3. 分组统计
print("\n=== 分组统计 ===")
print(df.groupby('group')['value'].agg(['mean', 'std', 'count']))

# 4. 统计检验
groups = [g['value'].values for _, g in df.groupby('group')]
stat, p = stats.f_oneway(*groups)
print(f"\n=== ANOVA ===")
print(f"F = {stat:.4f}, p = {p:.4f}")

# 5. 可视化
fig, ax = plt.subplots(figsize=(8, 6))
sns.boxplot(data=df, x='group', y='value', ax=ax)
plt.savefig('analysis.png', dpi=300, bbox_inches='tight')
print("\n图表已保存: analysis.png")
```

## 注意事项

1. 分析前务必检查数据类型和缺失值
2. 选择统计方法前先检验正态性
3. p 值报告时注明检验方法
4. 图表使用 300 DPI 保存以保证论文质量
5. 结果保存到文件（CSV/JSON/PNG）供后续使用
