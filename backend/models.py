from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
from sqlalchemy.sql import func

db = SQLAlchemy()

class ModelRun(db.Model):
    __tablename__ = "model_runs"

    id = db.Column(db.Integer, primary_key=True)
    model_name = db.Column(db.String(64), nullable=False)
    params = db.Column(db.JSON, nullable=False)
    results = db.Column(db.JSON, nullable=False)
    duration_s = db.Column(db.Numeric(10, 3))
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(
        db.DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

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

    @staticmethod
    def normalize_metrics(results):
        if not isinstance(results, dict):
            return {}

        # Case 1: nested format => results["base"]["cb"]
        if "base" in results:
            cb = results.get("base", {}).get("cb", {})
            return {
                "accuracy": cb.get("accuracy"),
                "precision": cb.get("precision"),
                "recall": cb.get("recall"),
                "f1": cb.get("f1_weighted") or cb.get("f1")
            }

        # Case 2: already flat
        return {
            "accuracy": results.get("accuracy"),
            "precision": results.get("precision"),
            "recall": results.get("recall"),
            "f1": results.get("f1_weighted") or results.get("f1")
        }

    @classmethod
    def create_run(cls, model_name, params, results, duration_s):
        # Normalize here before saving
        normalized = cls.normalize_metrics(results)

        run = cls(
            model_name=model_name,
            params=params,
            results=normalized,
            duration_s=duration_s
        )

        db.session.add(run)
        db.session.commit()
        return run