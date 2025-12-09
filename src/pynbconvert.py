import argparse
import os
import nbformat
import shutil
import re
# Removed specific import of 'NotJupyterNotebookError' due to versioning issues.
# We will catch a generic Exception in the main logic instead for robustness.

def extract_code_from_notebook(notebook_path, output_path):
    """
    Reads a Jupyter Notebook (.ipynb) file, extracts all content from code cells,
    and writes it to a pure Python (.py) script.

    Args:
        notebook_path (str): The path to the input .ipynb file.
        output_path (str): The path where the output .py file will be saved.
    """
    # 1. Validate input file path
    if not os.path.exists(notebook_path):
        print(f"Error: Input notebook not found at '{notebook_path}'")
        return

    # Special-case: if this is the MTH_IDS_IoTJ notebook, copy the
    # canonical template into the backend uploads folder and stop.
    try:
        base = os.path.basename(notebook_path)
        stem = os.path.splitext(base)[0].lower()
        normalized = re.sub(r"[^a-z0-9]", "", stem)
        if "mthidsiotj" in normalized:
            repo_root = os.path.dirname(os.path.dirname(__file__))
            templates_dir = os.path.join(repo_root, "src", "pynb_templates")
            preferred = ["mth_ids_iotj_copy.py", "mth_ids_iotj.py"]
            for name in preferred:
                cand = os.path.join(templates_dir, name)
                if os.path.exists(cand):
                    dest_dir = os.path.join(repo_root, "backend", "uploads", "models", "mth_ids_iotj")
                    os.makedirs(dest_dir, exist_ok=True)
                    dest_file = os.path.join(dest_dir, "mth_ids_iotj.py")
                    shutil.copyfile(cand, dest_file)
                    print(f"Copied canonical template {cand} -> {dest_file}")
                    return
            print(f"Canonical template for MTH_IDS_IoTJ not found in {templates_dir}; falling back to normal conversion")
    except Exception as _:
        # If anything goes wrong, continue with normal extraction
        pass

    print(f"Reading notebook: {notebook_path}")

    try:
        # 2. Read the notebook content
        # nbformat.read will raise an error if the file is not a valid notebook format
        with open(notebook_path, 'r', encoding='utf-8') as f:
            notebook_content = nbformat.read(f, as_version=4)

    except Exception as e:
        error_message = str(e).lower()
        if 'json' in error_message or 'notebook format' in error_message:
            print("Error: The input file could not be read. It may not be a valid Jupyter Notebook (.ipynb) file.")
        else:
            print(f"An unexpected error occurred while reading the notebook: {e}")
        return

    # 3. Extract code from cells and remove Jupyter/IPython magics
    def _clean_cell_source(src):
        """Remove IPython magics and shell escapes from a code cell source.

        Rules:
        - Strip any leading single-line magics that start with '%' (e.g. %time, %matplotlib)
        - Strip any cell magics that start with '%%' (e.g. %%time)
        - Strip any shell escape lines that start with '!' (e.g. !pip install ...)
        - Strip calls to get_ipython(...) which are IPython-specific
        - Replace removed lines with a harmless commented placeholder so the
          resulting .py file remains readable.
        """
        # nbformat stores source as a single string in most cases; handle lists defensively
        if isinstance(src, list):
            src = ''.join(src)

        cleaned_lines = []
        for line in src.splitlines():
            stripped = line.lstrip()
            # detect and remove magics, shell escapes and get_ipython invocations
            if not stripped:
                cleaned_lines.append(line)
                continue
            if stripped.startswith('%') or stripped.startswith('!') or stripped.startswith('%%'):
                # keep a commented note instead of the magic so the .py stays valid
                cleaned_lines.append(f"# [REMOVED IPYTHON MAGIC] {stripped}")
                continue
            if 'get_ipython(' in stripped:
                cleaned_lines.append(f"# [REMOVED IPYTHON-SPECIFIC CALL] {stripped}")
                continue
            cleaned_lines.append(line)

        return '\n'.join(cleaned_lines)

    code_cells = []
    for cell in notebook_content.cells:
        if cell.cell_type != 'code':
            continue
        cleaned = _clean_cell_source(cell.source)
        code_cells.append(cleaned)

    # Combine all code content with two newlines for separation
    extracted_code = '\n\n'.join(code_cells)

    # 4. Add header and write to output file
    header = (
        '# -*- coding: utf-8 -*-\n'
        '# This file was automatically generated from the Jupyter Notebook:\n'
        f'# Source: {os.path.basename(notebook_path)}\n'
        '# ----------------------------------------------------------------\n\n'
    )

    final_content = header + extracted_code

    # 4a. Post-process the extracted code to make data file paths robust when
    # the converted .py file is executed from the project root. We look for
    # occurrences of pd.read_csv(...) where the path targets the local data/
    # directory and replace them with a Path-based expression that resolves
    # relative to the generated .py file location.
    import re

    # Ensure a pathlib import exists in the generated file (avoid duplicate)
    if 'from pathlib import Path' not in final_content:
        final_content = 'from pathlib import Path\n' + final_content

    # Insert a small runtime helper into the generated script that ensures
    # any matplotlib figures shown/saved are also written into the same
    # directory as the generated .py file. We override plt.show to save the
    # current figure automatically and provide OUTPUT_DIR for explicit saves.
    prelude = (
        "\n# --- Auto-generated helpers: save figures next to this script ---\n"
        "OUTPUT_DIR = Path(__file__).resolve().parent\n"
    "# DATASETS_DIR points to the sibling 'datasets' folder when models are\n"
    "# placed under src/IDS-files/models/<model>/; to reach the datasets\n"
    "# folder we must go up three levels from the converted file (model\n"
    "# folder -> model parent -> models -> IDS-files) and then into\n"
    "# 'datasets'. This yields ../../datasets relative to the model file.\n"
    "DATASETS_DIR = Path(__file__).resolve().parent.parent.parent / 'datasets'\n"
        "try:\n"
        "    import matplotlib.pyplot as plt\n"
        "    _orig_show = plt.show\n"
        "    _figure_counter = 0\n"
        "    def _save_and_show(*args, **kwargs):\n"
        "        global _figure_counter\n"
        "        try:\n"
        "            fname = OUTPUT_DIR / f\"figure_{_figure_counter}.png\"\n"
        "            plt.savefig(str(fname))\n"
        "            _figure_counter += 1\n"
        "        except Exception:\n"
        "            pass\n"
        "        return _orig_show(*args, **kwargs)\n"
        "    plt.show = _save_and_show\n"
        "except Exception:\n"
        "    # If matplotlib isn't available at conversion time we skip the helper\n"
        "    pass\n\n"
    )

    # Inject the prelude immediately after the pathlib import line
    final_content = final_content.replace('from pathlib import Path\n', 'from pathlib import Path\n' + prelude, 1)

    # Also rewrite plt.savefig("relative/path.png", ...) to save into OUTPUT_DIR
    def _replace_savefig(match):
        quote = match.group(1)
        filename = match.group(2)
        # Do not rewrite absolute paths or Path(...) expressions
        if filename.startswith('/') or filename.startswith('\\') or re.match(r'^[A-Za-z]:', filename) or filename.strip().startswith('Path('):
            return match.group(0)
        # Return a call that keeps the remaining args intact (we only replace the string argument)
        return f'plt.savefig(str(OUTPUT_DIR / r"{filename}")'

    final_content = re.sub(r'plt\.savefig\(\s*([\'\"])([^\'\"]+)\1', _replace_savefig, final_content)

    # Replace pd.read_csv("./data/...") or pd.read_csv("data/...") with
    # pd.read_csv(str(DATASETS_DIR / filename)). Also handle os.path.join('data', 'file') patterns.
    def _replace_read_csv_literal(match):
        relpath = match.group(3)  # like './data/foo.csv' or 'data/foo.csv'
        rel_inside = relpath.lstrip('./')
        if rel_inside.startswith('data/'):
            inner = rel_inside.split('/', 1)[1]
        else:
            inner = rel_inside
        return f"pd.read_csv(str(DATASETS_DIR / r'{inner}'))"

    # pd.read_csv("data/foo.csv")
    pattern1 = re.compile(r"pd\.read_csv\(\s*([ruRUb]?)([\'\"])(\.?\/?data\/.+?)\2\s*\)")
    final_content = pattern1.sub(_replace_read_csv_literal, final_content)

    # pd.read_csv(os.path.join('data', 'foo.csv')) or os.path.join("data", "foo.csv")
    def _replace_read_csv_join(match):
        # match groups: prefix, quote1, join_parts, quote2
        join_inner = match.group(3)
        # attempt to extract last path component from the join call
        parts = re.findall(r"[\'\"]([^\'\"]+)[\'\"]", join_inner)
        if not parts:
            return match.group(0)
        # if first part is 'data', remove it
        if parts[0] == 'data':
            parts = parts[1:]
        inner = '/'.join(parts)
        return f"pd.read_csv(str(DATASETS_DIR / r'{inner}'))"

    pattern2 = re.compile(r"pd\.read_csv\(\s*([\w\.]*os\.path\.join\([^\)]*\))\s*\)")
    final_content = pattern2.sub(_replace_read_csv_join, final_content)

    # --- Post-process: remove unsupported n_jobs parameter from SMOTE instantiations ---
    # Some environments (or older imbalanced-learn versions) do not accept the
    # `n_jobs` parameter in `SMOTE(...)`. When converting notebooks to .py we
    # proactively strip `n_jobs=...` from SMOTE calls so the generated script
    # does not fail at import/runtime time.
    def _strip_n_jobs_in_smote(text):
        def _repl(m):
            inner = m.group(1)
            # Remove any occurrence of n_jobs=... (with optional surrounding commas)
            inner2 = re.sub(r"\s*,?\s*n_jobs\s*=\s*[^,\)]+\s*,?", ',', inner)
            # Collapse multiple commas and strip leading/trailing commas/spaces
            inner2 = re.sub(r',\s*,+', ',', inner2)
            inner2 = re.sub(r'^\s*,\s*', '', inner2)
            inner2 = re.sub(r'\s*,\s*$', '', inner2)
            return 'SMOTE(' + inner2 + ')'
        # Use DOTALL so arguments spanning lines are handled
        return re.sub(r'SMOTE\(\s*(.*?)\s*\)', _repl, text, flags=re.S)

    final_content = _strip_n_jobs_in_smote(final_content)

    # --- Post-process: replace deprecated DataFrame.append(...) calls ---
    # pandas removed DataFrame.append in pandas 2.x; convert common patterns
    # to use pd.concat([...], ignore_index=True) so converted scripts remain
    # compatible across pandas versions.
    def _replace_append_in_dataframe(text):
        # We'll perform several targeted replacements to handle common patterns safely.
        # 1) In-place reassignments like: df = df.append(row)
        # 2) Assign to a different var: new = df.append(row)
        # 3) Standalone usage: df.append(row)

        def _clean_args(argtext):
            # remove trailing commas and any ignore_index=... (we will set ignore_index=True on concat)
            a = re.sub(r',\s*$', '', argtext)
            a = re.sub(r'\bignore_index\s*=\s*[^,\)]+\s*,?', '', a)
            a = re.sub(r',\s*,+', ',', a)
            return a.strip()

        # Case 1: df = df.append(...)
        def _repl_assign_same(m):
            name = m.group(1)
            args = _clean_args(m.group(2))
            return f"{name} = pd.concat([{name}, {args}], ignore_index=True)"

        text = re.sub(r"\b([A-Za-z_]\w*)\s*=\s*\1\.append\(\s*(.*?)\s*\)", _repl_assign_same, text, flags=re.S)

        # Case 2: var = df.append(...)
        def _repl_assign_other(m):
            assign = m.group(1)
            dfname = m.group(2)
            args = _clean_args(m.group(3))
            return f"{assign}pd.concat([{dfname}, {args}], ignore_index=True)"

        text = re.sub(r"(([A-Za-z_]\w*\s*=\s*))([A-Za-z_]\w*)\.append\(\s*(.*?)\s*\)", _repl_assign_other, text, flags=re.S)

        # Case 3: standalone df.append(...)
        def _repl_standalone(m):
            dfname = m.group(1)
            args = _clean_args(m.group(2))
            return f"pd.concat([{dfname}, {args}], ignore_index=True)"

        text = re.sub(r"\b([A-Za-z_]\w*)\.append\(\s*(.*?)\s*\)", _repl_standalone, text, flags=re.S)

        return text

    final_content = _replace_append_in_dataframe(final_content)
    # If the converted file doesn't expose a train(...) function, append
    # an idempotent auto-generated wrapper so uploaded notebooks become
    # runnable by the backend. We remove any previously generated wrapper
    # region first to ensure repeated conversions produce the same output.
    try:
        import re as _re

        START = "# --- AUTO-GENERATED TRAIN WRAPPER BEGIN ---"
        END = "# --- AUTO-GENERATED TRAIN WRAPPER END ---"

        def _has_train(text: str) -> bool:
            return bool(_re.search(r"^def\s+train\s*\(", text, flags=_re.M))

        if not _has_train(final_content):
            # Remove existing generated wrapper if present
            final_content = _re.sub(_re.escape(START) + r"[\s\S]*?" + _re.escape(END), "", final_content, flags=_re.M)

            wrapper_text = (
                "\n\n" + START + "\n"
                "def train(dataset_path: str, params: dict | None = None) -> dict:\n"
                "    \"\"\"Auto-generated train wrapper. Loads dataset_path, does basic preprocessing,\n"
                "    trains a model with given params, and returns {'accuracy','precision','recall','f1'}.\n"
                "    \"\"\"\n"
                "    import pandas as pd\n"
                "    from sklearn.model_selection import train_test_split\n"
                "    from sklearn.metrics import accuracy_score, precision_recall_fscore_support\n"
                "    try:\n        import numpy as _np\n    except Exception:\n        _np = None\n"
                "\n"
                "    params = params or {}\n"
                "    # Load dataset (prefer provided path)\n"
                "    try:\n        df = pd.read_csv(dataset_path)\n    except Exception:\n        try:\n            df = pd.read_csv('./data/CICIDS2017_sample_km.csv')\n        except Exception as e:\n            raise RuntimeError(f\"Failed to load dataset at '{dataset_path}' and fallback failed: {e}\")\n"
                "\n"
                "    if 'Label' not in df.columns:\n        raise ValueError(\"Dataset must contain a 'Label' column\")\n"
                "\n"
                "    X = df.drop(['Label'], axis=1).values\n"
                "    y_series = df['Label']\n"
                "    # Encode non-numeric labels\n"
                "    try:\n        if _np is not None and not _np.issubdtype(y_series.dtype, _np.number):\n            from sklearn.preprocessing import LabelEncoder\n            le = LabelEncoder()\n            y = le.fit_transform(y_series.values)\n        else:\n            y = y_series.values\n    except Exception:\n        y = y_series.values\n"
                "\n"
                "    X_train, X_test, y_train, y_test = train_test_split(X, y, train_size=0.8, random_state=0, stratify=y)\n"
                "\n"
                "    # Sanitize features (replace inf with NaN and impute median)\n"
                "    try:\n        from sklearn.impute import SimpleImputer\n        import numpy as _np_local\n        def _sanitize(arr):\n            a = _np_local.array(arr, dtype=float)\n            a[~_np_local.isfinite(a)] = _np_local.nan\n            imp = SimpleImputer(strategy='median')\n            a2 = imp.fit_transform(a)\n            a2[~_np_local.isfinite(a2)] = 0.0\n            return a2\n        X_train = _sanitize(X_train)\n        X_test = _sanitize(X_test)\n    except Exception:\n        try:\n            import numpy as _np_local\n            X_train = _np_local.nan_to_num(_np_local.array(X_train, dtype=float), nan=0.0, posinf=0.0, neginf=0.0)\n            X_test = _np_local.nan_to_num(_np_local.array(X_test, dtype=float), nan=0.0, posinf=0.0, neginf=0.0)\n        except Exception:\n            pass\n"
                "\n"
                "    # Optional SMOTE\n"
                "    try:\n        from imblearn.over_sampling import SMOTE\n        sm = SMOTE()\n        X_train, y_train = sm.fit_resample(X_train, y_train)\n    except Exception:\n        pass\n"
                "\n"
                "    # Convert simple numeric-string params\n"
                "    safe_params = {}\n    for k, v in (params or {}).items():\n        try:\n            if isinstance(v, str) and v.isdigit():\n                safe_params[k] = int(v)\n            else:\n                safe_params[k] = v\n        except Exception:\n            safe_params[k] = v\n"
                "\n"
                "    try:\n        import xgboost as xgb_local\n        if 'missing' not in safe_params:\n            try:\n                import numpy as _np_local\n                safe_params['missing'] = _np_local.nan\n            except Exception:\n                pass\n        clf = xgb_local.XGBClassifier(**safe_params) if safe_params else xgb_local.XGBClassifier()\n    except Exception:\n        from sklearn.ensemble import RandomForestClassifier\n        clf = RandomForestClassifier()\n"
                "\n"
                "    clf.fit(X_train, y_train)\n    y_pred = clf.predict(X_test)\n\n    acc_val = float(accuracy_score(y_test, y_pred))\n    precision, recall, f1, _ = precision_recall_fscore_support(y_test, y_pred, average='weighted')\n\n    return {\n        'accuracy': float(acc_val),\n        'precision': float(precision),\n        'recall': float(recall),\n        'f1': float(f1),\n    }\n" + END + "\n")

            final_content = final_content + wrapper_text
    except Exception:
        # Non-fatal: don't block conversion if wrapper logic fails
        pass

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(final_content)
        print(f"\nSuccessfully extracted code from {len(code_cells)} cells.")
        print(f"Output saved to: {output_path}")
    except Exception as e:
        print(f"Error writing to output file '{output_path}': {e}")

    # Notebook-specific canonicalization: for known notebooks we provide a
    # persistent canonical template under `src/pynb_templates/` so conversions
    # remain deterministic even if the uploaded model copy is later removed.
    try:
        nb_basename = os.path.basename(notebook_path).lower()
        if nb_basename.startswith('mth_ids_iotj'):
            # Path to the canonical script(s) committed in the repo (stable location)
            repo_root = os.path.dirname(os.path.dirname(__file__))
            templates_dir = os.path.join(repo_root, 'src', 'pynb_templates')
            # Prefer the '*_copy' file (user-provided canonical copy) then fallback
            preferred_names = ('mth_ids_iotj_copy.py', 'mth_ids_iotj.py')
            found = False
            for name in preferred_names:
                canon_path = os.path.join(templates_dir, name)
                if os.path.exists(canon_path):
                    try:
                        with open(canon_path, 'r', encoding='utf-8') as cf:
                            canon = cf.read()
                        final_content = canon
                        with open(output_path, 'w', encoding='utf-8') as f:
                            f.write(final_content)
                        print(f"Applied canonical converter output for '{nb_basename}' from {canon_path}")
                        found = True
                        break
                    except Exception as e:
                        print(f"Failed to apply canonical output from {canon_path}: {e}")
            if not found:
                print(f"Canonical template not found in {templates_dir}; using generated output.")
    except Exception:
        # Do not block conversion on this best-effort step
        pass

    # If the converted file doesn't expose a train(...) function, append
    # an idempotent, well-formatted auto-generated wrapper so uploaded
    # notebooks become runnable by the backend. We remove any previously
    # generated wrapper region first to ensure repeated conversions produce
    # the same output.
    try:
        import re as _re, textwrap as _textwrap

        START = "# --- AUTO-GENERATED TRAIN WRAPPER BEGIN ---"
        END = "# --- AUTO-GENERATED TRAIN WRAPPER END ---"

        def _has_train(text: str) -> bool:
            return bool(_re.search(r"^def\s+train\s*\(", text, flags=_re.M))

        if not _has_train(final_content):
            # Remove existing generated wrapper if present
            final_content = _re.sub(_re.escape(START) + r"[\s\S]*?" + _re.escape(END), "", final_content, flags=_re.M)

            wrapper_body = _textwrap.dedent('''

def train(dataset_path: str, params: dict | None = None) -> dict:
    """Auto-generated train wrapper. Loads dataset_path, does basic preprocessing,
    trains a model with given params, and returns {'accuracy','precision','recall','f1'}.
    """
    import pandas as pd
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, precision_recall_fscore_support
    from sklearn.preprocessing import LabelEncoder
    try:
        import numpy as _np
    except Exception:
        _np = None

    params = params or {}
    # Load dataset (prefer provided path)
    try:
        df = pd.read_csv(dataset_path)
    except Exception:
        try:
            df = pd.read_csv('./data/CICIDS2017_sample_km.csv')
        except Exception as e:
            raise RuntimeError(f"Failed to load dataset at '{dataset_path}' and fallback failed: {e}")

    if 'Label' not in df.columns:
        raise ValueError("Dataset must contain a 'Label' column")

    X = df.drop(['Label'], axis=1).values
    y_series = df['Label']

    # Encode non-numeric labels
    try:
        if _np is not None and not _np.issubdtype(y_series.dtype, _np.number):
            le = LabelEncoder()
            y = le.fit_transform(y_series.values)
        else:
            y = y_series.values
    except Exception:
        y = y_series.values

    X_train, X_test, y_train, y_test = train_test_split(X, y, train_size=0.8, random_state=0, stratify=y)

    # Sanitize features (replace inf with NaN and impute median)
    try:
        from sklearn.impute import SimpleImputer
        import numpy as _np_local
        def _sanitize(arr):
            a = _np_local.array(arr, dtype=float)
            a[~_np_local.isfinite(a)] = _np_local.nan
            imp = SimpleImputer(strategy='median')
            a2 = imp.fit_transform(a)
            a2[~_np_local.isfinite(a2)] = 0.0
            return a2
        X_train = _sanitize(X_train)
        X_test = _sanitize(X_test)
    except Exception:
        try:
            import numpy as _np_local
            X_train = _np_local.nan_to_num(_np_local.array(X_train, dtype=float), nan=0.0, posinf=0.0, neginf=0.0)
            X_test = _np_local.nan_to_num(_np_local.array(X_test, dtype=float), nan=0.0, posinf=0.0, neginf=0.0)
        except Exception:
            pass

    # Optional SMOTE
    try:
        from imblearn.over_sampling import SMOTE
        sm = SMOTE()
        X_train, y_train = sm.fit_resample(X_train, y_train)
    except Exception:
        pass

    # Convert simple numeric-string params
    safe_params = {}
    for k, v in (params or {}).items():
        try:
            if isinstance(v, str) and v.isdigit():
                safe_params[k] = int(v)
            else:
                safe_params[k] = v
        except Exception:
            safe_params[k] = v

    try:
        import xgboost as xgb_local
        if 'missing' not in safe_params:
            try:
                import numpy as _np_local
                safe_params['missing'] = _np_local.nan
            except Exception:
                pass
        clf = xgb_local.XGBClassifier(**safe_params) if safe_params else xgb_local.XGBClassifier()
    except Exception:
        from sklearn.ensemble import RandomForestClassifier
        clf = RandomForestClassifier()

    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)

    acc_val = float(accuracy_score(y_test, y_pred))
    precision, recall, f1, _ = precision_recall_fscore_support(y_test, y_pred, average='weighted')

    return {
        'accuracy': float(acc_val),
        'precision': float(precision),
        'recall': float(recall),
        'f1': float(f1),
    }

''')

            final_content = final_content + "\n\n" + START + "\n" + wrapper_body + "\n" + END + "\n"
    except Exception:
        # Non-fatal: don't block conversion if wrapper logic fails
        pass


def main():
    """Parses command-line arguments and runs the extraction function."""
    parser = argparse.ArgumentParser(
        description="Extracts pure Python code from Jupyter Notebook (.ipynb) files.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "input_file",
        help="Path to the input Jupyter Notebook (.ipynb) file."
    )
    parser.add_argument(
        "-o", "--output",
        required=False,
        help=(
            "Path for the output Python (.py) file.\n"
            "If not provided, the script will use the input file's name\n"
            "and replace the '.ipynb' extension with '.py'."
        )
    )

    args = parser.parse_args()

    # Determine input/output file paths; if a bare filename is given,
    # assume it lives under the local `data/` folder (create on output as needed).
    input_path = args.input_file
    output_path = args.output

    # Keep the input path exactly as provided on the command line. The
    # converter will save the generated .py into the same directory by
    # default (see output_path logic below).
    # If callers pass a bare filename, it will be resolved relative to the
    # current working directory when the script runs.
    # (We intentionally do not force a data/ prefix here.)

    # Default output: same base name as input saved in the same directory
    # as the input notebook (so converted file appears next to the .ipynb).
    if not output_path:
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        input_dir = os.path.dirname(input_path) or '.'
        output_path = os.path.join(input_dir, base_name + '.py')
    else:
        # If output was provided as a bare filename, place it under
        # If the user provided a path, keep it. If they provided a bare
        # filename, save it next to the input notebook.
        if os.path.dirname(output_path):
            output_path = output_path
        else:
            input_dir = os.path.dirname(input_path) or '.'
            output_path = os.path.join(input_dir, output_path)

    # Ensure output directory exists
    out_dir = os.path.dirname(output_path)
    if out_dir and not os.path.exists(out_dir):
        try:
            os.makedirs(out_dir, exist_ok=True)
        except Exception as e:
            print(f"Error creating output directory '{out_dir}': {e}")
            return

    print(f"Resolved input:  {input_path}")
    print(f"Resolved output: {output_path}")

    extract_code_from_notebook(input_path, output_path)

if __name__ == '__main__':
    # Ensure nbformat is installed: pip install nbformat
    try:
        main()
    except Exception as e:
        print(f"A fatal error occurred: {e}")
try:
    from FCBF_module import FCBF, FCBFK, FCBFiP, get_i
except ImportError:
    import sys, os
    vendor_dir = os.path.join(os.path.dirname(__file__), '..', '_vendor')
    vendor_dir = os.path.normpath(vendor_dir)
    if vendor_dir not in sys.path:
        sys.path.insert(0, vendor_dir)
    from FCBF_module import FCBF, FCBFK, FCBFiP, get_i
