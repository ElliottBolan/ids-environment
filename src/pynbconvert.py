import argparse
import os
import nbformat
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

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(final_content)
        print(f"\nSuccessfully extracted code from {len(code_cells)} cells.")
        print(f"Output saved to: {output_path}")
    except Exception as e:
        print(f"Error writing to output file '{output_path}': {e}")


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
