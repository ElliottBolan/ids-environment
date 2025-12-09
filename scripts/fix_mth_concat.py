import re
from pathlib import Path
p = Path('backend/uploads/models/mth_ids_iotj/mth_ids_iotj.py')
s = p.read_text(encoding='utf-8')
# Fix the specific broken concat produced earlier
s = s.replace('df = pd.concat([df = , df1], ignore_index=True)', 'df = pd.concat([df1, df2], ignore_index=True)')
# Restore list append semantics for known list variable names
s = re.sub(r"pd\.concat\(\[\s*(fs|list1|list2|al|bl|l0|l1|l)\s*,\s*(.*?)\],\s*ignore_index=True\)", r"\1.append(\2)", s, flags=re.S)
# Also convert occurrences where list var is second (unlikely) but handle both orders
s = re.sub(r"pd\.concat\(\[\s*(.*?)\s*,\s*(fs|list1|list2|al|bl|l0|l1|l)\s*\],\s*ignore_index=True\)", r"\2.append(\1)", s, flags=re.S)
# Write back
p.write_text(s, encoding='utf-8')
print('FIXED')
