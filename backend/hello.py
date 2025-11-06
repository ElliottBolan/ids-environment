from flask import Flask, jsonify, request
from flask_cors import CORS
import json

from backend.LCCDE import train_lccde_pipeline

app = Flask(__name__)
# Allow requests from the React dev server (and others) during development
CORS(app)

def make_json_safe(obj):
    import numpy as np

    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, dict):
        return {k: make_json_safe(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_json_safe(i) for i in obj]
    elif isinstance(obj, tuple):
        return tuple(make_json_safe(i) for i in obj)
    else:
        return obj

@app.route("/hello")
def hello_world():
    return "<p>Hello, World!</p>"

@app.route("/train_lccde", methods=["POST"])
def train_lccde():
    try:
        # Extract parameters from the POST request body
        params = request.get_json() or {}
        # Default values if missing
        dataset = params.get("dataset", "CICIDS2017_sample_km.csv")
        label_col = params.get("label_col", "Label")
        smote_strategy = params.get("smote_strategy", {2:1000, 4:1000})
        random_state = params.get("random_state", 0)
        test_size = params.get("test_size", 0.2)
        lgb_params = params.get("lgb_params", None)
        xgb_params = params.get("xgb_params", None)
        cbt_params = params.get("cbt_params", None)

        if isinstance(smote_strategy, dict):
            smote_strategy = {int(k): v for k, v in smote_strategy.items()}

        # Run the LCCDE pipeline
        results = train_lccde_pipeline(
            file_path=dataset,
            label_col=label_col,
            smote_strategy=smote_strategy,
            random_state=random_state,
            test_size=test_size,
            lgb_params=lgb_params,
            xgb_params=xgb_params,
            cbt_params=cbt_params
        )

        # Return the performance metrics
        json_str = json.dumps(make_json_safe(results), indent=2)

        return app.response_class(
            response=json_str,
            status=200,
            mimetype="application/json"
        )

    except Exception as e:
        import traceback
        print("ERROR in /train_lccde:", e)
        traceback.print_exc()  # full traceback in your terminal
        return jsonify({"error": str(e)}), 400
    


if __name__ == "__main__":
    app.run(port=5000, debug=True)