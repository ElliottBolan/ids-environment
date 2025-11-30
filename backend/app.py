from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy # type: ignore
from dotenv import load_dotenv # type: ignore
from LCCDE import train_lccde_pipeline
import os
import time
from models import db, ModelRun
from validation import (
    validate_lgb_params,
    validate_xgb_params,
    validate_cbt_params
)

# load env vars
load_dotenv()

app = Flask(__name__)
# Allow requests from the React dev server (and others) during development
CORS(app)

# Configure database
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "idsml")

app.config["SQLALCHEMY_DATABASE_URI"] = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app) # Initialize db with the Flask app

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

# TEST API
@app.route("/api/hello") # Use the '/api/...' prefix for all backend routes to make it clear they're API endpoints
def hello_world():
    return jsonify(message="Backend connected successfully!") #Return JSON instead of HTML. It's easier for React to consume

# --- MOCK DATA ---
AVAILABLE_MODELS = ["LCCDE"]

MODEL_PARAMETERS = { 
    "LCCDE": {
        "learning_rate": 0.01,
        "batch_size": 32,
        "epochs": 10,
        "train_test_split": 0.8
    }
}

MOCK_EXPERIMENTS = [
    {
        "id": 1,
        "model": "LCCDE",
        "parameters": {"learning_rate": 0.01, "epochs": 10},
        "accuracy": 0.94,
        "date": "2025-10-20"
    },
    {
        "id": 2,
        "model": "LCCDE",
        "parameters": {"learning_rate": 0.001, "epochs": 25},
        "accuracy": 0.95,
        "date": "2025-10-21"
    }
]

# --- API ROUTES ---
# List the available ML-based IDS models (just LCCDE for now)
@app.route("/api/models", methods=["GET"])
def get_models():
    return jsonify({"models": AVAILABLE_MODELS})

# Get all the configurable parameters for the chosen model (again, just LCCDE for now)
@app.route("/api/models/<model_name>/parameters", methods=["GET"])
def get_model_parameters(model_name):
    params = MODEL_PARAMETERS.get(model_name)
    if not params:
        return jsonify({"error": "Model not found"}), 404
    return jsonify({"model": model_name, "default_parameters": params})


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
        lgb_params = validate_lgb_params(params.get("lgb_params"))
        xgb_params = validate_xgb_params(params.get("xgb_params"))
        cbt_params = validate_cbt_params(params.get("cbt_params"))

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
        return jsonify(make_json_safe(results))

    except Exception as e:
        import traceback
        print("ERROR in /train_lccde:", e)
        traceback.print_exc()  # full traceback in your terminal
        return jsonify({"error": str(e)}), 400

# Get a list of previous experiments
@app.route("/api/experiments", methods=["GET"])
def get_experiments():
    try:
        # query params
        model = request.args.get("model")
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))

        # Base query
        query = ModelRun.query

        # Filter by model
        if model:
            query = query.filter_by(model_name=model)

        # Filter by date range
        if start_date:
            query = query.filter(ModelRun.created_at >= start_date)

        if end_date:
            query = query.filter(ModelRun.created_at <= end_date)

        # Sorting + pagination
        query = query.order_by(ModelRun.created_at.desc())
        runs = query.limit(limit).offset(offset).all()

        experiments = [run.to_dict() for run in runs]

        return jsonify({
            "count": len(experiments),
            "results": experiments
        })

    except Exception as e:
        print("ERROR in GET /api/experiments:", e)
        return jsonify({"error": "Failed to retrieve experiments"}), 500


@app.route("/api/experiments", methods=["POST"])
def add_experiment():
    try:
        data = request.get_json()

        model_name  = data.get("model_name")
        params      = data.get("params")
        results     = data.get("results")
        duration_s  = data.get("duration_s")

        # Basic validation
        if not model_name or not params or not results:
            return jsonify({"error": "Missing required fields"}), 400

        # Create a new run using ModelRun
        new_run = ModelRun.create_run(
            model_name=model_name,
            params=params,
            results=results,
            duration_s=duration_s
        )

        return jsonify({
            "message": "Experiment saved successfully",
            "experiment": new_run.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        print("Error inserting experiment:", e)
        return jsonify({"error": "Failed to insert experiment"}), 500


# Get details for one experiment by ID
@app.route("/api/experiments/<int:run_id>", methods=["GET"])
def get_experiment(run_id):
    run = ModelRun.query.get(run_id)

    if not run:
        return jsonify({"error": "Experiment not found"}), 404

    return jsonify(run.to_dict())


@app.route("/api/datasets", methods=["GET"])
def get_datasets():
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))  # backend/
        dataset_dir = os.path.join(base_dir, "..", "src", "IDS-files", "datasets")

        files = [
            f for f in os.listdir(dataset_dir)
            if f.lower().endswith(".csv")
        ]

        return jsonify({"datasets": files})

    except Exception as e:
        print("Error in /api/datasets:", e)
        return jsonify({"error": "Could not load dataset list"}), 500




if __name__ == "__main__":
    app.run(host="localhost",port=5000, debug=True)