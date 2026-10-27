# -*- coding: ascii -*-
"""Local dev server with no-store headers (avoid stale JS/CSS during dev)."""
import http.server
import os
import socketserver

PORT = int(os.environ.get("ZZSH_PORT", "8765"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    os.chdir(ROOT)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("serving %s on http://localhost:%d (no-store)" % (ROOT, PORT))
        httpd.serve_forever()
