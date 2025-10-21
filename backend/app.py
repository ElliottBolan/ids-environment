from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
# Allow requests from the React dev server (and others) during development
CORS(app)


@app.route("/api/hello") # Use the '/api/...' prefix for all backend routes to make it clear they're API endpoints
def hello_world():
    return jsonify(message="Hello, World!") #Return JSON instead of HTML. It's easier for React to consume

if __name__ == "__main__":
    app.run(port=5000, debug=True) # Port 5000 serves our APIs