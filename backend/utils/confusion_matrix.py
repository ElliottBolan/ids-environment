import os
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import ConfusionMatrixDisplay

# ---- helps reconstruct confusion matrix from classification_report ----
def reconstruct_confusion_matrix(report: dict):
    labels = list(report.keys())
    n = len(labels)

    cm = np.zeros((n, n))

    for i, cls in enumerate(labels):
        metrics = report[cls]

        support = metrics.get("support", 0)
        recall = metrics.get("recall", 0) or 0
        precision = metrics.get("precision", 0) or 1e-9  # avoid div/0

        TP = recall * support
        FN = support - TP

        # distribute mistakes uniformly across other classes
        off = support - TP
        for j in range(n):
            if j != i:
                cm[i, j] = off / (n - 1) if n > 1 else 0

        cm[i, i] = TP

    return labels, cm



def generate_confusion_matrix_image(report, out_path):

    labels, cm = reconstruct_confusion_matrix(report)

    fig, ax = plt.subplots(figsize=(6, 5))
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
    disp.plot(ax=ax, cmap="Blues", colorbar=False)

    plt.title("Confusion Matrix")
    plt.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)

    return out_path
