"""Re-stamp the ?v= cache-busters in covase-platform.html.

Run after editing anything in css/ or js/:   python3 tools/stamp-versions.py
GitHub Pages caches each file for ~10 minutes. Each <script src> / stylesheet link
carries ?v=<hash of that file>, so a browser can never mix a new page with an old
section (or the reverse). Exits non-zero if a referenced file is missing.
"""
import hashlib, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
page = root / 'covase-platform.html'
html = page.read_text(encoding='utf-8')

def stamp(m):
    path = root / m.group(2)
    if not path.is_file():
        sys.exit('missing ' + m.group(2))
    return m.group(1) + m.group(2) + '?v=' + hashlib.sha1(path.read_bytes()).hexdigest()[:10] + m.group(3)

new = re.sub(r'((?:src|href)=")((?:js|css)/[^"?]+)(?:\?v=[^"]*)?(")', stamp, html)
if new != html:
    page.write_text(new, encoding='utf-8')
    print('stamped')
else:
    print('already current')
