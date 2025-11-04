import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report,confusion_matrix,accuracy_score, precision_score, recall_score, f1_score
from imblearn.over_sampling import SMOTE
import lightgbm as lgb
import catboost as cbt
import xgboost as xgb
from river import stream
from statistics import mode

def prepare_data(file_path='./CICIDS2017_sample_km.csv', label_col='Label', smote_strategy=None, random_state=0, test_size=0.2):
    df = pd.read_csv(file_path)
    X = df.drop([label_col], axis=1)
    y = df[label_col]
    X_train, X_test, y_train, y_test = train_test_split(X, y, train_size=1-test_size, test_size=test_size, random_state=random_state)
    if smote_strategy:
        sm = SMOTE(sampling_strategy=smote_strategy)
        X_train, y_train = sm.fit_resample(X_train, y_train)
    return X_train, X_test, y_train, y_test

def train_base_models(X_train, y_train, lgb_params=None, xgb_params=None, cbt_params=None):
    lg = lgb.LGBMClassifier(**(lgb_params or {}))
    lg.fit(X_train, y_train)
    xg = xgb.XGBClassifier(**(xgb_params or {}))
    xg.fit(X_train.values, y_train)
    cb = cbt.CatBoostClassifier(verbose=0, **(cbt_params or {}))
    cb.fit(X_train, y_train)
    return lg, xg, cb

def evaluate_models(models, X_test, y_test):
    results = dict()
    for name, model in models.items():
        if name == 'xg':
            y_pred = model.predict(X_test.values)
        else:
            y_pred = model.predict(X_test)
        results[name] = {
            'classification_report': classification_report(y_test, y_pred, output_dict=True),
            'accuracy': accuracy_score(y_test, y_pred),
            'precision': precision_score(y_test, y_pred, average='weighted'),
            'recall': recall_score(y_test, y_pred, average='weighted'),
            'f1_weighted': f1_score(y_test, y_pred, average='weighted'),
            'f1_per_class': f1_score(y_test, y_pred, average=None)
        }
    return results

def find_leading_models(f1_scores, models):
    class_leaders = []
    for i in range(len(next(iter(f1_scores.values())))):  # Number of classes
        f1s = [f1_scores['lg'][i], f1_scores['xg'][i], f1_scores['cb'][i]]
        max_idx = np.argmax(f1s)
        class_leaders.append([models['lg'], models['xg'], models['cb']][max_idx])
    return class_leaders

def LCCDE(X_test, y_test, models, class_leaders):
    yt, yp = [], []
    for xi, yi in stream.iter_pandas(X_test, y_test):
        xi2 = pd.DataFrame([xi])
        preds = [int(m.predict(xi2)[0]) for m in models]
        probs = [m.predict_proba(xi2) for m in models]
        confidences = [np.max(p) for p in probs]

        if preds[0] == preds[1] == preds[2]:
            y_pred = preds[0]
        elif len(set(preds)) == 3:
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

def train_lccde_pipeline(
        file_path, 
        label_col='Label',
        smote_strategy=None,
        random_state=0,
        test_size=0.2,
        lgb_params=None, xgb_params=None, cbt_params=None
    ):
    X_train, X_test, y_train, y_test = prepare_data(file_path, label_col, smote_strategy, random_state, test_size)
    lg, xg, cb = train_base_models(X_train, y_train, lgb_params, xgb_params, cbt_params)
    models = {'lg': lg, 'xg': xg, 'cb': cb}
    base_eval = evaluate_models(models, X_test, y_test)
    f1_scores = {k: v['f1_per_class'] for k, v in base_eval.items()}
    class_leaders = find_leading_models(f1_scores, models)
    yt, yp = LCCDE(X_test, y_test, [lg, xg, cb], class_leaders)
    lccde_metrics = {
        'accuracy': accuracy_score(yt, yp),
        'precision': precision_score(yt, yp, average='weighted'),
        'recall': recall_score(yt, yp, average='weighted'),
        'f1_weighted': f1_score(yt, yp, average='weighted'),
        'f1_per_class': f1_score(yt, yp, average=None),
    }
    return {
        'lccde': lccde_metrics,
        'base': base_eval
    }