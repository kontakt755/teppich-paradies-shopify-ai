import re,html,time,json,urllib.request,urllib.parse,sys,os
S=os.path.dirname(os.path.abspath(__file__))
UA={"User-Agent":"Mozilla/5.0"}
def get(u):
    r=urllib.request.Request(u,headers=UA); return urllib.request.urlopen(r,timeout=60).read().decode('utf-8','ignore')
ATTR = re.compile(r'product-attribute-name">(.*?)</div>\s*<div class="col-8 col-lg-9[^"]*">(.*?)</div>', re.S)
OPT  = re.compile(r'<option[^>]*value="(https://www\.jordanshop\.de/de-DE/product/(\d+))"[^>]*>(.*?)</option>', re.S)
def clean(x): return html.unescape(re.sub('<[^>]+>','',x)).strip()
def product(pid):
    s=get(f'https://www.jordanshop.de/de-DE/product/{pid}')
    open(S+'/jordan/html_'+str(pid)+'.html','w').write(s)
    rec={'id':pid,'url':f'https://www.jordanshop.de/de-DE/product/{pid}','title':clean((re.findall(r'<title>(.*?)</title>',s,re.S) or [''])[0]).split('|')[0].strip()}
    rec['attributes']={clean(k):clean(v) for k,v in ATTR.findall(s)}
    rec['colors']=[{'id':i,'label':clean(l)} for u,i,l in OPT.findall(s)]
    rec['docs']=sorted(set(re.findall(r'href="(https://www\.jordanshop\.de/de-DE/media/model/products/[^"]+)"',s)))
    m=re.search(r'"(?:og:image|image)"[^>]*content="([^"]+)"',s); rec['image']=m.group(1) if m else None
    return rec
# Seed: Shopify-Qualitaeten (grosshandel.sku) -> quicksearch
seeds=json.load(open(S+'/jordan/seeds.json'))
out=json.load(open(S+'/jordan/products.json')) if os.path.exists(S+'/jordan/products.json') else {}
for seed in seeds:
    q=seed['query']
    if seed['key'] in out: continue
    try:
        d=json.loads(get('https://www.jordanshop.de/de-DE/quicksearch?query='+urllib.parse.quote(q)))
    except Exception as e: print('ERR search',q,e,flush=True); continue
    pr=d.get('products') if isinstance(d.get('products'),dict) else {}
    hits=pr.get('data',[])
    total=pr.get('meta',{}).get('total')
    if not hits: print('KEINE TREFFER',q,repr(d.get('products'))[:80],flush=True)
    # group by product name (quality+width), take first id per name
    names={}
    for h in hits:
        names.setdefault(h['name'],h)
    rec={'seed':seed,'search_total':total,'variants':{}}
    for name,h in names.items():
        pid=h['url'].rstrip('/').split('/')[-1]
        try: p=product(pid)
        except Exception as e: print('ERR product',pid,e,flush=True); continue
        p['material_number_hit']=h.get('material_number')
        rec['variants'][name]=p
        print(seed['key'],'|',name,'|',p['attributes'].get('Art. Nr.'),'|',len(p['colors']),'Farben',flush=True)
        time.sleep(1.5)
    out[seed['key']]=rec
    json.dump(out,open(S+'/jordan/products.json','w'),indent=1,ensure_ascii=False)
    time.sleep(1.5)
print('done',len(out))
