# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2026 0kaka
"""配布用の 1 ファイル版（Kizashi.html）を作る。

開発は index.html + assets/ + js/ で行い、配る・使うときはこのファイル 1 つだけを開く。
ファイルの読み込みが 13 回 → 1 回になり、起動が速くなる。
使い方: python build.py
"""
import re
from pathlib import Path

root = Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')

def inline_css(m):
    return '<style>\n' + (root / m.group(1)).read_text(encoding='utf-8') + '\n</style>'

def inline_js(m):
    # </script> がコード中にあると HTML が途中で閉じるので分割しておく
    code = (root / m.group(1)).read_text(encoding='utf-8').replace('</script>', '<\\/script>')
    return '<script>\n' + code + '\n</script>'

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)
html = html.replace('<!-- file:// でも動くよう、通常の script で読み込む（順序依存） -->', '<!-- build.py が生成した 1 ファイル版。編集は index.html / js / assets 側で行う -->')

out = root / 'Kizashi.html'
out.write_text(html, encoding='utf-8')
print(f'{out.name}: {out.stat().st_size / 1024:.0f} KB')
