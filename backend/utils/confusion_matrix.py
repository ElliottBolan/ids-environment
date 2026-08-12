import os
import matplotlib

# Render off-screen: figures are generated inside Flask request threads, and the
# default interactive (Tk) backend crashes the server when used off the main thread.
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import ConfusionMatrixDisplay

# ---- helps reconstruct confusion matrix from classification_report ----
def reconstruct_confusion_matrix(report: dict):
    if not isinstance(report, dict):
        raise ValueError("classification report must be a dict-like object")

    # sklearn's classification_report(output_dict=True) contains class labels
    # as keys mapping to dicts, but also includes keys like 'accuracy' (float)
    # and 'macro avg'/'weighted avg' (dicts). We only want true class labels
    # which will have a 'support' entry.
    class_items = [(k, v) for k, v in report.items() if isinstance(v, dict) and 'support' in v]
    if not class_items:
        raise ValueError('No class entries with "support" found in classification report')

    labels = [k for k, _ in class_items]
    n = len(labels)

    cm = np.zeros((n, n))

    for i, (cls, metrics) in enumerate(class_items):
        support = metrics.get('support', 0)
        recall = metrics.get('recall', 0) or 0
        # precision not used for TP calculation but keep safe default
        precision = metrics.get('precision', 0) or 1e-9

        TP = recall * support
        # distribute mistakes uniformly across other classes
        off = support - TP
        for j in range(n):
            if j != i:
                cm[i, j] = off / (n - 1) if n > 1 else 0

        cm[i, i] = TP

    return labels, cm



def extract_confusion_matrix(report: dict):
    """Return (labels, matrix) from a stored report.

    Prefers a real confusion matrix recorded at training time and only falls
    back to reconstructing one from a classification report (which spreads
    errors evenly and is therefore an approximation) for older runs.
    """
    if not isinstance(report, dict):
        raise ValueError("confusion matrix report must be a dict-like object")

    # Newer runs store {"labels": [...], "matrix": [[...]]}, possibly nested
    # under "confusion_matrix".
    for candidate in (report, report.get("confusion_matrix")):
        if isinstance(candidate, dict) and isinstance(candidate.get("matrix"), list):
            matrix = np.array(candidate["matrix"], dtype=float)
            labels = candidate.get("labels") or list(range(matrix.shape[0]))
            return [str(l) for l in labels], matrix

    # Legacy runs stored only the classification report.
    cr = report.get("classification_report")
    return reconstruct_confusion_matrix(cr if isinstance(cr, dict) else report)


def generate_confusion_matrix_image(report, out_path, title="Confusion Matrix"):

    labels, cm = extract_confusion_matrix(report)

    fig, ax = plt.subplots(figsize=(6, 5))
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
    disp.plot(ax=ax, cmap="Blues", colorbar=False, values_format=".0f")

    plt.title(title)
    plt.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)

    return out_path
