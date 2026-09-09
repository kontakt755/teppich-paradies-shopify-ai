import json,re,html,time,urllib.request,os
S=os.path.dirname(os.path.abspath(__file__))
M=json.load(open(S+'/mplus/products.json'))
want=['M-Plus-Akzente-2029-2403-TR','MPlus-Analog-2029-733','MPlus-Analog-2029-966','MPlus-Avantgarde-2029-2205','MPlus-Avantgarde-2029-2210','M-Plus-Akzente-2029-2416-FB']
out=json.load(open(S+'/mplus/colors.json')) if os.path.exists(S+'/mplus/colors.json') else {}
for q in want:
    out.setdefault(q,{})
    for u in M[q]['color_product_urls']:
        code=u.split('/p/')[-1]
        if code in out[q]: continue
        try:
            s=urllib.request.urlopen(urllib.request.Request('https://www.m-plus.de'+u,headers={"User-Agent":"Mozilla/5.0"}),timeout=60).read().decode('utf-8','ignore')
        except Exception as e: print('ERR',u,e,flush=True); continue
        t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S); t=re.sub(r'<[^>]+>','\n',t); t=html.unescape(t)
        txt='\n'.join(l.strip() for l in t.split('\n') if l.strip())
        title=html.unescape((re.findall(r'<title>(.*?)</title>',s,re.S) or [''])[0]).replace('| M-Plus','').strip()
        m=re.search(r'Farbtonbezeichnung:\n([^\n]+)',txt); farbe=m.group(1) if m else None
        m=re.search(r'\nBreite in centimeter\n((?:\d+\n)+)',txt); widths=sorted(set(m.group(1).split())) if m else []
        m=re.search(r'\nGebinde\n([^\n]+)',txt); gebinde=m.group(1) if m else None
        imgs=[x for x in re.findall(r'(https://www\.m-plus\.de/medias/[^"\s\\]+)',s) if 'sitemap' not in x and not x.endswith('.xml')]
        out[q][code]={'art_nr':code,'title':title,'farbe':farbe,'widths_cm':widths,'gebinde':gebinde,'url':'https://www.m-plus.de'+u,'image':imgs[0] if imgs else None}
        print(q,code,farbe,widths,flush=True)
        json.dump(out,open(S+'/mplus/colors.json','w'),indent=1,ensure_ascii=False)
        time.sleep(2.5)
print('done')
