import re, html, json, urllib.request, time, sys

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")

ATTR = re.compile(r'product-attribute-name">(.*?)</div>\s*<div class="col-8 col-lg-9[^"]*">(.*?)</div>', re.S)
def attrs(d):
    out = {}
    for k, v in ATTR.findall(d):
        k = html.unescape(re.sub('<[^>]+>', '', k)).strip()
        v = html.unescape(re.sub('<[^>]+>', '', v)).strip()
        out[k] = v
    return out

OPT = re.compile(r'<option[^>]*value="(https://www\.jordanshop\.de/de-DE/product/\d+)"[^>]*>(.*?)</option>', re.S)
def options(d):
    seen, out = set(), []
    for url, txt in OPT.findall(d):
        txt = html.unescape(re.sub('<[^>]+>', '', txt)).strip()
        if url not in seen:
            seen.add(url); out.append((url, txt))
    return out

IMG = re.compile(r'<img[^>]+src="[^"]*/([A-Za-z0-9_-]{40,})\.webp')
import base64
def image(d):
    for b in IMG.findall(d):
        try:
            u = base64.urlsafe_b64decode(b + '=' * (-len(b) % 4)).decode()
            if 'media.jordanshop.de' in u and 'default-image' not in u:
                return u
        except Exception:
            pass
    return None

PRICE = re.compile(r'(\d{1,3},\d{2})\s*&euro;|(\d{1,3},\d{2})\s*€')
def price(d):
    m = PRICE.search(d)
    return (m.group(1) or m.group(2)) if m else None

PRODUCTS = json.load(open('/tmp/lino/products.json'))
result = {}
for key, parent in PRODUCTS.items():
    sys.stderr.write(f"\n== {key} ({parent})\n")
    d = get(parent)
    opts = options(d)
    p = price(d)
    colors = []
    for url, label in opts:
        dd = d if url == parent else get(url)
        a = attrs(dd)
        colors.append({
            "label": label,
            "url": url,
            "farbe": a.get("Farbe"),
            "intensitaet": a.get("Farbintensität"),
            "artnr": a.get("Art. Nr."),
            "image": image(dd),
            "staerke": a.get("Stärke (mm)"),
            "breite": a.get("Breite (mm)"),
            "brand": a.get("Brandverhalten"),
            "aufbau": a.get("Produktaufbau"),
            "qualitaet": a.get("Qualität"),
            "nutzung": a.get("Nutzungsklasse"),
            "raum": a.get("Raumeignung"),
        })
        sys.stderr.write(f"  {label:32s} -> {a.get('Farbe')} / {a.get('Farbintensität')} | {a.get('Art. Nr.')}\n")
        time.sleep(0.4)
    result[key] = {"parent": parent, "price": p, "colors": colors}
    json.dump(result, open('/tmp/lino/data.json', 'w'), ensure_ascii=False, indent=1)
print("done")
