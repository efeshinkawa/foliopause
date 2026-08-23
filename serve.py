#!/usr/bin/env python3
"""Static file server for local testing that never caches, so a rebuild is
always what the browser sees.

    python3 serve.py [port]      # default 8765
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print('serving on http://127.0.0.1:%d' % port)
    ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
