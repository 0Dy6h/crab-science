# IMRaD 论文模板与写作指南

## 完整论文模板（填空式）

```markdown
# {论文标题：简洁准确，< 20 词，避免缩写}

## Abstract（150-300 词）

**Background:** {领域背景，1-2 句}
**Objective:** {研究目的，1 句}
**Methods:** {方法概述，2-3 句}
**Results:** {主要结果，2-3 句，含统计数据}
**Conclusion:** {结论，1-2 句}

**Keywords:** {5-8 个关键词，用分号分隔}

---

## 1. Introduction

### 1.1 领域背景
{介绍研究领域的重要性和现状，2-3 段}

{field} has emerged as a critical area of research due to {importance}.
Recent studies have demonstrated that {key_findings_from_literature}.
However, {current_limitations}.

### 1.2 研究空白
{指出当前研究的不足}

Despite these advances, {gap} remains poorly understood.
Previous studies have primarily focused on {existing_approaches},
leaving {unexplored_area} largely unaddressed.

### 1.3 研究目的
{陈述本研究的目标和贡献}

In this study, we aimed to {primary_objective}.
Specifically, we sought to:
1. {specific_aim_1}
2. {specific_aim_2}
3. {specific_aim_3}

We hypothesized that {hypothesis}.

---

## 2. Materials and Methods

### 2.1 Study Design
{研究设计描述}

This study employed a {design_type} design.
{描述随机化、盲法等}

### 2.2 Participants / Subjects
{研究对象描述}

**Inclusion criteria:**
- {criterion_1}
- {criterion_2}

**Exclusion criteria:**
- {criterion_1}
- {criterion_2}

**Sample size:** {n} participants were enrolled based on a power analysis
({alpha=0.05, power=0.80, effect_size=0.X}).

### 2.3 Materials / Reagents
{材料与试剂}

| Material | Source | Catalog # |
|----------|--------|-----------|
| {material_1} | {company} | {cat_num} |

### 2.4 Procedures
{实验流程，详细到可复现}

1. {step_1}
2. {step_2}
3. {step_3}

### 2.5 Measurements
{测量指标}

**Primary outcome:** {primary_measure}
**Secondary outcomes:** {secondary_measures}

### 2.6 Statistical Analysis
{统计分析方法}

Data are expressed as mean ± standard deviation (SD) or median
(interquartile range, IQR) as appropriate.
Normality was assessed using the Shapiro-Wilk test.
Comparisons between groups were performed using {statistical_test}.
Correlations were analyzed using {correlation_method}.

All statistical analyses were performed using {software} (version {X.X}).
A two-sided p value < 0.05 was considered statistically significant.

### 2.7 Ethical Considerations
{伦理声明}

This study was approved by the {Institution} Ethics Committee
(approval No. {number}).
Written informed consent was obtained from all participants.

---

## 3. Results

### 3.1 Participant Characteristics
{基线特征}

A total of {n} participants were enrolled in this study.
The baseline characteristics are summarized in Table 1.

**Table 1.** Baseline characteristics of study participants.

| Characteristic | Group A (n={n1}) | Group B (n={n2}) | p value |
|----------------|-------------------|-------------------|---------|
| Age (years)    | {mean ± SD}       | {mean ± SD}       | {p}     |
| Sex (M/F)      | {n}/{n}           | {n}/{n}           | {p}     |
| {variable}     | {value}           | {value}           | {p}     |

### 3.2 Primary Results
{主要结果}

{group_A} showed significantly {higher/lower} {metric} compared to {group_B}
({value_A} ± {SD_A} vs. {value_B} ± {SD_B},
{statistical_test} = {stat}, p = {p_value}).
The effect size was {d/η²} ({effect_size_label}).

**Figure 1.** {Figure caption describing the main result.}

### 3.3 Secondary Results
{次要结果}

Additionally, we found that {secondary_finding}
({statistical_report}).

### 3.4 Correlation Analysis
{相关分析}

Significant correlations were observed between {variable_1} and {variable_2}
(r = {r_value}, p = {p_value}).

**Figure 2.** {Correlation scatter plot caption.}

---

## 4. Discussion

### 4.1 Summary of Findings
{主要发现总结}

Our results demonstrate that {main_finding}.
This finding supports our hypothesis that {hypothesis_restated}.

### 4.2 Comparison with Previous Studies
{与文献对比}

This finding is consistent with {previous_study},
which reported {finding}.
Similarly, {another_study} found {finding}.

In contrast, {opposing_study} reported {different_finding},
possibly due to {reason_for_discrepancy}.

### 4.3 Mechanistic Interpretation
{机制解释}

The observed {effect} may be explained by {mechanism_1}.
{mechanism_detail}.
Additionally, {mechanism_2} could contribute to {effect}.

### 4.4 Strengths and Limitations
{优势与局限}

**Strengths:**
- {strength_1}
- {strength_2}

**Limitations:**
- {limitation_1}
- {limitation_2}

### 4.5 Future Directions
{未来方向}

Future studies should {future_direction_1}.
Additionally, {future_direction_2} warrants further investigation.

### 4.6 Conclusion
{结论}

In conclusion, {conclusion_statement}.
These findings have important implications for {implication}
and suggest that {recommendation}.

---

## Acknowledgments

This work was supported by {funding_source} (grant No. {number}).
We thank {people} for {contribution}.

## Author Contributions

{Author_1}: {contribution}. {Author_2}: {contribution}.
All authors reviewed and approved the final manuscript.

## Conflict of Interest

The authors declare no conflict of interest.

## Data Availability

The data that support the findings of this study are available
from {source} upon reasonable request.

## References

[1] {Reference in chosen format}
[2] {Reference}
...
```

## 写作时间线建议

| 部分 | 建议顺序 | 预计时间 | 说明 |
|------|---------|---------|------|
| Methods | 1 | 2-3 天 | 最客观，最容易写 |
| Results | 2 | 3-5 天 | 数据驱动，需图表 |
| Introduction | 3 | 3-5 天 | 需要文献支撑 |
| Discussion | 4 | 5-7 天 | 最难写，需要深度 |
| Abstract | 5 | 1 天 | 最后写，浓缩全文 |
| Title | 6 | 0.5 天 | 反复修改 |

## 图表编号规范

```
Figure 1: 主要结果图
Figure 2: 次要结果图 / 相关性图
Figure 3: 补充图
...
Table 1: 基线特征表
Table 2: 主要结果表
Table 3: 多变量分析表
...
```

## Supplementary Materials 模板

```markdown
# Supplementary Materials

## Supplementary Methods

### S1. Detailed Protocol
{详细实验步骤}

### S2. Statistical Analysis Details
{补充统计方法}

## Supplementary Results

### S3. Sensitivity Analysis
{敏感性分析结果}

## Supplementary Tables

**Table S1.** {Description}
**Table S2.** {Description}

## Supplementary Figures

**Figure S1.** {Description}
**Figure S2.** {Description}
```

## Cover Letter 模板

```
Dear Editor,

We are pleased to submit our manuscript entitled "{Title}" for
consideration as a {Article Type} in {Journal Name}.

In this study, we {one_sentence_summary}.
Our key findings include:
1. {finding_1}
2. {finding_2}

This work is significant because {significance}.
To our knowledge, this is the first study to {novelty}.

This manuscript has not been published previously and is not
under consideration for publication elsewhere. All authors have
read and approved the final manuscript.

Suggested reviewers:
1. {Name}, {Institution}, {email}
2. {Name}, {Institution}, {email}

We declare no conflicts of interest.

Sincerely,
{Corresponding Author}
{Institution}
{Email}
```

## Response to Reviewers 模板

```
We thank the reviewers for their thoughtful comments.
Our point-by-point responses are below.

Reviewer 1:

Comment 1: {original comment}
Response: We thank the reviewer for this insightful comment.
We have {action_taken}. Please see {section/figure} in the
revised manuscript (page {X}, line {Y}).

Comment 2: {original comment}
Response: {detailed_response}

[Changes in manuscript]:
- Page {X}, line {Y}: {description of change}
- Figure {N}: {description of change}
```
