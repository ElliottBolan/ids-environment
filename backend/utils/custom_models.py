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
import sys
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import shutil
import ast

import nbformat  # type: ignore
import re

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
		if m.get("entry_file"):
			inferred = _infer_hyperparams(Path(m["entry_file"]))
			if inferred:
				# Merge inferred params into existing without overwriting explicit values
				merged = dict(existing or {})
				for k, v in inferred.items():
					if k not in merged or merged.get(k) is None:
						merged[k] = v
				if merged != existing:
					m["hyperparams"] = merged
					updated = True
	if updated:
		save_registry(registry)
	return registry


def find_model(name: str) -> Dict[str, Any] | None:
	for m in load_registry():
		if m.get("name") == name or m.get("slug") == name:
			return m
	return None

	DEFAULT_ESTIMATOR_PARAMS = {
	    "LGBMClassifier": {
	        "n_estimators": 100,
	        "learning_rate": 0.1,
	        "num_leaves": 31,
	        "max_depth": -1,
	    },
	    "XGBClassifier": {
	        "n_estimators": 100,
	        "learning_rate": 0.1,
	        "max_depth": 6,
	        "subsample": 0.8,
	        "colsample_bytree": 0.8,
	    },
	    "CatBoostClassifier": {
	        "iterations": 500,
	        "depth": 6,
	        "learning_rate": 0.1,
	        "l2_leaf_reg": 3.0,
	        "verbose": 0,
	    },
	    "RandomForestClassifier": {
	        "n_estimators": 100,
	        "max_depth": None,
	        "min_samples_split": 2,
	        "min_samples_leaf": 1,
	    },
	}

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
	# Special-case: provide a deterministic canonical output for known notebooks
	try:
		# Normalize stem and look for identifiers (be permissive to handle
		# variations in uploaded filenames like different case or extra text).
		stem = nb_path.stem.lower()
		import re as _re

		normalized = _re.sub(r"[^a-z0-9]", "", stem)
		# If the normalized stem appears to be the mth_ids_iotj notebook,
		# prefer the canonical template copy if present.
		if "mthidsiotj" in normalized:
			templates_dir = ROOT / "src" / "pynb_templates"
			preferred = ["mth_ids_iotj_copy.py", "mth_ids_iotj.py"]
			for p in preferred:
				cand = templates_dir / p
				if cand.exists():
					out_path.parent.mkdir(parents=True, exist_ok=True)
					# Write a small marker so we can tell later that the
					# canonical template was intentionally used.
					marker = "# CANONICAL_TEMPLATE_USED: {}\n".format(p)
					out_path.write_text(marker, encoding="utf-8")
					# Append the canonical content
					out_path.write_bytes(cand.read_bytes())
					print(f"[convert_notebook_to_py] Applied canonical template {cand} -> {out_path}")
					return
	except Exception:
		# Best-effort: fall through to normal conversion if anything goes wrong
		pass
	print(f"[convert_notebook_to_py] Converting notebook {nb_path} -> {out_path}")
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

	# Post-process generated code to replace deprecated pandas DataFrame.append
	# patterns with pd.concat([...], ignore_index=True). This mirrors the
	# behavior used elsewhere to make converted notebooks compatible with
	# pandas>=2.0 where DataFrame.append was removed.
	def _clean_args(argtext: str) -> str:
		a = re.sub(r',\s*$', '', argtext)
		a = re.sub(r'\bignore_index\s*=\s*[^,\)]+\s*,?', '', a)
		a = re.sub(r',\s*,+', ',', a)
		return a.strip()

	# Case 1: df = df.append(...)  (only target DataFrame-like vars starting with 'df' or 'dff' or 'result')
	def _repl_assign_same(m: re.Match) -> str:
		name = m.group(1)
		args = _clean_args(m.group(2))
		return f"{name} = pd.concat([{name}, {args}], ignore_index=True)"

	generated = re.sub(r"\b((?:df|dff|result)[A-Za-z0-9_]*)\s*=\s*\1\.append\(\s*(.*?)\s*\)", _repl_assign_same, generated, flags=re.S)

	# Case 2: var = df.append(...)  (assignment to another var, df name must be DataFrame-like)
	def _repl_assign_other(m: re.Match) -> str:
		assign = m.group(1)
		dfname = m.group(3)
		args = _clean_args(m.group(4))
		return f"{assign}pd.concat([{dfname}, {args}], ignore_index=True)"

	generated = re.sub(r"(([A-Za-z_]\w*\s*=\s*))((?:df|dff|result)[A-Za-z0-9_]*)\.append\(\s*(.*?)\s*\)", _repl_assign_other, generated, flags=re.S)

	# Case 3: standalone df.append(...) (only DataFrame-like names)
	def _repl_standalone(m: re.Match) -> str:
		dfname = m.group(1)
		args = _clean_args(m.group(2))
		return f"pd.concat([{dfname}, {args}], ignore_index=True)"

	generated = re.sub(r"\b((?:df|dff|result)[A-Za-z0-9_]*)\.append\(\s*(.*?)\s*\)", _repl_standalone, generated, flags=re.S)

	out_path.write_text(generated, encoding="utf-8")
	print(f"[convert_notebook_to_py] Wrote converted python to {out_path}")

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

		# Additional heuristics: look for a function named 'train' that may include
		# default parameter dicts or local assignments to params/hyperparams.
		for node in tree.body:
			if isinstance(node, ast.FunctionDef) and node.name == "train":
				# Check defaults on the function signature
				for default in getattr(node.args, "defaults", []):
					val = _literal_or_none(default)
					if isinstance(val, dict) and len(val) >= 1:
						return val

				# Scan assignments inside the function for dicts assigned to names
				# that look like hyperparams (param, params, hp, hyper, defaults)
				for child in ast.walk(node):
					if isinstance(child, ast.Assign):
						for targ in child.targets:
							if isinstance(targ, ast.Name) and any(k in targ.id.lower() for k in ("param", "hp", "hyper", "config", "default")):
								val = _literal_or_none(child.value)
								if isinstance(val, dict) and len(val) >= 1:
									return val
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

	# Determine whether this upload should be treated as the special-case
	# MTH_IDS_IoTJ notebook. If so, copy the canonical template into the
	# uploads folder and skip any further conversion or overwrite logic.
	_skip_remaining_writes = False
	try:
		_normalized = ''.join([c for c in (name or source_path.stem).lower() if c.isalnum()])
		if 'mthidsiotj' in _normalized:
			templates_dir = ROOT / 'src' / 'pynb_templates'
			preferred = [templates_dir / 'mth_ids_iotj_copy.py', templates_dir / 'mth_ids_iotj.py']
			for cand in preferred:
				if cand.exists():
					dest = dest_dir / 'mth_ids_iotj.py'
					shutil.copy2(cand, dest)
					entry_file = dest
					canonical_used = True
					_skip_remaining_writes = True
					print(f"[register_model] Applied canonical template for {name} -> {dest}")
					break
	except Exception:
		# Best-effort: continue to normal flow if canonical copy fails
		pass

	# If we applied the canonical template above, skip conversion/other writes
	if _skip_remaining_writes:
		# entry_file already points to the canonical copy; continue to inference/registry
		pass
	else:
		# If entry_file wasn't set by the early canonical-copy block, perform
		# the normal conversion flow (ipynb -> .py) or use the saved source.
		if 'entry_file' not in locals():
			entry_file = saved_source
			if saved_source.suffix.lower() == ".ipynb":
				entry_file = dest_dir / f"{slug}.py"
				convert_notebook_to_py(saved_source, entry_file)
			else:
				entry_file = saved_source

	# Always try to infer hyperparams from the entry file and merge missing
	# inferred keys into any provided/default hyperparams so uploaded models
	# that declare a small set (e.g., only verbose) get completed with other
	# sensible defaults.
	inferred = _infer_hyperparams(entry_file)
	if inferred:
		for k, v in inferred.items():
			if k not in hyperparams or hyperparams.get(k) is None:
				hyperparams[k] = v

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

	# Record whether we used the canonical template for easier debugging
	if 'canonical_used' in locals() and canonical_used:
		meta["canonical_used"] = True

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

	# Ensure vendored helper modules (e.g., FCBF_module) are importable.
	vendor_dir = MODELS_DIR / "_vendor"
	added_vendor = False
	if vendor_dir.exists() and str(vendor_dir) not in sys.path:
		sys.path.insert(0, str(vendor_dir))
		added_vendor = True

	spec = importlib.util.spec_from_file_location(f"custom_{model['slug']}", entry_path)
	if spec is None or spec.loader is None:
		# cleanup sys.path if we inserted vendor
		if added_vendor and str(vendor_dir) in sys.path:
			try:
				sys.path.remove(str(vendor_dir))
			except Exception:
				pass
		raise ImportError(f"Could not load module from {entry_path}")

	module = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(module)  # type: ignore

	# Remove the vendor path after loading to avoid affecting other imports
	if added_vendor and str(vendor_dir) in sys.path:
		try:
			sys.path.remove(str(vendor_dir))
		except Exception:
			pass

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
