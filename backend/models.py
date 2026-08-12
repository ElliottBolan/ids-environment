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
        # include any stored confusion matrices for this run
        try:
            cms = [c.to_dict() for c in ConfusionMatrix.query.filter_by(run_id=self.id).all()]
        except Exception:
            cms = []

        return {
            "id": self.id,
            "model_name": self.model_name,
            "params": self.params,
            "results": self.results,
            "duration_s": str(self.duration_s) if self.duration_s else None,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M:%S") if self.updated_at else None,
            "confusion_matrices": cms,
        }

    @property
    def confusion_matrices(self):
        return ConfusionMatrix.query.filter_by(run_id=self.id).all()

    @staticmethod
    def normalize_metrics(results):
        if not isinstance(results, dict):
            return {}

        # Case 1: nested format => results["base"]["cb"]
        if "base" in results:
            cb = results.get("base", {}).get("cb", {})
            normalized = {
                "accuracy": cb.get("accuracy"),
                "precision": cb.get("precision"),
                "recall": cb.get("recall"),
                "f1": cb.get("f1_weighted") or cb.get("f1")
            }
        else:
            # Case 2: already flat
            normalized = {
                "accuracy": results.get("accuracy"),
                "precision": results.get("precision"),
                "recall": results.get("recall"),
                "f1": results.get("f1_weighted") or results.get("f1")
            }

        # Preserve the per-model breakdown when the caller supplied one. A run
        # like LCCDE produces several result sets (three base learners plus the
        # ensemble) and flattening would otherwise discard all but one.
        per_model = results.get("per_model")
        if isinstance(per_model, list) and per_model:
            normalized["per_model"] = per_model

        return normalized

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

    @staticmethod
    def _confusion_report(entry):
        """Build the stored payload for one model's confusion matrix.

        Keeps the real matrix when training recorded one and the classification
        report alongside it, so the renderer never has to approximate.
        """
        if not isinstance(entry, dict):
            return None

        matrix = entry.get("confusion_matrix")
        report = entry.get("classification_report")
        if not matrix and not report:
            return None

        payload = {}
        if isinstance(matrix, dict):
            payload.update(matrix)
        if report:
            payload["classification_report"] = report
        return payload or None

    @classmethod
    def create_run_with_raw(cls, model_name, params, results, duration_s, raw_results=None):
        """Create a run storing normalized results as `results` while optionally
        persisting any raw classification reports into the confusion_matrices table.
        """
        run = cls.create_run(model_name, params, results, duration_s)

        # Persist a confusion matrix for every result set the run produced.
        try:
            if raw_results and isinstance(raw_results, dict):
                # The ensemble's own results (LCCDE structure).
                ensemble = cls._confusion_report(raw_results.get("lccde"))
                if ensemble:
                    ConfusionMatrix.create_for_run(run.id, ensemble, source="lccde")

                # Each base learner trained inside the ensemble.
                base = raw_results.get("base") or {}
                for key in ("lg", "xg", "cb"):
                    report = cls._confusion_report(base.get(key))
                    if report:
                        ConfusionMatrix.create_for_run(run.id, report, source=key)

                # Custom models generally report a single top-level result set.
                top = cls._confusion_report(raw_results)
                if top:
                    ConfusionMatrix.create_for_run(run.id, top, source="top")
        except Exception as e:
            # Non-fatal: storing confusion matrices should not break run creation
            print("Failed to store confusion matrices:", e)
            db.session.rollback()

        return run


class ConfusionMatrix(db.Model):
    __tablename__ = "confusion_matrices"

    id = db.Column(db.Integer, primary_key=True)
    run_id = db.Column(db.Integer, db.ForeignKey('model_runs.id'), nullable=False)
    report = db.Column(db.JSON, nullable=False)
    source = db.Column(db.String(128))
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    @classmethod
    def create_for_run(cls, run_id, report, source=None):
        obj = cls(run_id=run_id, report=report, source=source)
        db.session.add(obj)
        db.session.commit()
        return obj

    def to_dict(self, include_report=False):
        # The full report (matrix + classification report) is large and the UI
        # fetches it as a rendered image, so it is omitted unless asked for.
        data = {
            "id": self.id,
            "run_id": self.run_id,
            "source": self.source,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else None,
        }
        if include_report:
            data["report"] = self.report
        return data