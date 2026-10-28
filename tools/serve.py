# -*- coding: ascii -*-
"""Local dev server with no-store headers (avoid stale JS/CSS during dev)."""
import http.server
import os
import socketserver

PORT = int(os.environ.get("ZZSH_PORT", "8765"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        """Test page posts results here: POST /report -> tools/fulltest_result.json"""
        try:
            n = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(n)
            out = os.path.join(ROOT, "tools", "fulltest_result.json")
            with open(out, "wb") as f:
                f.write(body)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"OK")
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode("utf-8"))

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
