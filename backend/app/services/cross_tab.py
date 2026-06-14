"""SPSS 定制表风格的交叉分析引擎。支持频率分析、多标签交叉、层级（一级/二级）分析。"""

from collections import Counter, defaultdict


def parse_label_hierarchy(label_names: list[str]) -> dict[str, list[str]]:
    """根据标签名中的 '-' 解析层级结构。如 '服务态度-态度恶劣' → 一级='服务态度', 二级='态度恶劣'"""
    hierarchy: dict[str, list[str]] = defaultdict(list)
    flat_labels: list[str] = []
    for name in label_names:
        if '-' in name:
            parts = name.split('-', 1)
            parent = parts[0].strip()
            child = parts[1].strip()
            hierarchy[parent].append(child)
        else:
            flat_labels.append(name)
    return dict(hierarchy), flat_labels


def frequency_analysis(data_rows: list[dict], label_names: list[str]) -> dict:
    """
    频率分析：每个标签出现了多少次、占总记录的比例。
    一条记录可以有多个标签（多选题）。比例 = 打上该标签的记录数 / 总记录数 × 100%。
    """
    total = len(data_rows)
    counts = Counter()
    for row in data_rows:
        for lbl in label_names:
            if row.get(lbl, 0) == 1:
                counts[lbl] += 1

    matrix = []
    for lbl in sorted(label_names, key=lambda x: -counts.get(x, 0)):
        cnt = counts.get(lbl, 0)
        matrix.append({
            "标签": lbl,
            "频数": cnt,
            "占比(%)": round(cnt / total * 100, 1) if total > 0 else 0,
        })

    # 汇总行：标注总次数（多选题每条可能有多个标签）
    total_labeled = sum(counts.values())
    record_count = sum(1 for row in data_rows if any(row.get(lbl, 0) == 1 for lbl in label_names))
    matrix.append({
        "标签": "汇总",
        "频数": total_labeled,
        "占比(%)": "",
    })

    return {
        "matrix": matrix,
        "matrix_columns": ["标签", "频数", "占比(%)"],
        "total_records": total,
        "summary": f"共 {total} 条记录，{len(label_names)} 个标签",
    }


def cross_analysis(data_rows: list[dict], row_labels: list[str],
                   col_labels: list[str] | None = None) -> dict:
    """
    交叉分析：多行标签 × 多列标签。
    row_labels: 行变量（多个标签名）
    col_labels: 列变量（多个标签名），为 None 则只按行标签频率统计
    每格显示：计数（占总体 %）
    """
    total = len(data_rows)

    if not col_labels:
        # 无列变量：直接频率分析
        return frequency_analysis(data_rows, row_labels)

    # 交叉表：行标签 × 列标签
    cross_counts: dict[tuple[str, str], int] = Counter()
    for row in data_rows:
        for rl in row_labels:
            if row.get(rl, 0) == 1:
                for cl in col_labels:
                    if row.get(cl, 0) == 1:
                        cross_counts[(rl, cl)] += 1

    # 行合计
    row_totals: dict[str, int] = Counter()
    for row in data_rows:
        for rl in row_labels:
            if row.get(rl, 0) == 1:
                row_totals[rl] += 1

    # 列合计
    col_totals: dict[str, int] = Counter()
    for row in data_rows:
        for cl in col_labels:
            if row.get(cl, 0) == 1:
                col_totals[cl] += 1

    # 构建矩阵
    matrix: list[dict] = []
    for rl in sorted(row_labels):
        row_data: dict = {"标签": rl}
        row_data["行总计"] = row_totals.get(rl, 0)
        for cl in sorted(col_labels):
            cnt = cross_counts.get((rl, cl), 0)
            row_total = row_totals[rl]
            pct = round(cnt / row_total * 100, 1) if row_total > 0 else 0
            row_data[f"{cl}(频数)"] = cnt
            row_data[f"{cl}(行%)"] = pct
        matrix.append(row_data)

    # 列合计行
    total_row: dict = {"标签": "列总计"}
    total_row["行总计"] = total
    for cl in sorted(col_labels):
        ct = col_totals.get(cl, 0)
        total_row[f"{cl}(频数)"] = ct
        total_row[f"{cl}(行%)"] = round(ct / total * 100, 1) if total > 0 else 0
    matrix.append(total_row)

    # 构建列名
    columns = ["标签", "行总计"]
    for cl in sorted(col_labels):
        columns.append(f"{cl}(频数)")
        columns.append(f"{cl}(行%)")

    return {
        "matrix": matrix,
        "matrix_columns": columns,
        "total_records": total,
        "summary": f"交叉分析：{len(row_labels)} 个行标签 × {len(col_labels)} 个列标签",
    }


def hierarchy_analysis(data_rows: list[dict], label_names: list[str]) -> dict:
    """
    层级分析：
    - 第一层：每个一级标签的频数和占总体比例
    - 第二层：每个一级标签下，各二级标签的频数和占该一级标签的比例
    """
    hierarchy, flat_labels = parse_label_hierarchy(label_names)
    total = len(data_rows)

    # 一级标签统计
    level1_rows = []
    for parent, children in sorted(hierarchy.items()):
        # 统计打上该一级标签任一子标签的记录数
        record_count = 0
        child_counts: dict[str, int] = Counter()
        for row in data_rows:
            has_any = False
            for child in children:
                lbl_full = f"{parent}-{child}"
                if row.get(lbl_full, 0) == 1:
                    child_counts[child] += 1
                    has_any = True
            if has_any:
                record_count += 1

        level1_rows.append({
            "一级标签": parent,
            "涉及记录数": record_count,
            "占总记录%": round(record_count / total * 100, 1) if total > 0 else 0,
            "子标签数": len(children),
        })

    # 二级标签明细（每个一级标签展开）
    level2_data: dict[str, list[dict]] = {}
    for parent, children in sorted(hierarchy.items()):
        # 计算该一级标签的总涉及记录
        parent_total = 0
        child_rows_dict: dict[str, int] = Counter()
        for row in data_rows:
            for child in children:
                lbl_full = f"{parent}-{child}"
                if row.get(lbl_full, 0) == 1:
                    child_rows_dict[child] += 1

        parent_total = sum(child_rows_dict.values())

        matrix = []
        for child in sorted(children, key=lambda c: -child_rows_dict.get(c, 0)):
            cnt = child_rows_dict.get(child, 0)
            matrix.append({
                "二级标签": child,
                "频数": cnt,
                f"占'{parent}'%": round(cnt / parent_total * 100, 1) if parent_total > 0 else 0,
                "占总记录%": round(cnt / total * 100, 1) if total > 0 else 0,
            })
        if matrix:
            matrix.append({
                "二级标签": "小计",
                "频数": parent_total,
                f"占'{parent}'%": 100.0,
                "占总记录%": round(parent_total / total * 100, 1) if total > 0 else 0,
            })
        level2_data[parent] = matrix

    return {
        "level1": level1_rows,
        "level1_columns": ["一级标签", "涉及记录数", "占总记录%", "子标签数"],
        "level2": level2_data,
        "level2_columns_template": ["二级标签", "频数", "占'{parent}'%", "占总记录%"],
        "flat_labels": flat_labels,
        "total_records": total,
    }
