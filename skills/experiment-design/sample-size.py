#!/usr/bin/env python3
"""
样本量计算工具

支持以下计算：
1. 两组均值比较（独立样本 t 检验）
2. 多组均值比较（单因素 ANOVA）
3. 配对均值比较（配对 t 检验）
4. 两组比例比较（卡方检验）
5. 生存分析（Log-rank 检验）

用法:
    python3 sample-size.py --type ttest --effect-size 0.5 --alpha 0.05 --power 0.8
    python3 sample-size.py --type anova --f 0.25 --groups 3 --alpha 0.05 --power 0.8
    python3 sample-size.py --type paired --delta 5 --sigma 10 --alpha 0.05 --power 0.8
    python3 sample-size.py --type proportion --p1 0.3 --p2 0.5 --alpha 0.05 --power 0.8
    python3 sample-size.py --type survival --hr 0.5 --survival 0.5 --alpha 0.05 --power 0.8
"""

import argparse
import math
import sys
from scipy import stats


# ============================================================
# Z 值查找
# ============================================================

def z_alpha(alpha: float, two_tailed: bool = True) -> float:
    """计算显著性水平对应的 Z 值"""
    if two_tailed:
        return stats.norm.ppf(1 - alpha / 2)
    return stats.norm.ppf(1 - alpha)


def z_beta(power: float) -> float:
    """计算功效对应的 Z 值"""
    return stats.norm.ppf(power)


# ============================================================
# 样本量计算函数
# ============================================================

def sample_size_ttest(
    effect_size: float,
    alpha: float = 0.05,
    power: float = 0.80,
    groups: int = 2,
) -> dict:
    """
    两组均值比较（独立样本 t 检验）

    参数:
        effect_size: Cohen's d 效应量 (delta / sigma)
        alpha: 显著性水平
        power: 统计功效
        groups: 组数（默认 2）

    返回:
        dict: 每组样本量、总样本量、参数信息
    """
    za = z_alpha(alpha)
    zb = z_beta(power)

    n_per_group = math.ceil(((za + zb) ** 2 * 2) / (effect_size ** 2))

    return {
        'type': '独立样本 t 检验',
        'n_per_group': n_per_group,
        'total_n': n_per_group * groups,
        'effect_size': effect_size,
        'effect_size_label': _effect_size_label(effect_size),
        'alpha': alpha,
        'power': power,
    }


def sample_size_anova(
    f: float,
    groups: int,
    alpha: float = 0.05,
    power: float = 0.80,
) -> dict:
    """
    单因素 ANOVA 样本量计算（基于 Cohen's f 效应量）

    参数:
        f: Cohen's f 效应量
        groups: 组数
        alpha: 显著性水平
        power: 统计功效

    返回:
        dict: 每组样本量、总样本量、参数信息
    """
    za = z_alpha(alpha)
    zb = z_beta(power)

    # 非中心参数 lambda
    lam = (za + zb) ** 2

    # 每组样本量
    n_per_group = math.ceil(lam / (f ** 2))

    # 总自由度修正
    df_between = groups - 1
    n_per_group = max(n_per_group, math.ceil(lam / (f ** 2 * df_between / (groups - 1))))

    return {
        'type': '单因素 ANOVA',
        'n_per_group': n_per_group,
        'total_n': n_per_group * groups,
        'effect_size_f': f,
        'effect_size_label': _effect_size_label_f(f),
        'groups': groups,
        'alpha': alpha,
        'power': power,
    }


def sample_size_paired(
    delta: float,
    sigma: float,
    alpha: float = 0.05,
    power: float = 0.80,
) -> dict:
    """
    配对 t 检验样本量计算

    参数:
        delta: 预期差值（均值差）
        sigma: 差值的标准差
        alpha: 显著性水平
        power: 统计功效

    返回:
        dict: 配对数、参数信息
    """
    za = z_alpha(alpha)
    zb = z_beta(power)

    effect_size = delta / sigma
    n = math.ceil(((za + zb) ** 2) / (effect_size ** 2))

    return {
        'type': '配对 t 检验',
        'n_pairs': n,
        'total_n': n,
        'delta': delta,
        'sigma': sigma,
        'effect_size': round(effect_size, 4),
        'alpha': alpha,
        'power': power,
    }


def sample_size_proportion(
    p1: float,
    p2: float,
    alpha: float = 0.05,
    power: float = 0.80,
) -> dict:
    """
    两组比例比较（卡方检验）样本量计算

    参数:
        p1: 第一组比例
        p2: 第二组比例
        alpha: 显著性水平
        power: 统计功效

    返回:
        dict: 每组样本量、总样本量、参数信息
    """
    za = z_alpha(alpha)
    zb = z_beta(power)

    q1 = 1 - p1
    q2 = 1 - p2
    p_bar = (p1 + p2) / 2
    q_bar = 1 - p_bar

    n_per_group = math.ceil(
        ((za * math.sqrt(2 * p_bar * q_bar) +
          zb * math.sqrt(p1 * q1 + p2 * q2)) ** 2)
        / (p1 - p2) ** 2
    )

    return {
        'type': '比例比较（卡方检验）',
        'n_per_group': n_per_group,
        'total_n': n_per_group * 2,
        'p1': p1,
        'p2': p2,
        'alpha': alpha,
        'power': power,
    }


def sample_size_survival(
    hr: float,
    survival_prop: float,
    alpha: float = 0.05,
    power: float = 0.80,
) -> dict:
    """
    生存分析（Log-rank 检验）样本量计算

    参数:
        hr: 风险比 (Hazard Ratio)
        survival_prop: 对照组生存比例
        alpha: 显著性水平
        power: 统计功效

    返回:
        dict: 事件数、总样本量、参数信息
    """
    za = z_alpha(alpha)
    zb = z_beta(power)

    # 需要的事件数
    n_events = math.ceil(((za + zb) ** 2) / (math.log(hr) ** 2))

    # 考虑失访率后的总样本量
    # 假设事件率 = 1 - survival_prop
    event_rate = 1 - survival_prop
    n_total = math.ceil(n_events / event_rate)

    return {
        'type': '生存分析（Log-rank 检验）',
        'n_events': n_events,
        'n_total': n_total,
        'hazard_ratio': hr,
        'survival_proportion': survival_prop,
        'alpha': alpha,
        'power': power,
    }


# ============================================================
# 辅助函数
# ============================================================

def _effect_size_label(d: float) -> str:
    """Cohen's d 效应量标签"""
    abs_d = abs(d)
    if abs_d < 0.2:
        return '极小'
    elif abs_d < 0.5:
        return '小'
    elif abs_d < 0.8:
        return '中'
    else:
        return '大'


def _effect_size_label_f(f: float) -> str:
    """Cohen's f 效应量标签"""
    if f < 0.1:
        return '极小'
    elif f < 0.25:
        return '小'
    elif f < 0.4:
        return '中'
    else:
        return '大'


def format_result(result: dict) -> str:
    """格式化输出结果"""
    lines = ['=' * 50, '样本量计算结果', '=' * 50]

    for key, value in result.items():
        label_map = {
            'type': '检验类型',
            'n_per_group': '每组样本量',
            'total_n': '总样本量',
            'n_pairs': '配对数',
            'n_events': '需要事件数',
            'n_total': '总样本量',
            'effect_size': '效应量 (d)',
            'effect_size_f': '效应量 (f)',
            'effect_size_label': '效应量评估',
            'effect_size_label_f': '效应量评估',
            'delta': '预期差值',
            'sigma': '差值标准差',
            'p1': '组1比例',
            'p2': '组2比例',
            'groups': '组数',
            'hazard_ratio': '风险比 (HR)',
            'survival_proportion': '生存比例',
            'alpha': '显著性水平 (α)',
            'power': '统计功效 (1-β)',
        }
        label = label_map.get(key, key)

        if key in ('alpha',):
            lines.append(f'  {label}: {value}')
        elif key == 'power':
            lines.append(f'  {label}: {value:.0%}')
        elif isinstance(value, float):
            lines.append(f'  {label}: {value:.4f}')
        else:
            lines.append(f'  {label}: {value}')

    lines.append('=' * 50)
    lines.append('注意: 实际样本量应考虑 10-20% 的失访率')
    lines.append('=' * 50)

    return '\n'.join(lines)


# ============================================================
# 主函数
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description='科研样本量计算工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 两组 t 检验（中等效应量 d=0.5）
  python3 sample-size.py --type ttest --effect-size 0.5

  # 三组 ANOVA（中等效应量 f=0.25）
  python3 sample-size.py --type anova --f 0.25 --groups 3

  # 配对 t 检验（差值=5, 标准差=10）
  python3 sample-size.py --type paired --delta 5 --sigma 10

  # 比例比较（p1=0.3, p2=0.5）
  python3 sample-size.py --type proportion --p1 0.3 --p2 0.5

  # 生存分析（HR=0.5, 生存比例=0.5）
  python3 sample-size.py --type survival --hr 0.5 --survival 0.5
        """,
    )

    parser.add_argument(
        '--type', '-t',
        choices=['ttest', 'anova', 'paired', 'proportion', 'survival'],
        required=True,
        help='检验类型',
    )
    parser.add_argument('--effect-size', '-d', type=float, help='Cohen\'s d 效应量（ttest）')
    parser.add_argument('--f', type=float, help='Cohen\'s f 效应量（anova）')
    parser.add_argument('--delta', type=float, help='预期差值（paired）')
    parser.add_argument('--sigma', type=float, help='差值标准差（paired）')
    parser.add_argument('--p1', type=float, help='组1比例（proportion）')
    parser.add_argument('--p2', type=float, help='组2比例（proportion）')
    parser.add_argument('--hr', type=float, help='风险比（survival）')
    parser.add_argument('--survival', type=float, help='生存比例（survival）')
    parser.add_argument('--groups', '-k', type=int, default=2, help='组数（默认2）')
    parser.add_argument('--alpha', '-a', type=float, default=0.05, help='显著性水平（默认0.05）')
    parser.add_argument('--power', '-p', type=float, default=0.80, help='统计功效（默认0.80）')

    args = parser.parse_args()

    # 参数验证
    if args.type == 'ttest' and args.effect_size is None:
        parser.error('ttest 需要 --effect-size 参数')
    if args.type == 'anova' and (args.f is None or args.groups < 2):
        parser.error('anova 需要 --f 和 --groups (≥2) 参数')
    if args.type == 'paired' and (args.delta is None or args.sigma is None):
        parser.error('paired 需要 --delta 和 --sigma 参数')
    if args.type == 'proportion' and (args.p1 is None or args.p2 is None):
        parser.error('proportion 需要 --p1 和 --p2 参数')
    if args.type == 'survival' and (args.hr is None or args.survival is None):
        parser.error('survival 需要 --hr 和 --survival 参数')

    # 计算
    try:
        if args.type == 'ttest':
            result = sample_size_ttest(
                effect_size=args.effect_size,
                alpha=args.alpha,
                power=args.power,
                groups=args.groups,
            )
        elif args.type == 'anova':
            result = sample_size_anova(
                f=args.f,
                groups=args.groups,
                alpha=args.alpha,
                power=args.power,
            )
        elif args.type == 'paired':
            result = sample_size_paired(
                delta=args.delta,
                sigma=args.sigma,
                alpha=args.alpha,
                power=args.power,
            )
        elif args.type == 'proportion':
            result = sample_size_proportion(
                p1=args.p1,
                p2=args.p2,
                alpha=args.alpha,
                power=args.power,
            )
        elif args.type == 'survival':
            result = sample_size_survival(
                hr=args.hr,
                survival_prop=args.survival,
                alpha=args.alpha,
                power=args.power,
            )
        else:
            parser.error(f'未知检验类型: {args.type}')

        print(format_result(result))
    except Exception as e:
        print(f'计算错误: {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
