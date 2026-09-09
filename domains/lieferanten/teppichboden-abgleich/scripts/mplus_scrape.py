import re,html,time,json,urllib.request,sys,os
S=os.path.dirname(os.path.abspath(__file__))
UA={"User-Agent":"Mozilla/5.0"}
def get(u):
    r=urllib.request.Request(u,headers=UA); return urllib.request.urlopen(r,timeout=60).read().decode('utf-8','ignore')
base="https://www.m-plus.de"
cat="/de/Bodenbel%C3%A4ge/Textile-Bodenbel%C3%A4ge/c/20.1?q=%3Arelevance%3ACMSME000670%3A{}&page=5"
cols=['Akzente+2029','Ambiente+2025','Ambiente+2029','Analog+2029','Avantgarde+2029','Avantiles+2026','Extrem+2029','Outdoor+2030']
qual={}
import os
if os.path.exists(S+'/mplus/qualities.json'): qual=json.load(open(S+'/mplus/qualities.json'))
for c in ([] if qual else cols):
    s=get(base+cat.format(c))
    links=sorted(set(re.findall(r'href="(/de/Bodenbel[^"]*/p/[^"]+)"',s)))
    m=re.search(r'([0-9.]+) Ergebnisse',s)
    print(c,len(links),m.group(1) if m else '?',flush=True)
    for l in links:
        q=re.sub(r'.*/([^/]+)/p/.*',r'\1',l)
        qual.setdefault(q,{'collection':c.replace('+',' '),'urls':[]})['urls'].append(l)
    time.sleep(3)
json.dump(qual,open(S+'/mplus/qualities.json','w'),indent=1,ensure_ascii=False)
print('qualities',len(qual),flush=True)
def text(s):
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S)
    t=re.sub(r'<[^>]+>','\n',t); t=html.unescape(t)
    return [l.strip() for l in t.split('\n') if l.strip()]
out={}
for q,info in qual.items():
    if os.path.exists(S+'/mplus/html_'+q+'.html'): continue
    u=base+info['urls'][0]
    try: s=get(u)
    except Exception as e: print('ERR',q,e,flush=True); continue
    open(S+'/mplus/html_'+q+'.html','w').write(s)
    lines=text(s)
    rec={'quality_slug':q,'collection':info['collection'],'url':u,'title':(re.findall(r'<title>(.*?)</title>',s,re.S) or [''])[0].strip(),'listing_urls':info['urls']}
    # Art-Nr
    m=re.search(r'Art-Nr\.:\s*\n?\s*([0-9-]+)','\n'.join(lines)); rec['art_nr']=m.group(1) if m else None
    # Farbtonbezeichnung list (after 'Mehr')
    txt='\n'.join(lines)
    i=txt.find('Farbtonbezeichnung\n'); j=txt.find('Länge in centimeter',i)
    block=txt[i:j] if i>=0 and j>i else ''
    rec['colors']=sorted(set(re.findall(r'(\d{2,5}-\d{4})\s+([^\n]+)',block)))
    # sibling product links
    rec['color_product_urls']=sorted(set(re.findall(r'href="(/de/Bodenbel[^"]*/'+re.escape(q)+r'/p/[^"]+)"',s)))
    # Produkteigenschaft bullet block
    m=re.search(r"Produkteigenschaft\n'?-?\s*(.*?)\nGefahrguthinweise",txt,re.S); rec['eigenschaften']=m.group(1) if m else ''
    # Spezifikationen key/value: from 'Spezifikationen' to next product teaser (ends at first 'MPlus ' teaser line or end)
    k=txt.find('Spezifikationen\n'); spec=txt[k+16:k+4000] if k>=0 else ''
    sl=spec.split('\n'); kv={}
    stop=None
    for idx in range(0,len(sl)-1,1):
        if re.match(r'^(MPlus|M-Plus) .*\d{4}-\d{6}',sl[idx]) or re.match(r'^\d{4}-\d{6}$',sl[idx]): stop=idx;break
    sl=sl[:stop] if stop else sl
    # pairs: key then value(s). Use known keys list
    keys=['Farbtonbezeichnung','Gebinde','Gebinde ME','Reinigung/Pflege Textil','Reinigung/Pflege Elastisch','Qualität','Länge in centimeter','Breite in centimeter','Einsatzbereich','Farbrichtung','Farbintensität','Verarbeitung Bodenbelag','Kollektion Eigenmarke Boden','Trittschallverbesserung in dB','Nutzungsklasse','Komfortklasse','Fußbodenheizung','Faserart','Gesamtstärke in Millimeter','Brandverhalten','Belagsformate','Konstruktion / Struktur','Poleinsatzgewicht per m² in g','Rückenausstattung / Träger','Gleitwiderstand','Belagsart','Design Sonstige','Gesamtgewicht per m² in g','Polhöhe in Millimeter','Polmaterial','Hersteller','Rollenlänge','Fliesenformat','Rapport','Antistatisch','Lichtechtheit','Stuhlrolleneignung','Treppeneignung','Luxusklasse','EAN','Marke','Design','Struktur']
    cur=None
    for l in sl:
        if l in keys: cur=l; kv.setdefault(cur,[])
        elif cur: kv[cur].append(l)
    rec['spec']={k:(' | '.join(v)) for k,v in kv.items()}
    rec['docs']=sorted(set(re.findall(r'href="(https://[^"]+\.pdf)"',s)))
    rec['images']=sorted(set(re.findall(r'(https://www\.m-plus\.de/medias/[^"\s]+)',s)))[:12]
    out[q]=rec
    print(q,rec['art_nr'],len(rec['colors']),len(rec['color_product_urls']),rec['spec'].get('Belagsart'),flush=True)
    json.dump(out,open(S+'/mplus/products.json','w'),indent=1,ensure_ascii=False)
    time.sleep(3)
print('done',len(out))
