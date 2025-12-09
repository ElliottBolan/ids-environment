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
from utils.custom_models import (
    list_models,
    register_model,
    run_model,
    find_model,
    load_registry,
    save_registry,
    MODELS_DIR,
    _slugify,
)
from validation import (
    validate_lgb_params,
    validate_xgb_params,
    validate_cbt_params
)
import threading

# Simple global counter for running jobs (thread-safe)
RUNNING_JOBS = 0
RUNNING_LOCK = threading.Lock()
# Global cancellation event for signalling long-running runs to stop
CANCEL_EVENT = threading.Event()

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


@app.route("/api/models/<model_name>", methods=["DELETE"])
def delete_model(model_name):
    try:
        registry = load_registry()
        model = next((m for m in registry if m.get("name") == model_name or m.get("slug") == model_name), None)
        if not model:
            return jsonify({"error": "Model not found"}), 404

        # Remove registry entry
        registry = [m for m in registry if not (m.get("name") == model.get("name") and m.get("slug") == model.get("slug"))]
        save_registry(registry)

        # Delete model directory if present
        try:
            model_dir = MODELS_DIR / (model.get("slug") or _slugify(model.get("name") or model_name))
            if model_dir.exists() and model_dir.is_dir():
                import shutil

                shutil.rmtree(model_dir)
        except Exception:
            # Non-fatal: registry entry removed, but cleaning up files failed
            pass

        return jsonify({"message": "Model deleted"})
    except Exception as e:
        print("ERROR deleting model:", e)
        return jsonify({"error": str(e)}), 400


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
        canonical_flag = bool(meta.get("canonical_used", False))
        print(f"[upload_model] register_model returned canonical_used={canonical_flag} for '{name}'")

        return jsonify({"message": "Model uploaded", "model": meta, "canonical_used": canonical_flag})
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

    # Pass the global cancel event to the pipeline so it can be interrupted
    results = train_lccde_pipeline(
        file_path=dataset,
        label_col=label_col,
        smote_strategy=smote_strategy,
        random_state=random_state,
        test_size=test_size,
        lgb_params=lgb_params,
        xgb_params=xgb_params,
        cbt_params=cbt_params,
        cancel_event=CANCEL_EVENT,
    )
    return results


@app.route("/train_lccde", methods=["POST"])
def train_lccde():
    try:
        payload = request.get_json() or {}
        # mark running
        global RUNNING_JOBS
        with RUNNING_LOCK:
            RUNNING_JOBS += 1
        # Ensure any previous cancel flag is cleared before starting
        CANCEL_EVENT.clear()
        try:
            results = execute_lccde(payload)
            return jsonify(make_json_safe(results))
        finally:
            with RUNNING_LOCK:
                RUNNING_JOBS = max(0, RUNNING_JOBS - 1)
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
    # Expose global counter for running jobs
    global RUNNING_JOBS
    try:
        data = request.get_json() or {}
        model_name = data.get("model_name", "LCCDE")
        dataset = data.get("dataset", "CICIDS2017_sample_km.csv")

        if model_name == "LCCDE":
            # Mark running
            with RUNNING_LOCK:
                RUNNING_JOBS += 1
            # Ensure cancel flag cleared for this run
            CANCEL_EVENT.clear()
            try:
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
            finally:
                with RUNNING_LOCK:
                    RUNNING_JOBS = max(0, RUNNING_JOBS - 1)

        # Custom model execution
        params = data.get("params") or {}
        # Mark running
        with RUNNING_LOCK:
            RUNNING_JOBS += 1
        try:
            start = time.time()
            raw_results = run_model(model_name, dataset, params)
            duration_s = round(time.time() - start, 3)
        finally:
            with RUNNING_LOCK:
                RUNNING_JOBS = max(0, RUNNING_JOBS - 1)

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

        uploads_dir = os.path.join(dataset_dir, 'uploads')
        files = []
        if os.path.exists(dataset_dir):
            for f in os.listdir(dataset_dir):
                p = os.path.join(dataset_dir, f)
                if os.path.isfile(p) and f.lower().endswith('.csv'):
                    files.append(f)
        if os.path.exists(uploads_dir):
            for f in os.listdir(uploads_dir):
                p = os.path.join(uploads_dir, f)
                if os.path.isfile(p) and f.lower().endswith('.csv'):
                    # avoid duplicates
                    if f not in files:
                        files.append(f)

        # Also return explicit list of uploaded user files so frontend can
        # know which files are removable.
        upload_files = []
        if os.path.exists(uploads_dir):
            for f in os.listdir(uploads_dir):
                p = os.path.join(uploads_dir, f)
                if os.path.isfile(p) and f.lower().endswith('.csv'):
                    upload_files.append(f)

        return jsonify({"datasets": files, "uploads": upload_files})

    except Exception as e:
        print("Error in /api/datasets:", e)
        return jsonify({"error": "Could not load dataset list"}), 500


@app.route('/api/datasets/upload', methods=['POST'])
def upload_dataset():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'File is required'}), 400

        file = request.files['file']
        filename = file.filename or ''
        if not filename.lower().endswith('.csv'):
            return jsonify({'error': 'Only .csv files are allowed'}), 400

        from werkzeug.utils import secure_filename

        safe_name = secure_filename(filename)
        base_dir = os.path.dirname(os.path.abspath(__file__))
        dataset_dir = os.path.join(base_dir, '..', 'src', 'IDS-files', 'datasets')
        uploads_dir = os.path.join(dataset_dir, 'uploads')
        os.makedirs(uploads_dir, exist_ok=True)

        dest_path = os.path.abspath(os.path.join(uploads_dir, safe_name))
        # Ensure we don't allow path traversal outside the uploads folder
        if not dest_path.startswith(os.path.abspath(uploads_dir)):
            return jsonify({'error': 'Invalid filename'}), 400

        file.save(dest_path)
        return jsonify({'message': 'Uploaded', 'filename': safe_name})
    except Exception as e:
        print('ERROR in /api/datasets/upload:', e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/datasets/<path:filename>', methods=['DELETE'])
def delete_dataset(filename):
    try:
        # Only allow deleting CSV files inside the datasets directory
        if not filename.lower().endswith('.csv'):
            return jsonify({'error': 'Only .csv files can be deleted'}), 400

        from werkzeug.utils import secure_filename
        safe_name = secure_filename(filename)

        base_dir = os.path.dirname(os.path.abspath(__file__))
        dataset_dir = os.path.join(base_dir, '..', 'src', 'IDS-files', 'datasets')
        uploads_dir = os.path.join(dataset_dir, 'uploads')
        target = os.path.abspath(os.path.join(uploads_dir, safe_name))
        # Only allow deleting files uploaded by users (in uploads_dir)
        if not target.startswith(os.path.abspath(uploads_dir)):
            return jsonify({'error': 'Invalid filename'}), 400

        if not os.path.exists(target):
            return jsonify({'error': 'File not found'}), 404

        try:
            os.remove(target)
        except PermissionError:
            return jsonify({'error': 'Permission denied'}), 403

        return jsonify({'message': 'Deleted', 'filename': safe_name})
    except Exception as e:
        print('ERROR in DELETE /api/datasets:', e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/datasets/download', methods=['GET'])
def download_datasets():
    try:
        files = request.args.get('files')
        if not files:
            return jsonify({'error': 'No files specified'}), 400
        names = [n for n in files.split(',') if n]
        base_dir = os.path.dirname(os.path.abspath(__file__))
        dataset_dir = os.path.join(base_dir, '..', 'src', 'IDS-files', 'datasets')
        uploads_dir = os.path.join(dataset_dir, 'uploads')

        import zipfile
        import tempfile

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        try:
            with zipfile.ZipFile(tmp.name, 'w', zipfile.ZIP_DEFLATED) as zf:
                for name in names:
                    safe = os.path.basename(name)
                    # prefer uploads_dir, fallback to dataset_dir
                    p1 = os.path.abspath(os.path.join(uploads_dir, safe))
                    p2 = os.path.abspath(os.path.join(dataset_dir, safe))
                    if os.path.exists(p1) and p1.startswith(os.path.abspath(uploads_dir)):
                        zf.write(p1, arcname=safe)
                    elif os.path.exists(p2) and p2.startswith(os.path.abspath(dataset_dir)):
                        zf.write(p2, arcname=safe)
                    else:
                        # skip missing files
                        continue
            return send_file(tmp.name, as_attachment=True, download_name='datasets.zip')
        finally:
            try:
                pass
            except Exception:
                pass
    except Exception as e:
        print('ERROR in /api/datasets/download:', e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/cancel', methods=['POST'])
def api_cancel():
    try:
        CANCEL_EVENT.set()
        return jsonify({'message': 'Cancellation requested'})
    except Exception as e:
        print('ERROR in /api/cancel:', e)
        return jsonify({'error': str(e)}), 500


@app.route("/api/running", methods=["GET"])
def api_running():
    """Return whether any model runs are currently in progress."""
    try:
        with RUNNING_LOCK:
            running = RUNNING_JOBS > 0
        return jsonify({"running": running})
    except Exception as e:
        print("Error in /api/running:", e)
        return jsonify({"running": False}), 500

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