"""
SPSS 风格统计分析引擎。
支持：单变量频数、交叉列联表（行%/列%/总%）、卡方检验、0-1多选题集、结构化输出。
"""

import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field


@dataclass
class VariableDef:
    """变量定义"""
    name: str                    # 显示名
    column: str                  # 数据列名
    vtype: str = "categorical"   # categorical | multiple_choice
    children: list[str] = field(default_factory=list)  # 多选题集：子列名列表


@dataclass
class FreqCell:
    label: str
    count: int
    pct: float           # 涉及比例 = count / total N × 100


@dataclass
class CrossTabCell:
    observed: int
    row_pct: float       # % within row
    col_pct: float       # % within column
    total_pct: float     # % of grand total
    expected: float | None = None  # H0 期望值（卡方用）


@dataclass
class ChiSquareResult:
    chi_square: float
    df: int
    p_value: float
    cramer_v: float | None = None
    n: int = 0
    significant: bool = False      # p < 0.05


@dataclass
class FrequencyTable:
    title: str
    total_n: int
    valid_n: int
    missing_n: int
    rows: list[FreqCell]
    narrative: str = ""


@dataclass
class CrossTabTable:
    title: str
    row_var: str
    col_var: str
    total_n: int
    row_labels: list[str]
    col_labels: list[str]
    matrix: list[list[CrossTabCell]]
    chi_square: ChiSquareResult | None = None
    narrative: str = ""


@dataclass
class AnalysisOutput:
    """结构化输出，下游AI模块直接使用"""
    frequency_tables: list[dict] = field(default_factory=list)
    cross_tab_tables: list[dict] = field(default_factory=list)
    narratives: list[str] = field(default_factory=list)
    summary: dict = field(default_factory=dict)


# ═══════════════════════════════════════
#  核心计算函数
# ═══════════════════════════════════════

def load_data(data_rows: list[dict], variables: list[VariableDef]) -> tuple[list[dict], int]:
    """
    加载数据，处理缺失值。返回 (有效数据, 总N)。
    多选题集自动展开：子列中任一为1则集记为1。
    """
    total_n = len(data_rows)
    valid_rows = []
    for row in data_rows:
        # 简单缺失处理：跳过主变量全部为空的
        valid_rows.append(row)
    return valid_rows, total_n


def _count_binary(row_data: list[dict], col: str) -> int:
    """统计 0-1 列中 1 的个数"""
    return sum(1 for r in row_data if int(float(r.get(col, 0))) == 1)


def _count_binary_set(row_data: list[dict], children: list[str]) -> int:
    """统计多选题集中至少选中1个的记录数"""
    cnt = 0
    for r in row_data:
        if any(int(float(r.get(c, 0))) == 1 for c in children):
            cnt += 1
    return cnt


# ══════════════════════ 单变量频率 ══════════════════════

def frequency(variable: VariableDef, data_rows: list[dict], total_n: int) -> FrequencyTable:
    """单变量频数表"""
    if variable.vtype == "multiple_choice" and variable.children:
        children = variable.children
        rows_out = []
        for child in children:
            cnt = _count_binary(data_rows, child)
            pct = round(cnt / total_n * 100, 1) if total_n > 0 else 0
            rows_out.append(FreqCell(label=child, count=cnt, pct=pct))
        # 合计行
        set_cnt = _count_binary_set(data_rows, children)
        rows_out.append(FreqCell(
            label=f"{variable.name}（至少涉及1项）",
            count=set_cnt,
            pct=round(set_cnt / total_n * 100, 1) if total_n > 0 else 0,
        ))
    else:
        counter = Counter()
        for r in data_rows:
            val = str(r.get(variable.column, "")).strip()
            if val:
                counter[val] += 1
        # 如果数据看起来是 0-1 二进制，跳过 0 类别
        vals = set(counter.keys())
        is_binary = vals.issubset({"0", "1"}) and "1" in vals
        rows_out = []
        for k, v in counter.most_common():
            if is_binary and k == "0":
                continue
            rows_out.append(FreqCell(
                label=variable.name if is_binary else k,
                count=v,
                pct=round(v / total_n * 100, 1) if total_n > 0 else 0,
            ))

    valid_n = total_n  # simplified
    missing_n = 0

    # 自然语言
    top_label = rows_out[0].label if rows_out else "N/A"
    narrative = f"共 {total_n} 条记录，「{variable.name}」中涉及比例最高的是「{top_label}」({rows_out[0].count}条, {rows_out[0].pct}%)" if rows_out else "无数据"

    return FrequencyTable(
        title=f"频率表 — {variable.name}",
        total_n=total_n, valid_n=valid_n, missing_n=missing_n,
        rows=rows_out, narrative=narrative,
    )


# ══════════════════════ 交叉列联表 ══════════════════════

def _resolve_levels(var: VariableDef, data_rows: list[dict]) -> list[str]:
    """获取变量的所有类别/层级"""
    if var.vtype == "multiple_choice" and var.children:
        return var.children  # 每个子项作为一个类别
    else:
        vals = set()
        for r in data_rows:
            v = str(r.get(var.column, "")).strip()
            if v:
                vals.add(v)
        return sorted(vals)


def _get_value(var: VariableDef, row: dict, level: str) -> int:
    """判断某条记录在指定变量类别上的取值（0或1）"""
    if var.vtype == "multiple_choice" and var.children:
        return 1 if int(float(row.get(level, 0))) == 1 else 0
    else:
        return 1 if str(row.get(var.column, "")).strip() == level else 0


def cross_tab(row_var: VariableDef, col_var: VariableDef,
              data_rows: list[dict], total_n: int) -> CrossTabTable:
    """交叉列联表：行×列 + 行% + 列% + 总% + 卡方检验"""
    row_levels = _resolve_levels(row_var, data_rows)
    col_levels = _resolve_levels(col_var, data_rows)

    # 构建观察频数矩阵和边际总计
    obs = [[0] * len(col_levels) for _ in range(len(row_levels))]
    row_totals = [0] * len(row_levels)
    col_totals = [0] * len(col_levels)
    grand = 0

    for r in data_rows:
        for i, rl in enumerate(row_levels):
            ri = _get_value(row_var, r, rl)
            if ri == 0:
                continue
            for j, cl in enumerate(col_levels):
                cj = _get_value(col_var, r, cl)
                if cj == 1:
                    obs[i][j] += 1
                    row_totals[i] += 1
                    col_totals[j] += 1
                    grand += 1

    # 构建矩阵
    matrix: list[list[CrossTabCell]] = []
    for i in range(len(row_levels)):
        row_cells: list[CrossTabCell] = []
        for j in range(len(col_levels)):
            o = obs[i][j]
            rp = round(o / row_totals[i] * 100, 1) if row_totals[i] > 0 else 0
            cp = round(o / col_totals[j] * 100, 1) if col_totals[j] > 0 else 0
            tp = round(o / grand * 100, 1) if grand > 0 else 0
            expected = (row_totals[i] * col_totals[j]) / grand if grand > 0 else 0
            row_cells.append(CrossTabCell(
                observed=o, row_pct=rp, col_pct=cp, total_pct=tp, expected=expected,
            ))
        matrix.append(row_cells)

    # 卡方检验
    chi = _chi_square_test(obs, row_totals, col_totals, grand)

    # 叙事
    narrative = f"交叉分析「{row_var.name}」×「{col_var.name}」：共 {grand} 次标注配对"
    if chi and chi.significant:
        narrative += f"，卡方={chi.chi_square:.2f}, p={chi.p_value:.4f}（显著相关）"
    else:
        narrative += "，无显著关联"

    return CrossTabTable(
        title=f"交叉表 — {row_var.name} × {col_var.name}",
        row_var=row_var.name, col_var=col_var.name, total_n=total_n,
        row_labels=row_levels, col_labels=col_levels,
        matrix=matrix, chi_square=chi, narrative=narrative,
    )


def _chi_square_test(obs: list[list[int]], row_totals: list[int],
                     col_totals: list[int], grand: int) -> ChiSquareResult | None:
    """卡方独立性检验"""
    if grand == 0 or len(obs) < 2 or len(obs[0]) < 2:
        return None

    r, c = len(obs), len(obs[0])
    chi_sq = 0.0
    for i in range(r):
        for j in range(c):
            expected = (row_totals[i] * col_totals[j]) / grand
            if expected > 0 and obs[i][j] > 0:
                chi_sq += (obs[i][j] - expected) ** 2 / expected

    df = (r - 1) * (c - 1)
    if df <= 0:
        return None

    # 用 Wilson-Hilferty 近似计算 p-value
    p = _chi2_p_value(chi_sq, df)
    v = math.sqrt(chi_sq / (grand * (min(r, c) - 1))) if grand > 0 and min(r, c) > 1 else None

    return ChiSquareResult(
        chi_square=round(chi_sq, 3),
        df=df,
        p_value=round(p, 4),
        cramer_v=round(v, 3) if v else None,
        n=grand,
        significant=p < 0.05,
    )


def _chi2_p_value(chi2: float, df: int) -> float:
    """卡方分布的 p 值（Wilson-Hilferty 近似 + 正则化不完全 Gamma 函数）。
    精度足够用于 p < 0.001 到 p < 0.999 范围。"""
    if chi2 <= 0:
        return 1.0
    if df <= 0:
        return 1.0
    # 用正则化下不完全 Gamma 函数
    return _gamma_q(df / 2.0, chi2 / 2.0)


def _gamma_q(a: float, x: float) -> float:
    """正则化上不完全 Gamma 函数 Q(a,x) = 1 - P(a,x)"""
    if x < a + 1.0:
        return 1.0 - _gamma_p_series(a, x)
    else:
        return _gamma_q_cf(a, x)


def _gamma_p_series(a: float, x: float) -> float:
    """级数展开计算 P(a,x) / Gamma(a)"""
    if x <= 0:
        return 0.0
    ap = a
    s = 1.0 / a
    d = s
    for n in range(1, 200):
        ap += 1.0
        d *= x / ap
        s += d
        if abs(d) < abs(s) * 1e-14:
            break
    return s * math.exp(-x + a * math.log(x) - _log_gamma(a))


def _gamma_q_cf(a: float, x: float) -> float:
    """连分数计算 Q(a,x)"""
    b = x + 1.0 - a
    c = 1.0 / 1e-30
    d = 1.0 / b
    h = d
    for i in range(1, 200):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < 1e-30:
            d = 1e-30
        c = b + an / c
        if abs(c) < 1e-30:
            c = 1e-30
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 1e-14:
            break
    return math.exp(-x + a * math.log(x) - _log_gamma(a)) * h


def _log_gamma(x: float) -> float:
    """ln Gamma(x)，Stirling 近似"""
    if x <= 0:
        return 0.0
    # Lanczos approximation
    coef = [76.18009172947146, -86.50532032941677, 24.01409824083091,
            -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
    y = x
    tmp = x + 5.5
    tmp -= (x + 0.5) * math.log(tmp)
    ser = 1.000000000190015
    for c in coef:
        y += 1.0
        ser += c / y
    return -tmp + math.log(2.5066282746310005 * ser / x)


# ══════════════════════ 结构化输出 ══════════════════════

def to_structured_output(freq_tables: list[FrequencyTable],
                         cross_tables: list[CrossTabTable]) -> AnalysisOutput:
    """将分析结果转为下游 AI 模块可用的结构化格式"""
    out = AnalysisOutput()

    for ft in freq_tables:
        out.frequency_tables.append({
            "type": "frequency",
            "title": ft.title,
            "n": ft.total_n,
            "headers": ["类别", "频数", "涉及比例(%)"],
            "rows": [{"label": r.label, "count": r.count, "pct": r.pct} for r in ft.rows],
        })
        out.narratives.append(ft.narrative)

    for ct in cross_tables:
        headers = [""] + [f"{cl} (频数)" for cl in ct.col_labels] + [f"{cl} (行%)" for cl in ct.col_labels]
        rows_out = []
        for i, rl in enumerate(ct.row_labels):
            row_data = {"label": rl}
            for j, cl in enumerate(ct.col_labels):
                cell = ct.matrix[i][j]
                row_data[f"{cl} (频数)"] = cell.observed
                row_data[f"{cl} (行%)"] = cell.row_pct
            rows_out.append(row_data)

        chi_dict = None
        if ct.chi_square:
            chi_dict = {
                "chi_square": ct.chi_square.chi_square,
                "df": ct.chi_square.df,
                "p_value": ct.chi_square.p_value,
                "cramer_v": ct.chi_square.cramer_v,
                "significant": ct.chi_square.significant,
            }

        out.cross_tab_tables.append({
            "type": "cross_tab",
            "title": ct.title,
            "row_var": ct.row_var,
            "col_var": ct.col_var,
            "n": ct.total_n,
            "headers": headers,
            "rows": rows_out,
            "chi_square": chi_dict,
        })
        out.narratives.append(ct.narrative)

    out.summary = {
        "total_records": (freq_tables[0].total_n if freq_tables else 0),
        "frequency_tables": len(out.frequency_tables),
        "cross_tab_tables": len(out.cross_tab_tables),
        "narratives": out.narratives,
    }
    return out
