import json
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy # type: ignore
from dotenv import load_dotenv # type: ignore
from LCCDE import train_lccde_pipeline
from sqlalchemy import cast, String
import os
import time
from models import db, ModelRun
from utils.confusion_matrix import generate_confusion_matrix_image
from utils.custom_models import list_models, register_model, run_model, find_model
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

# --- API ROUTES ---
# List the available ML-based IDS models (just LCCDE for now)
@app.route("/api/models", methods=["GET"])
def get_models():
    custom = list_models()
    names = [m.get("name") for m in custom]
    return jsonify({
        "models": [
            {"name": "LCCDE", "type": "ensemble", "hyperparams": MODEL_PARAMETERS["LCCDE"]}
        ] + custom,
        "names": ["LCCDE"] + names
    })

# Get all the configurable parameters for the chosen model (again, just LCCDE for now)
@app.route("/api/models/<model_name>/parameters", methods=["GET"])
def get_model_parameters(model_name):
    if model_name == "LCCDE":
        params = MODEL_PARAMETERS.get(model_name)
        return jsonify({"model": model_name, "default_parameters": params})

    custom = find_model(model_name)
    if not custom:
        return jsonify({"error": "Model not found"}), 404

    return jsonify({
        "model": custom.get("name"),
        "default_parameters": custom.get("hyperparams", {})
    })


@app.route("/api/models/upload", methods=["POST"])
def upload_model():
    try:
        if "file" not in request.files:
            return jsonify({"error": "File is required"}), 400

        file = request.files["file"]
        name = request.form.get("name") or os.path.splitext(file.filename)[0]
        hyper_raw = request.form.get("hyperparams")
        hyperparams = json.loads(hyper_raw) if hyper_raw else {}

        # Save upload to disk
        from utils.custom_models import MODELS_DIR, _slugify

        slug = _slugify(name)
        dest_dir = MODELS_DIR / slug
        dest_dir.mkdir(parents=True, exist_ok=True)
        source_path = dest_dir / file.filename
        file.save(str(source_path))

        meta = register_model(name, source_path, hyperparams)

        return jsonify({"message": "Model uploaded", "model": meta})
    except Exception as e:
        print("Upload failed:", e)
        return jsonify({"error": str(e)}), 400


def execute_lccde(payload: dict):
    dataset = payload.get("dataset", "CICIDS2017_sample_km.csv")
    label_col = payload.get("label_col", "Label")
    smote_strategy = payload.get("smote_strategy", {2:1000, 4:1000})
    random_state = payload.get("random_state", 0)
    test_size = payload.get("test_size", 0.2)
    lgb_params = validate_lgb_params(payload.get("lgb_params"))
    xgb_params = validate_xgb_params(payload.get("xgb_params"))
    cbt_params = validate_cbt_params(payload.get("cbt_params"))

    if isinstance(smote_strategy, dict):
        smote_strategy = {int(k): v for k, v in smote_strategy.items()}

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
    return results


@app.route("/train_lccde", methods=["POST"])
def train_lccde():
    try:
        payload = request.get_json() or {}
        results = execute_lccde(payload)
        return jsonify(make_json_safe(results))
    except Exception as e:
        import traceback
        print("ERROR in /train_lccde:", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400

# Get a list of previous experiments
@app.route("/api/experiments", methods=["GET"])
def get_experiments():
    try:
        model = request.args.get("model")
        run_id = request.args.get("run_id")
        dataset = request.args.get("dataset")
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        limit = int(request.args.get("limit", 50))
        offset = int(request.args.get("offset", 0))

        query = ModelRun.query

        # Model filter
        if model:
            query = query.filter_by(model_name=model)

        # Dataset filter (JSON field)
        if dataset:
            query = query.filter(
                cast(ModelRun.params["dataset"], String) == dataset
            )

        # Run ID
        if run_id:
            query = query.filter_by(id=run_id)

        # Dates
        if start_date:
            query = query.filter(ModelRun.created_at >= start_date)

        if end_date:
            query = query.filter(ModelRun.created_at <= end_date)

        query = query.order_by(ModelRun.created_at.desc())
        runs = query.limit(limit).offset(offset).all()

        return jsonify({
            "count": len(runs),
            "results": [r.to_dict() for r in runs]
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
        raw_results = data.get("results")
        normalized = ModelRun.normalize_metrics(raw_results)
        duration_s  = data.get("duration_s")

        # Basic validation
        if not model_name or not params or not normalized:
            return jsonify({"error": "Missing required fields"}), 400

        # Create a new run using ModelRun
        new_run = ModelRun.create_run(
            model_name=model_name,
            params=params,
            results=normalized,
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


@app.route("/train_model", methods=["POST"])
def train_model():
    try:
        data = request.get_json() or {}
        model_name = data.get("model_name", "LCCDE")
        dataset = data.get("dataset", "CICIDS2017_sample_km.csv")

        if model_name == "LCCDE":
            results = execute_lccde(data)
            payload_params = {
                "dataset": dataset,
                "lgb_params": data.get("lgb_params"),
                "xgb_params": data.get("xgb_params"),
                "cbt_params": data.get("cbt_params"),
            }
            run = ModelRun.create_run("LCCDE", payload_params, results.get("lccde"), results.get("duration_s"))
            return jsonify({
                "model": "LCCDE",
                "metrics": make_json_safe(results.get("lccde", {})),
                "duration_s": results.get("duration_s"),
                "raw": make_json_safe(results),
                "run_id": run.id,
                "created_at": run.created_at.strftime("%Y-%m-%d %H:%M:%S") if run.created_at else None,
            })

        # Custom model execution
        params = data.get("params") or {}
        start = time.time()
        raw_results = run_model(model_name, dataset, params)
        duration_s = round(time.time() - start, 3)

        normalized = ModelRun.normalize_metrics(raw_results)
        if not normalized:
            raise ValueError("Custom model must return metrics with accuracy/precision/recall/f1")

        run = ModelRun.create_run(model_name, {"dataset": dataset, **params}, normalized, duration_s)

        return jsonify({
            "model": model_name,
            "metrics": make_json_safe(normalized),
            "duration_s": duration_s,
            "raw": make_json_safe(raw_results),
            "run_id": run.id,
            "created_at": run.created_at.strftime("%Y-%m-%d %H:%M:%S") if run.created_at else None,
        })

    except Exception as e:
        import traceback
        print("ERROR in /train_model:", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 400


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

@app.route("/api/confusion/<int:run_id>")
def get_confusion_matrix(run_id):
    run = ModelRun.query.get(run_id)

    if not run:
        return jsonify({"error": "Experiment not found"}), 404

    results = run.results or {}

    # Try all known structures
    report = None

    # Case 1: nested (base/cb/classification_report)
    try:
        report = results["base"]["cb"].get("classification_report")
    except:
        pass

    # Case 2: direct classification_report
    if not report:
        report = results.get("classification_report")

    # Case 3: missing report → no confusion matrix available
    if not report:
        return jsonify({"error": "No classification report found for this experiment"}), 400

    # Proceed generating image
    out_path = f"/tmp/cm_{run_id}.png"
    generate_confusion_matrix_image(report, out_path)

    return send_file(out_path, mimetype="image/png")




if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(port=5000, debug=True) # Port 5000 serves our APIs