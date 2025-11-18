// src/utils/HyParamRules.jsx
// default hyperparameter rrules

export const HyParamRules = {
  XGBoost: {
    n_estimators: { required: "Required", min: { value: 1, message: ">0" } },
    max_depth: { required: "Required", min: { value: 1, message: ">0" } },
    learning_rate: { required: "Required", min: { value: 0, message: ">=0" } },
  },
  LightGBM: {
    n_estimators: { required: "Required", min: { value: 1, message: ">0" } },
    learning_rate: { required: "Required", min: { value: 0.001, message: ">=0.001" } },
    max_depth: { required: "Required", min: { value: -1, message: "-1=unlimited" } },
  },
  CatBoost: {
    iterations: { required: "Required", min: { value: 10, message: ">=10" } },
    depth: { required: "Required", min: { value: 1, message: ">0" }, max: { value: 16, message: "<=16" } },
    learning_rate: { required: "Required", min: { value: 0.001, message: ">=0.001" } },
  }
};
