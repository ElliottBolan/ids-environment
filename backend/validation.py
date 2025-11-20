def _validate_param_types(params, schema, model_name):
    if not isinstance(params, dict):
        raise ValueError(f"{model_name} parameters must be a dictionary")

    validated = {}
    for key, val in params.items():
        if key in schema:
            allowed_types = schema[key]
            if not isinstance(val, allowed_types):
                raise ValueError(
                    f"{model_name} param '{key}' must be {allowed_types}, got {type(val)}"
                )
        validated[key] = val
    return validated


def validate_lgb_params(params):
    if params is None:
        return {}

    schema = {
        "n_estimators": int,
        "learning_rate": (int, float),
        "max_depth": int,
        "num_leaves": int,
        "subsample": (int, float),
        "colsample_bytree": (int, float),
        "reg_alpha": (int, float),
        "reg_lambda": (int, float),
        "min_child_samples": int,
        "boosting_type": str,
        "objective": str,
    }

    validated = _validate_param_types(params, schema, "LightGBM")

    if "learning_rate" in validated and validated["learning_rate"] <= 0:
        raise ValueError("LightGBM: learning_rate must be > 0")

    if "num_leaves" in validated and validated["num_leaves"] < 2:
        raise ValueError("LightGBM: num_leaves must be >= 2")

    return validated


def validate_xgb_params(params):
    if params is None:
        return {}

    schema = {
        "n_estimators": int,
        "learning_rate": (int, float),
        "max_depth": int,
        "subsample": (int, float),
        "colsample_bytree": (int, float),
        "gamma": (int, float),
        "reg_alpha": (int, float),
        "reg_lambda": (int, float),
        "min_child_weight": (int, float),
        "objective": str,
    }

    validated = _validate_param_types(params, schema, "XGBoost")

    if "learning_rate" in validated and validated["learning_rate"] <= 0:
        raise ValueError("XGBoost: learning_rate must be > 0")

    if "max_depth" in validated and validated["max_depth"] < 1:
        raise ValueError("XGBoost: max_depth must be >= 1")

    return validated


def validate_cbt_params(params):
    if params is None:
        return {}

    schema = {
        "iterations": int,
        "learning_rate": (int, float),
        "depth": int,
        "l2_leaf_reg": (int, float),
        "bagging_temperature": (int, float),
        "border_count": int,
        "loss_function": str,
        "bootstrap_type": str,
    }

    validated = _validate_param_types(params, schema, "CatBoost")

    if "depth" in validated and not (1 <= validated["depth"] <= 16):
        raise ValueError("CatBoost: depth must be between 1 and 16")

    if "learning_rate" in validated and validated["learning_rate"] <= 0:
        raise ValueError("CatBoost: learning_rate must be > 0")

    return validated