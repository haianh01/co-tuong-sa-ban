#!/usr/bin/env python3
"""Gộp index.html + css + js thành một file HTML duy nhất trong thư mục dist/.
Chạy:  python3 tools/build.py
"""
import re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')

def inline_css(m):
    return '<style>\n' + (root / m.group(1)).read_text(encoding='utf-8') + '</style>'

def inline_js(m):
    return '<script>\n' + (root / m.group(1)).read_text(encoding='utf-8') + '</script>'

html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', inline_css, html)
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)

# Pikafish (nếu đã build) được nhúng luôn để file gộp dùng được máy mạnh.
# Mạng nơ-ron pikafish.nnue thì không nhúng: người dùng chọn file một lần trên trang.
pf = root / 'engine' / 'pikafish.js'
if pf.exists():
    html = html.replace('</body>', '<script>\n' + pf.read_text(encoding='utf-8') + '</script>\n</body>')

# Thư viện Anthropic cho "Lời thoại bằng Claude" (nạp sẵn để file gộp không cần thư mục vendor/).
sdk = root / 'vendor' / 'anthropic-sdk.js'
if sdk.exists():
    html = html.replace('</body>', '<script>\n' + sdk.read_text(encoding='utf-8') + '</script>\n</body>')

# mp4-muxer cho "Xuất video" nhanh (đóng gói khung hình WebCodecs thành MP4).
mux = root / 'vendor' / 'mp4-muxer.js'
if mux.exists():
    html = html.replace('</body>', '<script>\n' + mux.read_text(encoding='utf-8') + '</script>\n</body>')

out = root / 'dist' / 'co-tuong-sa-ban.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8')
print(f'Đã tạo {out.relative_to(root)} ({len(html) // 1024} KB)')
