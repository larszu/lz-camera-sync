#!/usr/bin/env python3
"""Regenerate src/core/sony-values.ts from Sony's Camera Control PTP 3 Reference.

When Sony publishes a new reference (new models, new firmware values):
  pdftotext -layout "Camera Control PTP 3 Reference.pdf" ref.txt
  python3 scripts/gen-sony-values.py ref.txt > src/core/sony-values.ts
"""
import re
import sys

lines = open(sys.argv[1], encoding='utf-8', errors='ignore').read().split('\n')
CODES = [0x500A, 0x500B, 0xD241, 0xD242, 0xD0D9, 0xD0DB, 0xD0DF, 0xD22C, 0xD201, 0xD001, 0xD007, 0xD255, 0x5005, 0xD23F, 0xD240]


def section(code):
    pat = re.compile(r'PropertyCode\s+1\s+2\s+UINT16\s+0x%04X\b' % code)
    for i, l in enumerate(lines):
        if pat.search(l):
            out = {}
            for l2 in lines[i + 1:i + 400]:
                if re.search(r'PropertyCode\s+1\s+2\s+UINT16', l2):
                    break
                if l2.strip() in ('Note', 'Summary') and out:
                    break
                m = re.match(r'\s*(0x[0-9A-Fa-f]+)\s{2,}(\S.*)', l2)
                if m:
                    out.setdefault(int(m.group(1), 16), re.sub(r'\s{2,}', ' ', m.group(2).strip()))
            return out
    return {}


print("// Generated from Sony's Camera Control PTP 3 Reference (value tables per")
print('// property) by scripts/gen-sony-values.py. Regenerate, do not edit by hand.')
print('export const VALUE_LABELS: Record<number, Record<number, string>> = {')
for c in CODES:
    v = section(c)
    if not v:
        continue
    print(f'  0x{c:04x}: {{')
    for val, lab in v.items():
        lab = lab.replace("'", "\\'")
        print(f"    0x{val:x}: '{lab}',")
    print('  },')
print('}')
