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

    # If user provided just a filename (no directory), look under ./data/
    def _ensure_data_prefix(p):
        # If path already contains a directory component or is absolute, leave as-is
        if os.path.dirname(p):
            return p
        return os.path.join('data', p)

    input_path = _ensure_data_prefix(input_path)

    # Default output: same base name as input but with .py in the data/ folder
    if not output_path:
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        output_path = os.path.join('data', base_name + '.py')
    else:
        # If output was provided as a bare filename, put it under data/
        output_path = _ensure_data_prefix(output_path)

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
