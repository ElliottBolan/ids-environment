from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from LCCDE import train_lccde_pipeline
import os
import time
from models import db, ModelRun

# --- Load environment variables ---
load_dotenv()

app = Flask(__name__)
# Allow requests from the React dev server (and others) during development
CORS(app)

# --- Configure Database ---
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

MODEL_PARAMETERS = { # TBH I still don't have a good idea of all configurable parameters we need, so this map should be updated sometime later
    "LCCDE": {
        "learning_rate": 0.01,
        "batch_size": 32,
        "epochs": 10,
        "train_test_split": 0.8
    }
}

MOCK_EXPERIMENTS = [ # This would translate to a table in our MySQL DB
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

# --- API Routes ---

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

# Run training & testing for a model with the given parameters (test using Postman)
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

        results_safe = make_json_safe(results)

        # Prepare the DB payload
        """
        Recall our DB schema:
        1. id (auto-incremented)
        2. model_name (Just LCCDE for now, not NULL)
        3. params (JSON, cannot be NULL)
        4. results (JSON, cannot be NULL)
        5. duration_s (DECIMAL(10, 3), not NULL)
        6. created_at (timestamp)
        7. updated_at (timestamp)
        """

        db_model_name = "LCCDE"
        db_params = {
            "dataset": dataset,
            "label_col": label_col,
            "smote_strategy": smote_strategy,
            "random_state": random_state,
            "test_size": test_size,
            "lgb_params": lgb_params,
            "xgb_params": xgb_params,
            "cbt_params": cbt_params
        }

        # Try inserting into DB
        try:
            # Using our create_run classmethod in ModelRun
            new_run = ModelRun.create_run(
                model_name=db_model_name,
                params=db_params,
                results=results_safe,
                duration_s=results_safe.get('duration_s')
            )

            # Return both results and experiment metadata (id + timestamps)
            response = {
                "experiment": new_run.to_dict(),
                "results": results_safe
            }
            return jsonify(response), 201
        except Exception as db_e:
            # If DB insertion fails, still return results but include an error note
            db.session.rollback()
            print("DB insert failed after training:", db_e)
            return jsonify({
                "warning": "Training succeeded but saving to DB failed",
                "db_error": str(db_e),
                "results": results_safe
            }), 200

    except Exception as e:
        import traceback
        print("ERROR in /train_lccde:", e)
        traceback.print_exc()  # full traceback in your terminal
        return jsonify({"error": str(e)}), 400

# Get a list of previous experiments (again, will have to modify to account for a MySQL DB by querying all 'experiment' rows)
@app.route("/api/experiments", methods=["GET"])
def get_experiments():
    return jsonify({"experiments": MOCK_EXPERIMENTS})

@app.route("/api/experiments", methods=["POST"])
def add_experiment():
    try:
        data = request.get_json()

        # Extract and validate input
        model_name = data.get("model_name")
        params = data.get("params")
        results = data.get("results")
        duration_s = data.get("duration_s")

        # Basic input validation
        if not all([model_name, params, results]):
            return jsonify({"error": "Missing required fields"}), 400

        # Create a new instance of ModelRun
        #new_run = ModelRun(
            #model_name=model_name,
           # params=params,
          #  results=results,
         #   duration_s=duration_s
        #)

        # Add to database
        new_run = ModelRun.create_run(model_name, params, results, duration_s)
        #db.session.add(new_run)
        #db.session.commit()

        return jsonify(new_run.to_dict()), 201
        #return jsonify({
        #    "message": "Experiment inserted successfully!",
        #    "experiment_id": new_run.id
        #}), 201

    except Exception as e:
        db.session.rollback()
        print("Error inserting experiment:", e)
        return jsonify({"error": "Failed to insert experiment"}), 500

# Get details for one experiment by ID (Integrate with MySQL DB once that's up through a query by ID)
@app.route("/api/experiments/<int:exp_id>", methods=["GET"])
def get_experiment(exp_id):
    exp = next((e for e in MOCK_EXPERIMENTS if e["id"] == exp_id), None)
    if not exp:
        return jsonify({"error": "Experiment not found"}), 404
    return jsonify(exp)

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(port=5000, debug=True) # Port 5000 serves our APIs