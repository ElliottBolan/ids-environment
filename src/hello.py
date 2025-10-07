from flask import Flask
from flask_cors import CORS
from markupsafe import escape

app = Flask(__name__)
# Allow requests from the React dev server (and others) during development
CORS(app)


@app.route("/hello")
def hello_world():
    return "<p>Hello, World!</p>"

if __name__ == "__main__":
    app.run(port=5000, debug=True)