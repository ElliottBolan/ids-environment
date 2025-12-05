"""Custom model registry and execution helpers.

This module manages user-uploaded models (either .py or .ipynb). Notebook
uploads are converted to Python using a lightweight extractor so they can be
imported and executed. Each model is expected to expose a ``train`` function
with the signature ``train(dataset_path: str, params: dict) -> dict`` returning
metrics such as accuracy/precision/recall/f1. Returned structures are passed
through to the caller; upstream routes handle normalization.
"""

from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import shutil
import ast

import nbformat  # type: ignore

try:
	from LCCDE import resolve_dataset_path
except Exception:
	resolve_dataset_path = None  # type: ignore


ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "uploads" / "models"
REGISTRY_PATH = MODELS_DIR / "registry.json"


def _slugify(name: str) -> str:
	import re

	slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip()).strip("-")
	return slug.lower() or "model"


def load_registry() -> List[Dict[str, Any]]:
	if not REGISTRY_PATH.exists():
		return []
	try:
		return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
	except Exception:
		return []


def save_registry(registry: List[Dict[str, Any]]) -> None:
	REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
	REGISTRY_PATH.write_text(json.dumps(registry, indent=2), encoding="utf-8")


def list_models() -> List[Dict[str, Any]]:
	registry = load_registry()
	updated = False
	for m in registry:
		existing = m.get("hyperparams") or {}
		if (not existing or len(existing) < 2) and m.get("entry_file"):
			inferred = _infer_hyperparams(Path(m["entry_file"]))
			if inferred:
				m["hyperparams"] = inferred
				updated = True
	if updated:
		save_registry(registry)
	return registry


def find_model(name: str) -> Dict[str, Any] | None:
	for m in load_registry():
		if m.get("name") == name or m.get("slug") == name:
			return m
	return None


def _clean_notebook_code(src: str) -> str:
	cleaned_lines: List[str] = []
	for line in src.splitlines():
		stripped = line.lstrip()
		if not stripped:
			cleaned_lines.append(line)
			continue
		if stripped.startswith("%%") or stripped.startswith("%"):
			cleaned_lines.append(f"# [REMOVED IPYTHON MAGIC] {stripped}")
			continue
		if stripped.startswith("!"):
			cleaned_lines.append(f"# [REMOVED SHELL ESCAPE] {stripped}")
			continue
		if "get_ipython(" in stripped:
			cleaned_lines.append(f"# [REMOVED IPYTHON CALL] {stripped}")
			continue
		cleaned_lines.append(line)
	return "\n".join(cleaned_lines)


def convert_notebook_to_py(nb_path: Path, out_path: Path) -> None:
	with open(nb_path, "r", encoding="utf-8") as f:
		notebook = nbformat.read(f, as_version=4)

	code_cells: List[str] = []
	for cell in notebook.cells:
		if cell.cell_type != "code":
			continue
		source = cell.source if isinstance(cell.source, str) else "".join(cell.source)
		code_cells.append(_clean_notebook_code(source))

	header = (
		"# -*- coding: utf-8 -*-\n"
		"# Auto-generated from notebook upload.\n"
		f"# Source: {nb_path.name}\n\n"
	)

	out_path.parent.mkdir(parents=True, exist_ok=True)
	generated = header + "\n\n".join(code_cells)
	out_path.write_text(generated, encoding="utf-8")

	# Attempt to infer hyperparameters and prepend DEFAULT_PARAMS if found
	inferred = _infer_hyperparams(out_path)
	if inferred:
		existing_src = out_path.read_text(encoding="utf-8")
		if "DEFAULT_PARAMS" not in existing_src:
			prefix = "# Auto-detected default hyperparameters\nDEFAULT_PARAMS = " + json.dumps(inferred, indent=2) + "\n\n"
			out_path.write_text(prefix + existing_src, encoding="utf-8")


def _literal_or_none(node: ast.AST) -> Optional[Any]:
	try:
		return ast.literal_eval(node)
	except Exception:
		return None


def _infer_hyperparams(entry_path: Path) -> Dict[str, Any]:
	"""Heuristically pull default hyperparameters from a custom model file.

	Priority:
	1) Top-level dict assigned to DEFAULT_PARAMS / DEFAULT_HYPERPARAMS / HYPERPARAMS / PARAMS.
	2) First constructor call with literal keyword args (e.g., XGBClassifier(...)).
	"""
	try:
		src = entry_path.read_text(encoding="utf-8")
		tree = ast.parse(src)
		target_names = {"DEFAULT_PARAMS", "DEFAULT_HYPERPARAMS", "HYPERPARAMS", "PARAMS"}

		for node in tree.body:
			if isinstance(node, ast.Assign):
				for target in node.targets:
					if isinstance(target, ast.Name) and target.id in target_names:
						val = _literal_or_none(node.value)
						if isinstance(val, dict):
							return val
			if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
				if node.target.id in target_names:
					val = _literal_or_none(node.value)
					if isinstance(val, dict):
						return val

			# Fallback: scan estimator constructor calls and merge keyword args
			allow_funcs = {
				"XGBClassifier",
				"RandomForestClassifier",
				"ExtraTreesClassifier",
				"DecisionTreeClassifier",
				"CatBoostClassifier",
				"LGBMClassifier",
				"SVC",
				"KNeighborsClassifier",
				"LogisticRegression",
			}

			def _func_name(call: ast.Call) -> str:
				if isinstance(call.func, ast.Name):
					return call.func.id
				if isinstance(call.func, ast.Attribute):
					return call.func.attr
				return ""

			merged_params: Dict[str, Any] = {}
			for node in ast.walk(tree):
				if isinstance(node, ast.Call) and getattr(node, "keywords", None):
					fn = _func_name(node)
					if not (fn.endswith("Classifier") or fn in allow_funcs):
						continue
					tmp: Dict[str, Any] = {}
					for kw in node.keywords:
						if not isinstance(kw, ast.keyword) or kw.arg is None:
							continue
						val = _literal_or_none(kw.value)
						if val is not None:
							tmp[kw.arg] = val
					if tmp and not (len(tmp) == 1 and "axis" in tmp):
						merged_params.update(tmp)
			if len(merged_params) >= 2:
				return merged_params
	except Exception:
		return {}
	return {}


def register_model(name: str, source_path: Path, hyperparams: Dict[str, Any] | None = None) -> Dict[str, Any]:
	"""Register a new model and return its metadata."""

	hyperparams = hyperparams or {}
	slug = _slugify(name or source_path.stem)
	dest_dir = MODELS_DIR / slug
	dest_dir.mkdir(parents=True, exist_ok=True)

	saved_source = dest_dir / source_path.name
	if source_path != saved_source:
		saved_source.write_bytes(source_path.read_bytes())

	entry_file = saved_source
	if saved_source.suffix.lower() == ".ipynb":
		entry_file = dest_dir / f"{slug}.py"
		convert_notebook_to_py(saved_source, entry_file)
	else:
		entry_file = saved_source

	if not hyperparams:
		hyperparams = _infer_hyperparams(entry_file)

	registry = load_registry()
	model_id = (max([m.get("id", 0) for m in registry]) + 1) if registry else 1

	meta = {
		"id": model_id,
		"name": name,
		"slug": slug,
		"type": "custom",
		"source_file": str(saved_source),
		"entry_file": str(entry_file),
		"hyperparams": hyperparams,
	}

	registry.append(meta)
	save_registry(registry)
	return meta


def run_model(model_name: str, dataset: str, params: Dict[str, Any] | None = None) -> Dict[str, Any]:
	params = params or {}
	model = find_model(model_name)
	if not model:
		raise ValueError(f"Model '{model_name}' not found")

	entry_path = Path(model["entry_file"])
	if not entry_path.exists():
		raise FileNotFoundError(f"Entry file missing: {entry_path}")

	def _ensure_local_dataset(ds_name: str) -> str:
		"""Make dataset available under ./data/<file>, resolving from known dataset roots, and copy to both backend/data and CWD/data."""
		name = Path(ds_name).name
		source_candidates = []
		if resolve_dataset_path:
			try:
				source_candidates.append(Path(resolve_dataset_path(name)))
			except Exception:
				pass
		source_candidates.append(Path(ds_name))
		source_candidates.append((ROOT / "src" / "IDS-files" / "datasets" / name).resolve())
		source = next((p for p in source_candidates if p.exists()), Path(ds_name))
		backend_dir = ROOT / "data"
		cwd_dir = Path.cwd() / "data"
		backend_dir.mkdir(parents=True, exist_ok=True)
		cwd_dir.mkdir(parents=True, exist_ok=True)
		backend_dest = backend_dir / name
		cwd_dest = cwd_dir / name
		if source.exists():
			if not backend_dest.exists():
				shutil.copy2(source, backend_dest)
			if not cwd_dest.exists():
				shutil.copy2(source, cwd_dest)
		return str(cwd_dest if cwd_dest.exists() else backend_dest if backend_dest.exists() else source)

	# Ensure dataset file exists before import in case the module reads it at import time
	ds_path_import = _ensure_local_dataset(dataset)

	# Refresh hyperparams if registry has none (e.g., older uploads)
	if not model.get("hyperparams"):
		inferred = _infer_hyperparams(entry_path)
		if inferred:
			model["hyperparams"] = inferred
			save_registry(load_registry())

	spec = importlib.util.spec_from_file_location(f"custom_{model['slug']}", entry_path)
	if spec is None or spec.loader is None:
		raise ImportError(f"Could not load module from {entry_path}")

	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)  # type: ignore

	if not hasattr(module, "train"):
		raise AttributeError(f"Custom model '{model_name}' must define a train(dataset_path, params) function")

	ds_path = ds_path_import

	return getattr(module, "train")(ds_path, params)


__all__ = [
	"list_models",
	"find_model",
	"register_model",
	"run_model",
	"load_registry",
	"save_registry",
]
