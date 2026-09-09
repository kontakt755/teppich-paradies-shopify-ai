import re,html,time,json,urllib.request,urllib.parse,os,sys
S=os.path.dirname(os.path.abspath(__file__)); D=S+'/jordan_full'
UA={"User-Agent":"Mozilla/5.0"}
def get(u,tries=3):
    for i in range(tries):
        try: return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read().decode('utf-8','ignore')
        except Exception as e:
            if i==tries-1: raise
            time.sleep(5)
# --- Schritt 1: Quicksearch komplett, mit Resume je Query
QUERIES=['Sprint 027','Trend 026','Wool Sisal','Atelier 2030','Format 028','Arriva 027','Balance','Teppichboden 200','Teppichboden 300','Nadelvlies','Teppichfliese','Sisal','Kokos','Velours','Saxony','Kugelgarn','Schlinge 400','Schlinge 500','Objekt 400','Objekt 500']
items=json.load(open(D+'/search_items.json')) if os.path.exists(D+'/search_items.json') else {}
prog=json.load(open(D+'/search_progress.json')) if os.path.exists(D+'/search_progress.json') else {}
def run_query(q):
    page=prog.get(q,0)+1
    while True:
        try: d=json.loads(get(f'https://www.jordanshop.de/de-DE/quicksearch?query={urllib.parse.quote(q)}&page={page}'))
        except Exception as e: print('ERR',q,page,e,flush=True); time.sleep(10); continue
        p=d.get('products')
        if not isinstance(p,dict): print('keine Treffer',q,flush=True); break
        for x in p['data']:
            items[x['url']]={'name':re.sub(r'\s+',' ',x['name']).strip(),'art_nr':x['material_number'],'farbe':x['short_description'],'url':x['url'],'image':x['image'],'query':q}
        prog[q]=page
        if page%25==0 or page>=p['meta']['last_page']:
            json.dump(items,open(D+'/search_items.json','w'),ensure_ascii=False); json.dump(prog,open(D+'/search_progress.json','w'))
            print(q,page,'/',p['meta']['last_page'],'items',len(items),flush=True)
        if p['meta']['total']>p['meta']['last_page']*p['meta']['per_page']: print('CAP',q,p['meta']['total'],flush=True)
        if page>=p['meta']['last_page']: break
        page+=1; time.sleep(0.7)
for q in QUERIES: run_query(q)
json.dump(items,open(D+'/search_items.json','w'),ensure_ascii=False)
# --- Schritt 2: textile Bodenbelaege filtern, je Produktname eine Seite
TEXTIL=re.compile(r'(?i)^(Teppichboden|Nadelvlies|Teppichfliese|Kugelgarn)|Teppichfliese|Nadelvlies|Sisal|Kokos')
EXCL=re.compile(r'(?i)Maßteppich|Unterlage|Kleber|Klebstoff|Einfassung|Ketteln|Sockel|Leiste|Profil|Treppe|Stufe|Matte|Sauberlauf|Muster|Kollektion|Set |#\d|Band|Klebeband|Reiniger|Pflege|Vlies-Unterlage|Werkzeug|Messer|Nadel |Trittschall|Zubeh')
def load_products():
  names={}
  for u,x in items.items():
    n=x['name']
    if not TEXTIL.search(n) or EXCL.search(n): continue
    names.setdefault(n,[]).append(x)
  print('textile Produktnamen',len(names),flush=True)
  json.dump({n:v for n,v in names.items()},open(D+'/textil_items_by_name.json','w'),ensure_ascii=False)
  return names
names=load_products()
ATTR=re.compile(r'product-attribute-name">(.*?)</div>\s*<div class="col-8 col-lg-9[^"]*">(.*?)</div>',re.S)
OPT=re.compile(r'<option[^>]*value="(https://www\.jordanshop\.de/de-DE/product/(\d+))"[^>]*>(.*?)</option>',re.S)
clean=lambda x: html.unescape(re.sub('<[^>]+>','',x)).strip()
prods=json.load(open(D+'/products.json')) if os.path.exists(D+'/products.json') else {}
def fetch_products(names):
  for n,v in names.items():
    if n in prods: continue
    pid=v[0]['url'].rstrip('/').split('/')[-1]
    try: s=get(f'https://www.jordanshop.de/de-DE/product/{pid}')
    except Exception as e: print('ERR product',n,pid,e,flush=True); continue
    rec={'name':n,'id':pid,'url':v[0]['url'],'title':clean((re.findall(r'<title>(.*?)</title>',s,re.S) or [''])[0]).split('|')[0].strip()}
    rec['attributes']={clean(k):clean(x) for k,x in ATTR.findall(s)}
    rec['colors']=[{'id':i,'label':clean(l)} for u,i,l in OPT.findall(s)]
    rec['docs']=sorted(set(re.findall(r'href="(https://www\.jordanshop\.de/de-DE/media/model/products/[^"]+)"',s)))
    rec['articles']=[{'art_nr':x['art_nr'],'farbe':x['farbe'],'url':x['url'],'image':x['image']} for x in v]
    prods[n]=rec
    if len(prods)%10==0: json.dump(prods,open(D+'/products.json','w'),ensure_ascii=False); print('products',len(prods),'/',len(names),flush=True)
    time.sleep(1.2)
  json.dump(prods,open(D+'/products.json','w'),ensure_ascii=False)
fetch_products(names)
# Discovery: neue Kollektionen -> neue Queries, bis nichts Neues kommt
done_q=set(q.lower() for q in QUERIES)
for rnd in range(4):
    cols=set(p['attributes'].get('Kollektionsname','') for p in prods.values())-{''}
    newq=[c for c in cols if c.lower() not in done_q and ('teppichboden '+c).lower() not in done_q]
    if not newq: break
    print('Runde',rnd,'neue Kollektionen',newq,flush=True)
    for c in newq:
        run_query('Teppichboden '+c); done_q.add(('teppichboden '+c).lower())
    json.dump(items,open(D+'/search_items.json','w'),ensure_ascii=False); json.dump(prog,open(D+'/search_progress.json','w'))
    names=load_products(); fetch_products(names)
print('done',len(prods),flush=True)
