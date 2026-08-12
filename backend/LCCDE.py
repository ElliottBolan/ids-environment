import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report,confusion_matrix,accuracy_score, precision_score, recall_score, f1_score
from sklearn.preprocessing import LabelEncoder
from imblearn.over_sampling import SMOTE
import lightgbm as lgb
import catboost as cbt
import xgboost as xgb
from river import stream
from statistics import mode
import os
import time

# This file refactors the LCCDE_IDS_GlobeCom22.py by breaking it into key functions
# to use for our '/api/train_lccde' endpoint.

DATASET_DIR = os.path.join(os.path.dirname(__file__), "../src/IDS-files/datasets")

def resolve_dataset_path(filename):
    # Prefer dataset in the canonical datasets dir, but fall back to uploads/
    # so user-uploaded files are found without requiring a move.
    candidate = os.path.join(DATASET_DIR, filename)
    if os.path.exists(candidate):
        return candidate

    uploads_candidate = os.path.join(DATASET_DIR, "uploads", filename)
    if os.path.exists(uploads_candidate):
        return uploads_candidate

    # As a last resort, if an absolute or relative path was provided, check that too
    if os.path.exists(filename):
        return filename

    raise FileNotFoundError(f"Dataset not found. Checked: {candidate}, {uploads_candidate}, and provided path '{filename}'")

def prepare_data(file_path='./CICIDS2017_sample_km.csv', label_col='Label', smote_strategy=None, random_state=0, test_size=0.2):
    try:
        df = pd.read_csv(file_path)
    except FileNotFoundError:
        raise ValueError(f"Dataset not found: {file_path}")
    except Exception as e:
        raise ValueError(f"Failed to read dataset: {e}")


    if label_col not in df.columns:
        raise ValueError(f"Label column '{label_col}' not found in dataset")

    # Convert labels to numeric if needed
    if df[label_col].dtype == object or df[label_col].dtype == 'category':
        le = LabelEncoder()
        df[label_col] = le.fit_transform(df[label_col])
        print("Label encoding applied:", dict(zip(le.classes_, le.transform(le.classes_))))

    X = df.drop([label_col], axis=1)
    y = df[label_col]

    # Convert all features to numeric (non-numeric to NaN)
    X = X.apply(pd.to_numeric, errors='coerce')

    # Replace inf with NaN
    X = X.replace([np.inf, -np.inf], np.nan)

    # Fill remaining NaN with median of each column
    X = X.fillna(X.median(numeric_only=True))

    # After cleaning X, proceed with splitting
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state
    )

    # Check if requested classes exist in y
    if smote_strategy:
        missing = [cls for cls in smote_strategy.keys() if cls not in y.unique()]
        if missing:
            print(f"[SMOTE] Classes missing from dataset → skipping SMOTE: {missing}")
            smote_strategy = None


    return X_train, X_test, y_train, y_test


# # This function is basically the same as the notebook, only with configurable parameters
# def prepare_data(file_path='./CICIDS2017_sample_km.csv', label_col='Label', smote_strategy=None, random_state=0, test_size=0.2):
#     try:
#         df = pd.read_csv(file_path)
#     except FileNotFoundError:
#         raise ValueError(f"Dataset not found: {file_path}")
#     except Exception as e:
#         raise ValueError(f"Failed to read dataset: {e}")
    
#     if label_col not in df.columns:
#         raise ValueError(f"Label column '{label_col}' not found in dataset")

#     X = df.drop([label_col], axis=1)
#     y = df[label_col]
#     X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=random_state) #stratify=y if len(np.unique(y)) > 1 else None
#     if smote_strategy:
#         try:
#             sm = SMOTE(sampling_strategy=smote_strategy, random_state=random_state)
#             X_train, y_train = sm.fit_resample(X_train, y_train)
#         except Exception as e:
#             raise ValueError(f"SMOTE failed: {e}")
        
#     return X_train, X_test, y_train, y_test

# Again, this function changes nothing, but does include configurable parameters
def train_base_models(X_train, y_train, lgb_params=None, xgb_params=None, cbt_params=None):
    lg = lgb.LGBMClassifier(**(lgb_params or {}))
    lg.fit(X_train, y_train)
    xg = xgb.XGBClassifier(**(xgb_params or {}))
    xg.fit(X_train.values, y_train)
    cb = cbt.CatBoostClassifier(verbose=0, **(cbt_params or {}))
    cb.fit(X_train, y_train)
    return lg, xg, cb

# Capture the real confusion matrix so the UI never has to approximate one
# from the classification report.
def confusion_payload(y_true, y_pred):
    # CatBoost returns predictions with shape (n, 1) for multiclass, so flatten
    # both sides before comparing them.
    y_true = np.asarray(y_true).ravel()
    y_pred = np.asarray(y_pred).ravel()
    labels = np.unique(np.concatenate([y_true, y_pred]))
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    return {
        'labels': [int(l) if isinstance(l, (int, np.integer)) else str(l) for l in labels],
        'matrix': cm.tolist(),
    }

# This function almost does the same thing, but we'll ignore the visual plots for now
def evaluate_models(models, X_test, y_test):
    results = dict()
    for name, model in models.items():
        if name == 'xg':
            y_pred = model.predict(X_test.values)
        else:
            y_pred = model.predict(X_test)
        results[name] = {
            'classification_report': classification_report(y_test, y_pred, output_dict=True),
            'confusion_matrix': confusion_payload(y_test, y_pred),
            'accuracy': accuracy_score(y_test, y_pred),
            'precision': precision_score(y_test, y_pred, average='weighted'),
            'recall': recall_score(y_test, y_pred, average='weighted'),
            'f1_weighted': f1_score(y_test, y_pred, average='weighted'),
            'f1_per_class': f1_score(y_test, y_pred, average=None)
        }
    return results

# This basically does the same thing, and is equivalent to the 'model' list in the notebook
def find_leading_models(f1_scores, models):
    class_leaders = []
    for i in range(len(next(iter(f1_scores.values())))):  # Number of classes
        f1s = [f1_scores['lg'][i], f1_scores['xg'][i], f1_scores['cb'][i]]
        max_idx = np.argmax(f1s)
        class_leaders.append([models['lg'], models['xg'], models['cb']][max_idx])
    return class_leaders

# Still the same thing as the notebook, just with a few restructures that I've noted below
def LCCDE(X_test, y_test, models, class_leaders, cancel_event=None):
    yt, yp = [], []
    for xi, yi in stream.iter_pandas(X_test, y_test):
        # Check for cancellation signal between streaming iterations
        if cancel_event is not None and getattr(cancel_event, 'is_set', lambda: False)():
            raise RuntimeError('Run cancelled')
        xi2 = pd.DataFrame([xi])
        preds = [int(m.predict(xi2)[0]) for m in models] # Equivalent to the 'y_predx' values, only this time as a list
        probs = [m.predict_proba(xi2) for m in models] # Equivalent to the 'px' values, only this time as a list
        confidences = [np.max(p) for p in probs] # Equivalent to the 'y_pred_px' values, only this time as a list

        if preds[0] == preds[1] == preds[2]: # If the predicted classes of all the three models are the same
            y_pred = preds[0] # Use preds[0] as the final predicted class
        elif len(set(preds)) == 3: # If the predicted classes of all the three models are different
            l, pred_l, pro_l = [], [], []
            for i, pred in enumerate(preds):
                if class_leaders[pred] is models[i]:
                    l.append(models[i])
                    pred_l.append(pred)
                    pro_l.append(confidences[i])
            if not l:
                pro_l = confidences
            y_pred = pred_l[0] if len(l) == 1 else preds[np.argmax(pro_l)] if l else preds[np.argmax(confidences)]
        else:
            n = mode(preds)
            y_pred = int(class_leaders[n].predict(xi2)[0])
        yt.append(yi)
        yp.append(y_pred)
    return yt, yp

# This is our overarching function that trains and tests our ensemble-learning model
def train_lccde_pipeline(
        file_path, 
        label_col='Label',
        smote_strategy=None,
        random_state=0,
        test_size=0.2,
        lgb_params=None, xgb_params=None, cbt_params=None,
        cancel_event=None
    ):
    start = time.time()

    file_path = resolve_dataset_path(file_path)
    X_train, X_test, y_train, y_test = prepare_data(file_path, label_col, smote_strategy, random_state, test_size)
    # Allow early cancellation after data prep
    if cancel_event is not None and getattr(cancel_event, 'is_set', lambda: False)():
        raise RuntimeError('Run cancelled')
    lg, xg, cb = train_base_models(X_train, y_train, lgb_params, xgb_params, cbt_params)
    # Check cancellation after training base models
    if cancel_event is not None and getattr(cancel_event, 'is_set', lambda: False)():
        raise RuntimeError('Run cancelled')
    models = {'lg': lg, 'xg': xg, 'cb': cb}
    base_eval = evaluate_models(models, X_test, y_test)
    if cancel_event is not None and getattr(cancel_event, 'is_set', lambda: False)():
        raise RuntimeError('Run cancelled')
    f1_scores = {k: v['f1_per_class'] for k, v in base_eval.items()}
    class_leaders = find_leading_models(f1_scores, models)
    # Pass cancel_event into the streaming evaluation so it can be interrupted
    yt, yp = LCCDE(X_test, y_test, [lg, xg, cb], class_leaders, cancel_event=cancel_event)

    lccde_metrics = {
        # The ensemble gets the same report/matrix treatment as the base models
        # so every result set can render a confusion matrix.
        'classification_report': classification_report(yt, yp, output_dict=True),
        'confusion_matrix': confusion_payload(yt, yp),
        'accuracy': accuracy_score(yt, yp),
        'precision': precision_score(yt, yp, average='weighted'),
        'recall': recall_score(yt, yp, average='weighted'),
        'f1_weighted': f1_score(yt, yp, average='weighted'),
        # Provide a simple alias `f1` for backward compatibility with frontend
        # which expects `metrics.f1`.
        'f1': f1_score(yt, yp, average='weighted'),
        'f1_per_class': f1_score(yt, yp, average=None),
    }

    end = time.time()
    duration_s = round(end - start, 3)

    return {
        'lccde': lccde_metrics,
        'base': base_eval,
        'duration_s': duration_s,
        'dataset': os.path.basename(file_path)
    }