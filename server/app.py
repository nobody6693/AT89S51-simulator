"""KT89S51 模擬器 — 本機服務

  GET  /                → web/index.html（靜態檔）
  POST /compile         → { source, filename, chip } → { ok, hex, lines, symbols, diagnostics, converted, notes }
  GET  /examples        → 範例清單
  GET  /examples/<name> → 範例原始碼
  GET  /presets         → 接線 preset 清單
  GET  /presets/<name>  → 讀取
  PUT  /presets/<name>  → 儲存

啟動：python server/app.py [port]
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'web')
COMPAT = os.path.join(ROOT, 'server', 'compat')
EXAMPLES = os.path.join(ROOT, 'examples')
PRESETS = os.path.join(ROOT, 'presets')
sys.path.insert(0, os.path.join(ROOT, 'server'))
from keil2sdcc import convert  # noqa: E402

SDCC_CANDIDATES = [
    os.path.join(ROOT, 'tools', 'sdcc', 'bin', 'sdcc.exe'),
    os.path.join(ROOT, 'tools', 'sdcc', 'bin', 'sdcc'),
    shutil.which('sdcc'),
    r'C:\Program Files\SDCC\bin\sdcc.exe',
    r'C:\Program Files (x86)\SDCC\bin\sdcc.exe',
    '/usr/bin/sdcc', '/usr/local/bin/sdcc', '/opt/homebrew/bin/sdcc',
]
SDCC = next((p for p in SDCC_CANDIDATES if p and os.path.exists(p)), None)

CHIPS = {
    'AT89S51': {'code': 4096, 'iram': 128, 'xram': 0},
    'AT89S52': {'code': 8192, 'iram': 256, 'xram': 0},
    'AT89C55': {'code': 20480, 'iram': 256, 'xram': 0},
}

RE_DIAG = re.compile(r'^(.*?):(\d+):\s*(?:(warning|error|syntax error|fatal error)\s*(\d+)?\s*:)?\s*(.*)$')


def parse_cdb(text, main_src_name):
    """解析 SDCC .cdb：回傳 (line_map:list[[addr,line]], symbols:dict)"""
    lines = []
    symbols = {}
    for raw in text.splitlines():
        # L:C$main.c$12$1$3:00000123  → C 行號
        if raw.startswith('L:C$'):
            parts = raw[2:].split(':')
            body, addr = parts[0], parts[1]
            f = body.split('$')
            fname, ln = f[1], int(f[2])
            if os.path.basename(fname).lower() == main_src_name.lower():
                lines.append([int(addr, 16), ln])
        # L:G$symbol$0$0:addr   全域符號位址
        elif raw.startswith('L:G$') or raw.startswith('L:F') or raw.startswith('L:L'):
            parts = raw[2:].split(':')
            body, addr = parts[0], parts[1]
            f = body.split('$')
            name = f[1]
            if raw.startswith('L:G$'):
                symbols.setdefault(name, {})['addr'] = int(addr, 16)
        # S:G$name$0$0({size}...),space,... 型別/空間
        elif raw.startswith('S:G$'):
            m = re.match(r'S:G\$(\w+)\$\d+\$\d+\(\{(\d+)\}([^)]*)\),([A-Z]),', raw)
            if m:
                name, size, tdesc, space = m.group(1), int(m.group(2)), m.group(3), m.group(4)
                symbols.setdefault(name, {}).update({'size': size, 'space': space, 'type': tdesc})
    lines.sort()
    return lines, symbols


def compile_source(source, filename, chip):
    if SDCC is None:
        return {'ok': False, 'diagnostics': [{'line': 0, 'severity': 'error', 'msg': '找不到 SDCC，請先安裝 (winget install SDCC.SDCC)'}]}
    base = os.path.splitext(os.path.basename(filename or 'main.c'))[0] or 'main'
    base = re.sub(r'[^A-Za-z0-9_]', '_', base)
    src_name = base + '.c'
    conv, notes = convert(source)
    lim = CHIPS.get(chip, CHIPS['AT89S51'])
    tmp = tempfile.mkdtemp(prefix='kt89s51_')
    try:
        src_path = os.path.join(tmp, src_name)
        with open(src_path, 'w', encoding='utf-8') as f:
            f.write(conv)
        cmd = [SDCC, '-mmcs51', '--model-small', '--debug', '--std-c99',
               '--iram-size', str(lim['iram']), '--code-size', str(lim['code']),
               '--xram-size', str(lim['xram']),
               '--opt-code-size', '--no-c-code-in-asm',
               '-I', COMPAT, '-o', tmp + os.sep, src_path]
        # sdcpp 透過 PATH 尋找 cc1，必須把 SDCC 的 bin 目錄放進 PATH
        env = dict(os.environ)
        env['PATH'] = os.path.dirname(SDCC) + os.pathsep + env.get('PATH', '')
        proc = subprocess.run(cmd, cwd=tmp, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=60, env=env)
        diags = []
        for line in (proc.stderr + '\n' + proc.stdout).splitlines():
            line = line.strip()
            if not line:
                continue
            m = RE_DIAG.match(line)
            if m and m.group(2):
                sev = (m.group(3) or 'error').lower()
                if sev == 'syntax error':
                    sev = 'error'
                msg = m.group(5)
                if m.group(3) == 'syntax error':
                    msg = 'syntax error: ' + msg
                diags.append({'file': os.path.basename(m.group(1)), 'line': int(m.group(2)), 'severity': 'warning' if sev == 'warning' else 'error', 'msg': msg})
            elif 'error' in line.lower() or '?ASlink' in line:
                diags.append({'file': src_name, 'line': 0, 'severity': 'error', 'msg': line})
        ihx = os.path.join(tmp, base + '.ihx')
        result = {'ok': proc.returncode == 0 and os.path.exists(ihx), 'diagnostics': diags,
                  'converted': conv, 'notes': notes, 'chip': chip, 'cmd': ' '.join(cmd)}
        if result['ok']:
            with open(ihx, encoding='utf-8') as f:
                result['hex'] = f.read()
            cdb = os.path.join(tmp, base + '.cdb')
            if os.path.exists(cdb):
                with open(cdb, encoding='utf-8', errors='replace') as f:
                    result['lines'], result['symbols'] = parse_cdb(f.read(), src_name)
            # 記憶體用量摘要（.mem）
            mem = os.path.join(tmp, base + '.mem')
            if os.path.exists(mem):
                with open(mem, encoding='utf-8', errors='replace') as f:
                    result['mem'] = f.read()
            # 產生的組合語言（含原始碼註解，供反組譯面板對照）
            asm = os.path.join(tmp, base + '.asm')
            if os.path.exists(asm):
                with open(asm, encoding='utf-8', errors='replace') as f:
                    result['asm'] = f.read()
        return result
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=WEB, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.command, self.path))

    def _json(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self):
        n = int(self.headers.get('Content-Length', 0))
        return self.rfile.read(n) if n else b''

    def do_GET(self):
        path = unquote(self.path.split('?')[0])
        if path == '/examples':
            items = []
            # 組合語言優先（課程主要語言），再列 C
            for sub in ('asm', ''):
                d = os.path.join(EXAMPLES, sub) if sub else EXAMPLES
                if not os.path.isdir(d):
                    continue
                for fn in sorted(os.listdir(d)):
                    if fn.lower().endswith(('.asm', '.a51') if sub else ('.c', '.hex', '.ihx')):
                        items.append(fn)
            return self._json(items)
        if path.startswith('/examples/'):
            fn = os.path.basename(path[len('/examples/'):])
            fp = os.path.join(EXAMPLES, 'asm', fn) if fn.lower().endswith(('.asm', '.a51')) else os.path.join(EXAMPLES, fn)
            if not os.path.exists(fp):
                return self._json({'error': 'not found'}, 404)
            with open(fp, encoding='utf-8', errors='replace') as f:
                return self._json({'name': fn, 'source': f.read()})
        if path == '/presets':
            items = []
            if os.path.isdir(PRESETS):
                for fn in sorted(os.listdir(PRESETS)):
                    if fn.endswith('.json'):
                        items.append(fn[:-5])
            return self._json(items)
        if path.startswith('/presets/'):
            name = re.sub(r'[^\w\-]', '_', os.path.basename(path[len('/presets/'):]))
            fp = os.path.join(PRESETS, name + '.json')
            if not os.path.exists(fp):
                return self._json({'error': 'not found'}, 404)
            with open(fp, encoding='utf-8') as f:
                return self._json(json.load(f))
        if path == '/status':
            return self._json({'sdcc': SDCC, 'chips': CHIPS})
        # 靜態檔案（end_headers 會補上 no-store）
        return super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        path = unquote(self.path.split('?')[0])
        if path == '/compile':
            try:
                body = json.loads(self._read_body().decode('utf-8'))
                res = compile_source(body.get('source', ''), body.get('filename', 'main.c'), body.get('chip', 'AT89S51'))
                return self._json(res)
            except Exception as e:  # noqa: BLE001
                return self._json({'ok': False, 'diagnostics': [{'line': 0, 'severity': 'error', 'msg': f'伺服器錯誤：{e}'}]}, 500)
        return self._json({'error': 'not found'}, 404)

    def do_PUT(self):
        path = unquote(self.path.split('?')[0])
        if path.startswith('/presets/'):
            name = re.sub(r'[^\w\-]', '_', os.path.basename(path[len('/presets/'):]))
            os.makedirs(PRESETS, exist_ok=True)
            data = json.loads(self._read_body().decode('utf-8'))
            with open(os.path.join(PRESETS, name + '.json'), 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return self._json({'ok': True})
        return self._json({'error': 'not found'}, 404)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8051
    if SDCC is None:
        print('警告：找不到 SDCC，只能載入 .hex，無法編譯 C。')
    else:
        print('SDCC:', SDCC)
    srv = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'KT89S51 模擬器：http://127.0.0.1:{port}/')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
