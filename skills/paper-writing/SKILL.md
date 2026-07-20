---
name: paper-writing
description: 论文撰写辅助技能，提供 IMRaD 结构模板、各部分撰写指南、LaTeX 格式建议和引用管理方法
version: 1
---

# Paper Writing Skill

## 概述

本技能指导你辅助科研论文撰写，包括：
- IMRaD 结构模板
- 各部分撰写指南
- LaTeX 格式建议
- 引用格式化方法

## IMRaD 结构模板

### 标准论文结构

```
1. Title（标题）
2. Abstract（摘要）
3. Keywords（关键词）
4. Introduction（引言）
5. Methods / Materials and Methods（方法）
6. Results（结果）
7. Discussion（讨论）
8. Conclusion（结论）
9. Acknowledgments（致谢）
10. References（参考文献）
```

### 各部分撰写指南

#### Abstract（摘要，150-300 词）

```
结构：背景 → 目的 → 方法 → 结果 → 结论

模板：
[背景] {field} 面临 {problem} 的挑战。
[目的] 本研究旨在 {objective}。
[方法] 我们采用 {method} 对 {subject} 进行了 {procedure}。
[结果] 结果显示 {main_finding}（{statistic}, p < {p_value}）。
[结论] 这些发现表明 {implication}，为 {future_direction} 提供了依据。
```

#### Introduction（引言）

```
结构：漏斗式（宽 → 窄 → 具体）

1. 领域背景（1-2 段）
   - 介绍研究领域的重要性和现状

2. 研究空白（1 段）
   - "However, {gap} remains poorly understood."
   - 指出当前研究的不足

3. 研究目的（1 段）
   - "In this study, we aimed to {objective}."
   - 简述方法和预期贡献
```

#### Methods（方法）

```
结构：详细到可复现

1. Study Design / 研究设计
2. Participants / Subjects / 样本
3. Materials / 试剂与材料
4. Procedures / 实验流程
5. Statistical Analysis / 统计分析
   - "Data are expressed as mean ± SD."
   - "Comparisons were performed using {test}."
   - "P < 0.05 was considered statistically significant."
```

#### Results（结果）

```
原则：只陈述结果，不解释

1. 按逻辑顺序组织（与方法对应）
2. 每个结果配图表
3. 统计数据格式：
   - "The {group} showed significantly higher {metric} compared to {control}
     ({value} ± {sd} vs. {value} ± {sd}, p = {p_value})."
4. 图表引用：
   - "(Figure 1A)" / "(Table 2)"
```

#### Discussion（讨论）

```
结构：倒漏斗式（具体 → 宽）

1. 主要发现总结（1 段）
   - "Our results demonstrate that {finding}."

2. 与文献比较（2-3 段）
   - "This finding is consistent with {previous_study}, which reported {finding}."
   - "In contrast, {other_study} found {different_finding}, possibly due to {reason}."

3. 机制解释（1-2 段）

4. 局限性（1 段）
   - "Several limitations should be noted. First, {limitation_1}. Second, {limitation_2}."

5. 未来方向与结论（1 段）
   - "Future studies should {direction}."
   - "In conclusion, {conclusion}."
```

## LaTeX 格式建议

### 基本模板

```latex
\documentclass[12pt, a4paper]{article}

\usepackage[utf8]{inputenc}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{amsmath, amssymb}
\usepackage[style=apa]{biblatex}
\addbibresource{references.bib}

\title{Paper Title}
\author{Author Name}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Abstract text here...
\end{abstract}

\section{Introduction}
Introduction text...

\section{Methods}
Methods text...

\section{Results}
Results text...

\section{Discussion}
Discussion text...

\section{Conclusion}
Conclusion text...

\printbibliography

\end{document}
```

### 图表格式

```latex
% 图片
\begin{figure}[htbp]
  \centering
  \includegraphics[width=0.8\textwidth]{figure1.png}
  \caption{Caption text describing the figure.}
  \label{fig:figure1}
\end{figure}

% 表格
\begin{table}[htbp]
  \centering
  \caption{Caption text describing the table.}
  \label{tab:table1}
  \begin{tabular}{lcc}
    \toprule
    Group & Metric A & Metric B \\
    \midrule
    Control & 10.5 ± 2.1 & 15.3 ± 3.2 \\
    Treatment & 20.1 ± 3.5 & 25.7 ± 4.1 \\
    \bottomrule
  \end{tabular}
\end{table}
```

## 引用管理

### BibTeX 格式

```bibtex
@article{author2024title,
  title={Paper Title},
  author={Author, A. and Author, B.},
  journal={Journal Name},
  volume={10},
  number={2},
  pages={100--115},
  year={2024},
  publisher={Publisher}
}

@book{author2023book,
  title={Book Title},
  author={Author, C.},
  year={2023},
  publisher={Publisher Name}
}
```

### 引用格式

- **APA**: Author, A. (2024). Title. *Journal*, *10*(2), 100-115.
- **Nature**: Author, A. *Journal* **10**, 100-115 (2024).
- **Vancouver**: Author A. Title. Journal. 2024;10(2):100-115.

### 文中引用

- 单作者: (Smith, 2024) or Smith (2024)
- 双作者: (Smith & Jones, 2024) or Smith and Jones (2024)
- 三作者以上: (Smith et al., 2024) or Smith et al. (2024)

## 撰写检查清单

- [ ] 标题简洁准确（< 20 词）
- [ ] 摘要包含所有关键要素
- [ ] 引言有明确的研究空白
- [ ] 方法可复现
- [ ] 结果有统计数据支持
- [ ] 讨论与文献对比
- [ ] 局限性已说明
- [ ] 参考文献格式统一
- [ ] 图表有标题和标注
- [ ] 全文语法检查

## 注意事项

1. 学术写作使用正式语体，避免口语化
2. 被动语态在方法部分常用，但可混合使用主动语态
3. 数据报告遵循"数字 + 单位 ± 标准差"格式
4. 首次出现的缩写需全称
5. 所有引用的文献必须出现在参考文献列表中
