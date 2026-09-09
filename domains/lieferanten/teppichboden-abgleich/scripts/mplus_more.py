import re,json,time,urllib.request,os
S=os.path.dirname(os.path.abspath(__file__))
UA={"User-Agent":"Mozilla/5.0"}
get=lambda u: urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read().decode('utf-8','ignore')
base="https://www.m-plus.de/de/Bodenbel%C3%A4ge/Textile-Bodenbel%C3%A4ge/c/20.1?q=%3A{sort}%3ACMSME000670%3A{col}&page=5"
qual=json.load(open(S+'/mplus/qualities.json'))
plan={'Akzente+2029':['name-desc'],'Ambiente+2025':['name-desc'],'Analog+2029':['name-desc'],'Avantgarde+2029':['name-desc'],'Avantiles+2026':['name-desc','price-asc','price-desc','topRated']}
allurls=json.load(open(S+'/mplus/all_color_urls.json')) if os.path.exists(S+'/mplus/all_color_urls.json') else {}
for col,sorts in plan.items():
    for so in sorts:
        s=get(base.format(sort=so,col=col))
        links=set(re.findall(r'href="(/de/Bodenbel[^"]*/p/[^"]+)"',s))
        new=0
        for l in links:
            q=re.sub(r'.*/([^/]+)/p/.*',r'\1',l)
            allurls.setdefault(l,q)
            if q not in qual: qual[q]={'collection':col.replace('+',' '),'urls':[l]}; new+=1
            elif l not in qual[q]['urls']: qual[q]['urls'].append(l)
        print(col,so,len(links),'neue Qualitaeten',new,'gesamt',len(qual),flush=True); time.sleep(3)
json.dump(qual,open(S+'/mplus/qualities.json','w'),indent=1,ensure_ascii=False)
json.dump(allurls,open(S+'/mplus/all_color_urls.json','w'),indent=1,ensure_ascii=False)
# fehlende Produktseiten laden
for q,info in qual.items():
    f=S+'/mplus/html_'+q+'.html'
    if os.path.exists(f): continue
    try: s=get('https://www.m-plus.de'+info['urls'][0])
    except Exception as e: print('ERR',q,e,flush=True); continue
    open(f,'w').write(s); print('geladen',q,flush=True); time.sleep(3)
print('done')
