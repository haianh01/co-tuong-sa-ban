#!/usr/bin/env python3
"""Mở trang qua máy chủ web cục bộ kèm header COOP/COEP để Pikafish chạy đa luồng.

Trình duyệt chỉ cho dùng SharedArrayBuffer (cần cho đa luồng) khi trang "cross-origin isolated".
Mở index.html trực tiếp (file://) vẫn chạy được, nhưng Pikafish chỉ chạy một luồng.

Chạy:  python3 tools/serve.py [cổng]      rồi mở http://localhost:8000
Nếu đặt file mạng nơ-ron tại engine/pikafish.nnue, trang tự nạp, không cần chọn file.
"""
import functools, http.server, pathlib, sys

root = pathlib.Path(__file__).resolve().parent.parent
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        # credentialless (thay cho require-corp) để font Google Fonts vẫn tải được.
        self.send_header('Cross-Origin-Embedder-Policy', 'credentialless')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


http.server.ThreadingHTTPServer.allow_reuse_address = True
with http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=str(root))) as httpd:
    print(f'Mở http://localhost:{port} (Ctrl+C để dừng)')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
