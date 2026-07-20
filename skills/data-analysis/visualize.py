#!/usr/bin/env python3
"""
科研数据可视化工具

生成科研论文级别的图表：
1. 箱线图 + 散点
2. 柱状图 + 误差线
3. 相关性热图
4. 散点图 + 回归线
5. 生存曲线
6. 小提琴图
7. 多面板组合图

用法:
    python3 visualize.py --type boxplot --data data.csv --x group --y value --output fig1.png
    python3 visualize.py --type barplot --data data.csv --x group --y value --output fig2.png
    python3 visualize.py --type heatmap --data data.csv --output fig3.png
    python3 visualize.py --type scatter --data data.csv --x var1 --y var2 --output fig4.png
"""

import argparse
import sys
from typing import Optional, List, Dict

try:
    import pandas as pd
    import numpy as np
    import matplotlib
    matplotlib.use('Agg')  # 非交互式后端
    import matplotlib.pyplot as plt
    import seaborn as sns
except ImportError as e:
    print(f'缺少依赖库: {e}', file=sys.stderr)
    print('请安装: pip install pandas numpy matplotlib seaborn', file=sys.stderr)
    sys.exit(1)


# ============================================================
科研论文风格设置
# ============================================================

def set_paper_style():
    """设置科研论文级别的绘图风格"""
    plt.rcParams.update({
        # 字体
        'font.size': 12,
        'font.family': 'serif',
        'font.serif': ['Times New Roman', 'DejaVu Serif'],
        # 图像
        'figure.dpi': 300,
        'savefig.dpi': 300,
        'figure.figsize': (8, 6),
        'figure.autolayout': False,
        # 坐标轴
        'axes.linewidth': 1.2,
        'axes.labelsize': 14,
        'axes.titlesize': 14,
        'axes.titleweight': 'bold',
        # 刻度
        'xtick.labelsize': 11,
        'ytick.labelsize': 11,
        'xtick.major.width': 1.0,
        'ytick.major.width': 1.0,
        'xtick.direction': 'out',
        'ytick.direction': 'out',
        # 图例
        'legend.fontsize': 10,
        'legend.frameon': True,
        'legend.framealpha': 0.9,
        'legend.edgecolor': '0.8',
        # 线条
        'lines.linewidth': 1.5,
        'lines.markersize': 6,
        # 网格
        'axes.grid': False,
        'grid.alpha': 0.3,
    })
    sns.set_style('white')
    sns.set_palette('Set2')


# ============================================================
# 图表生成函数
# ============================================================

def plot_boxplot(df, x_col, y_col, output, title=None, hue=None):
    """箱线图 + 散点"""
    fig, ax = plt.subplots(figsize=(8, 6))
    
    # 箱线图
    sns.boxplot(data=df, x=x_col, y=y_col, hue=hue, ax=ax,
                width=0.6, linewidth=1.2, fliersize=0)
    
    # 散点（jitter）
    sns.stripplot(data=df, x=x_col, y=y_col, hue=hue, ax=ax,
                  color='black', alpha=0.5, size=4, jitter=True,
                  dodge=True if hue else False)
    
    ax.set_xlabel(x_col.replace('_', ' ').title())
    ax.set_ylabel(y_col.replace('_', ' ').title())
    if title:
        ax.set_title(title)
    
    # 统计标注（可选）
    groups = df[x_col].unique()
    if len(groups) == 2:
        _add_significance_bar(ax, df, x_col, y_col, groups)
    
    plt.tight_layout()
    plt.savefig(output, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f'图表已保存: {output}')


def plot_barplot(df, x_col, y_col, output, title=None, hue=None, errorbar='se'):
    """柱状图 + 误差线"""
    fig, ax = plt.subplots(figsize=(8, 6))
    
    sns.barplot(data=df, x=x_col, y=y_col, hue=hue, ax=ax,
                errorbar=errorbar, capsize=0.1, linewidth=1.2,
                edgecolor='black')
    
    ax.set_xlabel(x_col.replace('_', ' ').title())
    ax.set_ylabel(y_col.replace('_', ' ').title())
    if title:
        ax.set_title(title)
    
    plt.tight_layout()
    plt.savefig(output, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f'图表已保存: {output}')


def plot_heatmap(df, output, title=None, cols=None, method='pearson'):
    """相关性热图"""
    # 选择数值列
    if cols:
        data = df[cols].select_dtypes(include=[np.number])
    else:
        data = df.select_dtypes(include=[np.number])
    
    # 计算相关矩阵
    if method == 'spearman':
        corr = data.corr(method='spearman')
    else:
        corr = data.corr(method='pearson')
    
    # 绘图
    fig, ax = plt.subplots(figsize=(10, 8))
    
    mask = np.triu(np.ones_like(corr, dtype=bool), k=1)
    
    sns.heatmap(corr, mask=mask, annot=True, fmt='.2f',
                cmap='RdBu_r', center=0, vmin=-1, vmax=1,
                square=True, linewidths=0.5, ax=ax,
                cbar_kws={'label': f'{method.title()} Correlation'})
    
    if title:
        ax.set_title(title)
    
    plt.tight_layout()
    plt.savefig(output, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f'图表已保存: {output}')


def plot_scatter(df, x_col, y_col, output, title=None, hue=None, regression=False):
    """散点图 + 可选回归线"""
    fig, ax = plt.subplots(figsize=(8, 6))
    
    if hue:
        sns.scatterplot(data=df, x=x_col, y=y_col, hue=hue, ax=ax,
                        s=60, alpha=0.7, edgecolor='black', linewidth=0.5)
    else:
        sns.scatterplot(data=df, x=x_col, y=y_col, ax=ax,
                        s=60, alpha=0.7, edgecolor='black', linewidth=0.5,
                        color='#4C72B0')
    
    # 回归线
    if regression:
        if hue:
            for group in df[hue].unique():
                subset = df[df[hue] == group]
                _add_regression_line(ax, subset[x_col], subset[y_col])
        else:
            _add_regression_line(ax, df[x_col], df[y_col])
    
    ax.set_xlabel(x_col.replace('_', ' ').title())
    ax.set_ylabel(y_col.replace('_', ' ').title())
    if title:
        ax.set_title(title)
    
    plt.tight_layout()
    plt.savefig(output, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f'图表已保存: {output}')


def plot_violin(df, x_col, y_col, output, title=None, hue=None):
    """小提琴图"""
    fig, ax = plt.subplots(figsize=(8, 6))
    
    sns.violinplot(data=df, x=x_col, y=y_col, hue=hue, ax=ax,
                   inner='box', linewidth=1.2, cut=0)
    
    ax.set_xlabel(x_col.replace('_', ' ').title())
    ax.set_ylabel(y_col.replace('_', ' ').title())
    if title:
        ax.set_title(title)
    
    plt.tight_layout()
    plt.savefig(output, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f'图表已保存: {output}')


def plot_pairplot(df, output, cols=None, hue=None):
    """多变量散点矩阵"""
    if cols:
        data = df[cols + ([hue] if hue else [])]
    else:
        data = df.select_dtypes(include=[np.number])
        if hue:
            data[hue] = df[hue]
    
    g = sns.pairplot(data, hue=hue, diag_kind='kde',
                     plot_kws={'alpha': 0.6, 's': 30, 'edgecolor': 'k'},
                     height=2.5)
    
    g.fig.suptitle('', y=1.02)
    g.savefig(output, dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f'图表已保存: {output}')


# ============================================================
# 辅助函数
# ============================================================

def _add_regression_line(ax, x, y):
    """添加回归线和相关系数"""
    from scipy import stats
    
    x_clean = pd.to_numeric(x, errors='coerce')
    y_clean = pd.to_numeric(y, errors='coerce')
    mask = x_clean.notna() & y_clean.notna()
    x_vals = x_clean[mask].values
    y_vals = y_clean[mask].values
    
    if len(x_vals) < 3:
        return
    
    slope, intercept, r, p, se = stats.linregress(x_vals, y_vals)
    
    x_line = np.linspace(x_vals.min(), x_vals.max(), 100)
    y_line = slope * x_line + intercept
    ax.plot(x_line, y_line, 'r--', alpha=0.8, linewidth=1.5)
    
    # 标注 R² 和 p 值
    label = f'R² = {r**2:.3f}, p = {p:.4f}' if p >= 0.001 else f'R² = {r**2:.3f}, p < .001'
    ax.text(0.05, 0.95, label, transform=ax.transAxes,
            fontsize=10, verticalalignment='top',
            bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))


def _add_significance_bar(ax, df, x_col, y_col, groups):
    """添加统计显著性标注"""
    from scipy import stats
    
    g1 = pd.to_numeric(df[df[x_col] == groups[0]][y_col], errors='coerce').dropna()
    g2 = pd.to_numeric(df[df[x_col] == groups[1]][y_col], errors='coerce').dropna()
    
    if len(g1) < 3 or len(g2) < 3:
        return
    
    stat, p = stats.ttest_ind(g1, g2)
    
    # 显著性符号
    if p < 0.001:
        sig = '***'
    elif p < 0.01:
        sig = '**'
    elif p < 0.05:
        sig = '*'
    else:
        sig = 'ns'
    
    # 绘制标注线
    y_max = max(g1.max(), g2.max())
    y_step = (ax.get_ylim()[1] - ax.get_ylim()[0]) * 0.08
    y_bar = y_max + y_step
    
    x1, x2 = 0, 1
    ax.plot([x1, x1, x2, x2], [y_bar, y_bar + y_step/2, y_bar + y_step/2, y_bar],
            'k-', linewidth=1)
    ax.text((x1 + x2) / 2, y_bar + y_step/2, sig,
            ha='center', va='bottom', fontsize=14)


# ============================================================
# 主函数
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description='科研数据可视化工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument('--type', '-t',
                        choices=['boxplot', 'barplot', 'heatmap', 'scatter',
                                 'violin', 'pairplot'],
                        required=True,
                        help='图表类型')
    parser.add_argument('--data', '-d', required=True, help='数据文件路径 (CSV)')
    parser.add_argument('--x', help='X 轴列名')
    parser.add_argument('--y', help='Y 轴列名')
    parser.add_argument('--hue', help='分组列名（颜色映射）')
    parser.add_argument('--cols', nargs='+', help='选定的列（heatmap/pairplot）')
    parser.add_argument('--title', help='图表标题')
    parser.add_argument('--output', '-o', required=True, help='输出文件路径')
    parser.add_argument('--regression', action='store_true', help='添加回归线（scatter）')
    parser.add_argument('--errorbar', default='se',
                        choices=['se', 'sd', 'ci', 'none'],
                        help='误差线类型（barplot）')
    parser.add_argument('--method', default='pearson',
                        choices=['pearson', 'spearman'],
                        help='相关方法（heatmap）')

    args = parser.parse_args()

    # 设置风格
    set_paper_style()

    # 读取数据
    try:
        df = pd.read_csv(args.data)
    except FileNotFoundError:
        print(f'文件不存在: {args.data}', file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f'读取数据失败: {e}', file=sys.stderr)
        sys.exit(1)

    print(f'数据: {df.shape[0]} 行 × {df.shape[1]} 列', file=sys.stderr)
    print(f'列: {", ".join(df.columns)}', file=sys.stderr)

    # 生成图表
    try:
        if args.type == 'boxplot':
            if not args.x or not args.y:
                parser.error('boxplot 需要 --x 和 --y 参数')
            plot_boxplot(df, args.x, args.y, args.output, args.title, args.hue)

        elif args.type == 'barplot':
            if not args.x or not args.y:
                parser.error('barplot 需要 --x 和 --y 参数')
            plot_barplot(df, args.x, args.y, args.output, args.title, args.hue, args.errorbar)

        elif args.type == 'heatmap':
            plot_heatmap(df, args.output, args.title, args.cols, args.method)

        elif args.type == 'scatter':
            if not args.x or not args.y:
                parser.error('scatter 需要 --x 和 --y 参数')
            plot_scatter(df, args.x, args.y, args.output, args.title, args.hue, args.regression)

        elif args.type == 'violin':
            if not args.x or not args.y:
                parser.error('violin 需要 --x 和 --y 参数')
            plot_violin(df, args.x, args.y, args.output, args.title, args.hue)

        elif args.type == 'pairplot':
            plot_pairplot(df, args.output, args.cols, args.hue)

    except Exception as e:
        print(f'绘图失败: {e}', file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
