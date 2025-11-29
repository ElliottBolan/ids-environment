// src/utils/HyParamRules.jsx
// default hyperparameter rrules

export const HyParamRules = {
  XGBoost: {
    n_estimators: { required: "Required", min: { value: 1, message: ">0" } },
    max_depth: { required: "Required", min: { value: 1, message: ">0" } },
    learning_rate: { required: "Required", min: { value: 0, message: ">=0" } },
    subsample: { required: "Required", min: { value: 0.1, message: ">=0.1" }, max: {value: 1, message: "<=1"} },
    colsample_bytree: { required: "Required", min: { value: 0.1, message: ">=0.1" }, max: {value: 1, message: "<=1"} },
    reg_lambda: { required: "Required", min: { value: 0, message: ">=0" } }
  },
  LightGBM: {
    n_estimators: { required: "Required", min: { value: 1, message: ">0" } },
    num_leaves: { required: "Required", min: { value: 2, message: ">1" } },
    learning_rate: { required: "Required", min: { value: 0.01, message: ">=0.01" } },
    max_depth: { required: "Required", min: { value: -1, message: "-1=unlimited" } },
  },
  CatBoost: {
    iterations: { required: "Required", min: { value: 10, message: ">=10" } },
    depth: { required: "Required", min: { value: 1, message: ">0" } },
    learning_rate: { required: "Required", min: { value: 0.01, message: ">=0.01" } },
    l2_leaf_reg: { required: "Required", min: { value: 0, message: ">=0" } }
  }
};
