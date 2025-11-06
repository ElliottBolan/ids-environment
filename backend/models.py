from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class ModelRun(db.Model):
    __tablename__ = "model_runs"

    id = db.Column(db.Integer, primary_key=True)
    model_name = db.Column(db.String(64), nullable=False)
    params = db.Column(db.JSON, nullable=False)
    results = db.Column(db.JSON, nullable=False)
    duration_s = db.Column(db.Numeric(10, 3))
    created_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            "id": self.id,
            "model_name": self.model_name,
            "params": self.params,
            "results": self.results,
            "duration_s": str(self.duration_s) if self.duration_s else None,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M:%S") if self.updated_at else None,
        }
