# 统计方法选择指南

## 方法选择决策树

### 1. 确定研究问题类型

```
研究问题？
├── 比较（组间差异）
│   ├── 2 组比较
│   │   ├── 独立样本 → 独立 t 检验 / Mann-Whitney U
│   │   ├── 配对样本 → 配对 t 检验 / Wilcoxon
│   │   └── 处理前后 → 配对设计
│   ├── >2 组比较
│   │   ├── 独立样本 → 单因素 ANOVA / Kruskal-Wallis
│   │   ├── 重复测量 → 重复测量 ANOVA / Friedman
│   │   └── 两因素 → 两因素 ANOVA / 混合模型
│   └── 多变量比较 → MANOVA
│
├── 关联（变量间关系）
│   ├── 两个变量
│   │   ├── 线性 → Pearson 相关
│   │   ├── 非线性 → Spearman / Kendall
│   │   └── 分类变量 → 卡方 / Fisher 精确
│   ├── 预测 → 线性回归 / 逻辑回归
│   └── 多变量 → 多元回归 / 结构方程
│
├── 分类（组归属）
│   ├── 已知分组 → 判别分析 / 逻辑回归
│   └── 未知分组 → 聚类分析 / 主成分
│
└── 生存（时间到事件）
    ├── 单因素 → Log-rank 检验
    └── 多因素 → Cox 比例风险模型
```

### 2. 检查数据条件

#### 正态性检验

```python
from scipy import stats
import numpy as np

def check_normality(data, alpha=0.05):
    """Shapiro-Wilk 正态性检验（n < 5000）"""
    if len(data) < 3:
        return False, '样本量太小'
    if len(data) > 5000:
        # 使用 Anderson-Darling
        result = stats.anderson(data, dist='norm')
        is_normal = result.statistic < result.critical_values[2]  # 5% 显著性
        return is_normal, f'Anderson-Darling: stat={result.statistic:.4f}'
    
    stat, p = stats.shapiro(data)
    is_normal = p > alpha
    return is_normal, f'Shapiro-Wilk: W={stat:.4f}, p={p:.4f}'
```

#### 方差齐性检验

```python
from scipy import stats

def check_variance_homogeneity(groups, alpha=0.05):
    """Levene 检验方差齐性"""
    stat, p = stats.levene(*groups)
    is_equal = p > alpha
    return is_equal, f'Levene: W={stat:.4f}, p={p:.4f}'
```

### 3. 方法选择矩阵

| 数据条件 | 2组独立 | 2组配对 | >2组独立 | >2组重复 | 相关 |
|---------|---------|---------|---------|---------|------|
| 正态+方差齐 | t检验 | 配对t | ANOVA | 重复测量ANOVA | Pearson |
| 正态+方差不齐 | Welch t | 配对t | Welch ANOVA | 重复测量ANOVA | Pearson |
| 非正态 | Mann-Whitney | Wilcoxon | Kruskal-Wallis | Friedman | Spearman |

## 效应量计算

### Cohen's d（均值差异）

```python
import numpy as np

def cohens_d(group1, group2):
    """计算 Cohen's d 效应量"""
    n1, n2 = len(group1), len(group2)
    m1, m2 = np.mean(group1), np.mean(group2)
    s1, s2 = np.std(group1, ddof=1), np.std(group2, ddof=1)
    
    # 合并标准差
    sp = np.sqrt(((n1-1)*s1**2 + (n2-1)*s2**2) / (n1+n2-2))
    
    d = (m1 - m2) / sp
    return d

# 效应量解释
# |d| < 0.2: 极小
# 0.2 ≤ |d| < 0.5: 小
# 0.5 ≤ |d| < 0.8: 中
# |d| ≥ 0.8: 大
```

### Eta-squared（ANOVA）

```python
def eta_squared_anova(groups):
    """计算 ANOVA 的 eta-squared"""
    all_data = np.concatenate(groups)
    grand_mean = np.mean(all_data)
    
    ss_between = sum(len(g) * (np.mean(g) - grand_mean)**2 for g in groups)
    ss_total = sum((x - grand_mean)**2 for x in all_data)
    
    eta_sq = ss_between / ss_total
    return eta_sq

# 效应量解释
# η² < 0.01: 小
# 0.01 ≤ η² < 0.06: 中
# η² ≥ 0.06: 大
```

### Odds Ratio（分类数据）

```python
def odds_ratio(a, b, c, d):
    """
    计算 Odds Ratio
    a: 暴露+疾病, b: 暴露+无病
    c: 未暴露+疾病, d: 未暴露+无病
    """
    or_val = (a * d) / (b * c)
    # 95% CI
    import math
    se = math.sqrt(1/a + 1/b + 1/c + 1/d)
    ci_lower = math.exp(math.log(or_val) - 1.96 * se)
    ci_upper = math.exp(math.log(or_val) + 1.96 * se)
    return or_val, (ci_lower, ci_upper)
```

## 多重比较校正

### Bonferroni 校正

```python
def bonferroni_correct(p_values, alpha=0.05):
    """Bonferroni 校正"""
    n = len(p_values)
    corrected_alpha = alpha / n
    significant = [p < corrected_alpha for p in p_values]
    return significant, corrected_alpha
```

### FDR (Benjamini-Hochberg)

```python
def fdr_correct(p_values, q=0.05):
    """Benjamini-Hochberg FDR 校正"""
    n = len(p_values)
    sorted_indices = np.argsort(p_values)
    sorted_p = np.array(p_values)[sorted_indices]
    
    significant = [False] * n
    for i in range(n - 1, -1, -1):
        threshold = q * (i + 1) / n
        if sorted_p[i] <= threshold:
            for j in range(i + 1):
                significant[sorted_indices[j]] = True
            break
    
    return significant
```

## 样本量与功效

### 事后功效分析

```python
from scipy import stats
import numpy as np

def post_hoc_power(effect_size, n_per_group, alpha=0.05):
    """计算事后统计功效"""
    # 非中心参数
    ncp = effect_size * np.sqrt(n_per_group / 2)
    
    # 临界值
    z_alpha = stats.norm.ppf(1 - alpha / 2)
    
    # 功效
    power = 1 - stats.norm.cdf(z_alpha - ncp) + stats.norm.cdf(-z_alpha - ncp)
    
    return power
```

## 报告统计结果

### 标准格式

```
描述性统计：
  Mean ± SD: 25.3 ± 4.2
  Median (IQR): 24.0 (21.0-28.0)
  N (%): 45 (60.0%)

t检验：
  t(38) = 2.45, p = .019, d = 0.78
  [t(df) = t值, p = p值, d = 效应量]

ANOVA：
  F(2, 57) = 4.32, p = .018, η² = .13
  [F(组间df, 误差df) = F值, p = p值, η² = 效应量]

卡方检验：
  χ²(1, N = 100) = 5.20, p = .023, OR = 2.45 (95% CI: 1.12-5.36)

相关：
  r(48) = .56, p < .001
  Pearson: r = .56, p < .001, 95% CI [.34, .72]

回归：
  R² = .34, F(3, 46) = 7.89, p < .001
  β = .45, t(46) = 3.21, p = .002
```

### p值报告规范

- p > .05: 不显著（不要写 p = .ns）
- .01 < p < .05: p = .0xx（保留3位小数）
- .001 < p < .01: p = .00x
- p < .001: p < .001（不要写 p = .000）
