from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone

db = SQLAlchemy()

class ModelRun(db.Model):
    __tablename__ = "model_runs"

    id = db.Column(db.Integer, primary_key=True)
    model_name = db.Column(db.String(64), nullable=False)
    params = db.Column(db.JSON, nullable=False)
    results = db.Column(db.JSON, nullable=False)
    duration_s = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

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
    
    @classmethod
    def create_run(cls, model_name, params, results, duration_s):
        run = cls(
            model_name=model_name,
            params=params,
            results=results,
            duration_s=duration_s
        )
        db.session.add(run)
        db.session.commit()
        return run

