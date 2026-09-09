import re,html,json,os,glob
S=os.path.dirname(os.path.abspath(__file__))
qual=json.load(open(S+'/mplus/qualities.json'))
def text(s):
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S)
    t=re.sub(r'<[^>]+>','\n',t); t=html.unescape(t)
    return '\n'.join(l.strip() for l in t.split('\n') if l.strip())
KEYS=['Farbtonbezeichnung','Gebinde','Gebinde ME','Reinigung/Pflege Textil','Reinigung/Pflege Elastisch','Qualität','Länge in centimeter','Breite in centimeter','Einsatzbereich','Farbrichtung','Farbintensität','Verarbeitung Bodenbelag','Kollektion Eigenmarke Boden','Trittschallverbesserung in dB','Nutzungsklasse','Komfortklasse','Fußbodenheizung','Faserart','Gesamtstärke in Millimeter','Brandverhalten','Belagsformate','Konstruktion / Struktur','Poleinsatzgewicht per m² in g','Rückenausstattung / Träger','Gleitwiderstand','Belagsart','Design Sonstige','Gesamtgewicht per m² in g','Polhöhe in Millimeter','Florhöhe in millimeter','Polmaterial','Teilung','Fliesenformat','Rapport','Lichtechtheit','Stuhlrolleneignung','Treppeneignung','Luxusklasse','EAN','Marke','Design','Struktur','Format','Fliesenformat in centimeter','Antistatisch','Ableitfähig','Wärmedurchlasswiderstand','Wärmedurchlasswiderstand in m² K/W','Rollenlänge in meter','Hersteller','Garantie','Gewicht','Länge','Breite','Farbe']
out={}
for f in sorted(glob.glob(S+'/mplus/html_*.html')):
    q=os.path.basename(f)[5:-5]; s=open(f).read(); txt=text(s)
    rec={'quality_slug':q,'collection':qual.get(q,{}).get('collection'),'url':'https://www.m-plus.de'+qual.get(q,{}).get('urls',[''])[0],'title':html.unescape((re.findall(r'<title>(.*?)</title>',s,re.S) or [''])[0]).replace('| M-Plus','').strip()}
    m=re.search(r'Art-Nr\.:\n([0-9-]+)',txt); rec['art_nr_first']=m.group(1) if m else None
    m=re.search(r'\nMehr\nFarbtonbezeichnung\n(.*?)\n(?:Breite in centimeter|Länge in centimeter|Gebinde|Fliesenformat)',txt,re.S)
    colors=[]
    if m:
        for l in m.group(1).split('\n'):
            mm=re.match(r'^([0-9][0-9A-Za-z-]*)\s+(.+)$',l)
            if mm: colors.append({'code':mm.group(1),'name':mm.group(2)})
            elif l: colors.append({'code':None,'name':l})
    rec['colors']=colors
    # Farb-Produkt-URLs (je Farbe eigener Artikel)
    rec['color_product_urls']=sorted(set(re.findall(r'href="(/de/Bodenbel[^"]*/'+re.escape(q)+r'/p/[^"]+)"',s)))
    # Widths
    m=re.search(r'\nBreite in centimeter\n((?:\d+\n)+)',txt); rec['widths_cm']=sorted(set(m.group(1).split())) if m else []
    m=re.search(r'Produkteigenschaft\n(.*?)\n(?:Zusatzinfos|Gefahrguthinweise)',txt,re.S); rec['eigenschaften']=m.group(1).strip("'- \n") if m else ''
    m=re.search(r'Wichtige Hinweise\n(.*?)\nGefahrguthinweise',txt,re.S); rec['hinweise']=m.group(1) if m else ''
    # Kurzbeschreibung vor Art-Nr
    m=re.search(r'Abbildung ähnlich\n(.*?)\nArt-Nr',txt,re.S); rec['beschreibung']=m.group(1).strip() if m else ''
    k=txt.find('\nSpezifikationen\n'); spec=txt[k+17:] if k>=0 else ''
    sl=spec.split('\n'); kv={}; cur=None
    for l in sl:
        if re.match(r'^(MPlus|M-Plus) .+',l) and cur not in ('Farbtonbezeichnung','Qualität'): break
        if l=='Bodenbeläge': break
        if l in KEYS: cur=l; kv.setdefault(cur,[])
        elif cur: kv[cur].append(l)
    rec['spec']={k:' | '.join(v) for k,v in kv.items()}
    rec['docs']=sorted(set(re.findall(r'href="(https://[^"]+\.pdf)"',s)))
    imgs=[u for u in re.findall(r'(https://www\.m-plus\.de/medias/[^"\s\\]+)',s) if not u.endswith('.xml')]
    rec['images']=sorted(set(imgs))[:10]
    rec['ean']=rec['spec'].get('EAN')
    out[q]=rec
json.dump(out,open(S+'/mplus/products.json','w'),indent=1,ensure_ascii=False)
print(len(out))
for q,r in list(out.items())[:3]+[x for x in out.items() if 'Analog-2029-733' in x[0]]:
    print(q,r['art_nr_first'],len(r['colors']),r['colors'][:3],r['widths_cm'],{k:r['spec'].get(k) for k in ['Belagsart','Poleinsatzgewicht per m² in g','Gesamtstärke in Millimeter','Nutzungsklasse','Faserart','Konstruktion / Struktur','Rückenausstattung / Träger','Brandverhalten']})
