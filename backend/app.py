from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
# Allow requests from the React dev server (and others) during development
CORS(app)

# TEST API
@app.route("/api/hello") # Use the '/api/...' prefix for all backend routes to make it clear they're API endpoints
def hello_world():
    return jsonify(message="Hello, World!") #Return JSON instead of HTML. It's easier for React to consume

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

MOCK_EXPERIMENTS = [
    {
        "id": 1,
        "model": "LCCDE",
        "parameters": {"learning_rate": 0.01, "epochs": 10},
        "accuracy": 0.94,
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

if __name__ == "__main__":
    app.run(port=5000, debug=True) # Port 5000 serves our APIs