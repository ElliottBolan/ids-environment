from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os
import time
from models import db, ModelRun

# --- Load environment variables ---
load_dotenv()

app = Flask(__name__)
CORS(app)

# --- Configure Database ---
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "idsml")

app.config["SQLALCHEMY_DATABASE_URI"] = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app) # Initialize db with the Flask app

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
@app.route("/api/train", methods=["POST"])
def train_model():
    data = request.json
    model = data.get("model")
    params = data.get("parameters", {})
    dataset = data.get("dataset", "unknown.csv") # Will likely only be using the CICIDS2017 dataset

    # Fake "training" simulation for the time being
    print(f"Training {model} with parameters {params} on {dataset}")
    time.sleep(2)  # simulate training time

    # Return mock results (we will have to integrate the logic from LCCDE_IDS_GlobeCom22.ipynb, but we just need the structure for now)
    results = {
        "model": model,
        "parameters": params,
        "accuracy": round(0.9 + 0.05 * (time.time() % 1), 3),
        "precision": 0.89,
        "recall": 0.88,
        "f1_score": 0.885,
        "dataset": dataset,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    # Here, we'll have to insert these results into our DB following our schema

    return jsonify(results)

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
        new_run = ModelRun(
            model_name=model_name,
            params=params,
            results=results,
            duration_s=duration_s
        )

        # Add to database
        db.session.add(new_run)
        db.session.commit()

        return jsonify({
            "message": "Experiment inserted successfully!",
            "experiment_id": new_run.id
        }), 201

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