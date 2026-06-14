def binarize_labels(data_rows: list[dict], label_names: list[str], labels_col: str = "labels") -> list[dict]:
    """
    Convert multi-label column to binary columns (one-hot encoding).
    data_rows: list of dicts with original data + a labels field (list or comma-separated string)
    Returns list of dicts with original fields + binary label columns (0/1).
    """
    result = []
    for row in data_rows:
        row_labels = row.get(labels_col, [])
        if isinstance(row_labels, str):
            row_labels = [l.strip() for l in row_labels.split(",") if l.strip()]
        elif not isinstance(row_labels, list):
            row_labels = []

        new_row = {k: v for k, v in row.items() if k != labels_col}
        for name in label_names:
            new_row[name] = 1 if name in row_labels else 0
        result.append(new_row)
    return result
