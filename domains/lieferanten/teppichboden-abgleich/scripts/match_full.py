import json,re,os,collections,datetime
S=os.path.dirname(os.path.abspath(__file__))
JP=json.load(open(S+'/jordan_full/products.json')); M=json.load(open(S+'/mplus/products.json')); H=json.load(open(S+'/mplus/hersteller.json'))
def num(x):
    if x is None: return None
    x=str(x)
    if re.match(r'^\d{1,3}(\.\d{3})+(,\d+)?$',x): x=x.replace('.','')
    x=x.replace(',','.')
    m=re.search(r'\d+(\.\d+)?',x)
    return float(m.group(0)) if m else None
def ccode(c):
    m=re.findall(r'\d+',c); return str(int(m[-1])) if m else c
# --- Jordan: Produktnamen (Qualitaet+Breite) zu Qualitaeten gruppieren
def jkey(rec):
    a=rec['attributes']; q=(a.get('Qualität') or '').strip(); k=(a.get('Kollektionsname') or '').strip()
    if not q:
        q=re.sub(r'(?i)^(Teppichboden|Nadelvlies|Teppichfliese)\s+','',rec['name']); q=re.split(r'\s+\d{2,3}\s?cm|\s+\d{2,3}x\d{2,3}',q)[0].strip()
    return f'{k} | {q}'.strip(' |')
JQ={}
for n,rec in JP.items():
    JQ.setdefault(jkey(rec),[]).append(rec)
def jordan_rec(k,vs):
    a=vs[0]['attributes']
    widths=sorted(set(str(int(num(p['attributes'].get('Breite (mm)') or 0)/10)) for p in vs if num(p['attributes'].get('Breite (mm)'))))
    colors=sorted(set(ccode(c['label']) for p in vs for c in p['colors']))
    title=' '.join(p['name'] for p in vs)
    art='Nadelvlies' if re.search(r'(?i)nadelvlies',(a.get('Teppich-Art') or '')+title) else ('Tuft' if re.search(r'(?i)tuft',a.get('Teppich-Art') or '') else ('Web' if re.search(r'(?i)web|gewebt',a.get('Teppich-Art') or '') else (a.get('Teppich-Art') or '?')))
    tile=bool(re.search(r'(?i)fliese|50x50|tile',title))
    nk=set(); [nk.update(re.findall(r'\b\d{2}\b',p['attributes'].get('Nutzungsklasse') or '')) for p in vs]
    pol=num(a.get('Poleinsatz gr/qm')); staerke=num(a.get('Stärke (mm)')); ph=num(a.get('Polhöhe'))
    return {'key':k,'names':sorted(set(p['name'] for p in vs)),'art':art,'tile':tile,'pol':pol,'gesamt':num(a.get('Gewicht pro qm')),'staerke':staerke,'polhoehe':ph,'ruecken':a.get('Rückenausstattung'),'nk':nk,'brand':(a.get('Brandverhalten') or '').split()[0].lower() if a.get('Brandverhalten') else None,'widths':widths,'colors':colors,'material':a.get('Polmaterial'),'struktur':a.get('Struktur'),'marke':a.get('Marke'),'kollektion':a.get('Kollektionsname'),'qualitaet':a.get('Qualität'),'ean':[p['attributes'].get('EAN Nummer') for p in vs],'urls':[p['url'] for p in vs],'docs':vs[0]['docs'],'attributes':a,
            'articles':[x for p in vs for x in p['articles']],'color_ids':{ccode(c['label']):c['id'] for p in vs for c in p['colors']}}
def mplus_rec(q,r):
    s=r['spec']; title=r['title']
    art='Nadelvlies' if 'Nadelvlies' in (s.get('Belagsart') or '') else ('Kunstrasen' if 'Kunstrasen' in (s.get('Belagsart') or '') else ('Tuft' if ('Getuftet' in (s.get('Konstruktion / Struktur') or '') or 'Tuft' in (s.get('Belagsart') or '')) else ('Web' if 'Gewebt' in (s.get('Konstruktion / Struktur') or '') else (s.get('Konstruktion / Struktur') or '?'))))
    tile=('Fliesen' in (s.get('Belagsformate') or '')) or bool(re.search(r'(?i)tile|fliese|50 x 50|modul',title))
    nk=set(re.findall(r'\b\d{2}\b',s.get('Nutzungsklasse') or ''))
    herst=(H.get(q,{}).get('hersteller_canonical') or None)
    return {'key':q,'title':title,'art':art,'tile':tile,'pol':num(s.get('Poleinsatzgewicht per m² in g')),'gesamt':num(s.get('Gesamtgewicht per m² in g')),'staerke':num(s.get('Gesamtstärke in Millimeter')),'polhoehe':num(s.get('Florhöhe in millimeter')),'ruecken':s.get('Rückenausstattung / Träger'),'nk':nk,'brand':(s.get('Brandverhalten') or '').lower() or None,'widths':r['widths_cm'],'colors':sorted(set(ccode(c['code']) for c in r['colors'] if c['code'])),'colors_raw':r['colors'],'material':s.get('Faserart'),'struktur':s.get('Konstruktion / Struktur'),'format':s.get('Belagsformate'),'qualitaet':s.get('Qualität'),'collection':r['collection'],'hersteller':herst,'url':r['url'],'art_nr':r['art_nr_first'],'docs':r['docs'],'spec':s,'eigenschaften':r['eigenschaften'],'color_product_urls':r['color_product_urls']}
def close(a,b,tol): return None if (a is None or b is None) else abs(a-b)<=tol
def ruecken_ok(j,m):
    j=(j or '').lower(); m=(m or '').lower()
    if not j or not m: return None
    if 'textil' in j and 'textil' in m: return True
    if ('vlies' in j or 'filz' in j or 'comfort' in j) and ('vlies' in m or 'comfort' in m or 'filz' in m): return True
    if 'latex' in j and ('latex' in m or 'vlies' in m or 'comfort' in m): return True
    if ('bitumen' in j or 'schwer' in j or 'beyond' in j) and ('schwer' in m or 'bitumen' in m): return True
    if 'textil' in j and ('vlies' in m or 'comfort' in m): return False
    if ('vlies' in j) and 'textil' in m: return False
    return None
def score(j,m):
    d={}
    d['art']=(j['art']==m['art']) and (j['tile']==m['tile'])
    if not d['art']: return -99,d
    d['pol']=close(j['pol'],m['pol'],max(30,0.05*(j['pol'] or 0)))
    d['staerke']=close(j['staerke'],m['staerke'],0.6)
    d['polhoehe']=close(j['polhoehe'],m['polhoehe'],0.6)
    d['ruecken']=ruecken_ok(j['ruecken'],m['ruecken'])
    d['nk']=bool(j['nk']&m['nk']) if j['nk'] and m['nk'] else None
    d['brand']=(j['brand']==m['brand']) if j['brand'] and m['brand'] else None
    d['widths']=bool(set(j['widths'])&set(m['widths'])) if j['widths'] and m['widths'] else None
    common=sorted(set(j['colors'])&set(m['colors']),key=int); d['colors_common']=common
    d['colors_j_only']=sorted(set(j['colors'])-set(m['colors']),key=int); d['colors_m_only']=sorted(set(m['colors'])-set(j['colors']),key=int)
    small=min(len(j['colors']),len(m['colors'])) or 1; d['color_overlap']=round(len(common)/small,2)
    # gleicher Qualitaetsname/Nummer (z. B. Strong 733)
    jn=' '.join(j['names']).lower(); mt=(m['title']+' '+(m['qualitaet'] or '')).lower()
    nums=set(re.findall(r'\b\d{3,4}\b',jn))&set(re.findall(r'\b\d{3,4}\b',mt)); words=set(re.findall(r'[a-zäöü]{4,}',jn))&set(re.findall(r'[a-zäöü]{4,}',mt))-{'teppichboden','nadelvlies','fliese','tiles','strong'}
    d['name_link']=bool(nums and (words or 'strong' in jn and 'strong' in mt))
    pts=0
    for k,w in [('pol',3),('staerke',2),('polhoehe',2),('ruecken',1),('nk',1),('brand',1),('widths',1)]:
        if d[k] is True: pts+=w
        elif d[k] is False: pts-=w
    if len(common)>=3: pts+=3+min(len(common),8)//2
    elif len(common)>=1: pts+=1
    if d['name_link']: pts+=4
    return pts,d
def decide(j,m,pts,d):
    contra=[k for k in ['pol','staerke','polhoehe','nk','brand'] if d.get(k) is False]
    tech_ok=all(d.get(k) is not False for k in ['pol','staerke','polhoehe','ruecken','nk','brand','widths']) and (d.get('pol') is True) and (d.get('staerke') is True or d.get('polhoehe') is True)
    strong_colors=len(d['colors_common'])>=3 and d['color_overlap']>=0.7
    if d['name_link'] and tech_ok and strong_colors and m['hersteller']: return 'MATCH_CONFIRMED'
    if tech_ok and strong_colors: return 'MATCH_PROBABLE' if m['hersteller'] else 'MATCH_POSSIBLE'
    if tech_ok and len(d['colors_common'])>=1 and pts>=8: return 'MATCH_POSSIBLE'
    if strong_colors and len(d['colors_common'])>=5 and len(contra)==1: return 'REVIEW_REQUIRED'
    return 'NO_MATCH'
MR={q:mplus_rec(q,r) for q,r in M.items()}
JR={k:jordan_rec(k,vs) for k,vs in JQ.items()}
results={}; used_m=collections.defaultdict(list)
for k,j in JR.items():
    cands=[]
    for q,m in MR.items():
        p,d=score(j,m); cands.append((p,q,d))
    cands.sort(key=lambda x:-x[0])
    top=[]
    for p,q,d in cands[:3]:
        st=decide(j,MR[q],p,d) if p>-99 else 'NO_MATCH'
        top.append({'mplus':q,'score':p,'status':st,'detail':d})
    best=top[0] if top else None
    status=best['status'] if best else 'NO_MATCH'
    if best and best['status']!='NO_MATCH': used_m[best['mplus']].append(k)
    results[k]={'jordan':j,'status':status,'best':best,'candidates':top}
# M-Plus-Qualitaet mehrfach als bester Treffer: Jordan fuehrt dieselbe Ware oft unter mehreren
# Kollektionsnamen (z. B. Trend 026 Plaza = Arriva 027 Secrets). Aliase erkennen statt abwerten.
for q,ks in used_m.items():
    if len(ks)<2: continue
    ks=sorted(ks,key=lambda k:-results[k]['best']['score']); win=ks[0]; wj=JR[win]
    for k in ks[1:]:
        j=JR[k]; d=results[k]['best']['detail']
        small=min(len(j['colors']),len(wj['colors'])) or 1
        ov=len(set(j['colors'])&set(wj['colors']))/small
        contra=[x for x in ['pol','staerke','polhoehe','ruecken','nk','brand'] if d.get(x) is False]
        if ov>=0.7 and not contra:
            results[k]['alias_of']=win; results[k]['review_note']=f'Vermutlich dieselbe Ware wie Jordan "{win}" (Farbnummern {round(ov*100)} % gleich) - beide zeigen auf M-Plus {q}'
            results[win].setdefault('aliases',[]).append(k)
        else:
            results[k]['status']='REVIEW_REQUIRED' if not contra else 'NO_MATCH'
            results[k]['review_note']=f'M-Plus {q} passt besser zu Jordan "{win}"; hier '+(', '.join(contra)+' abweichend' if contra else 'schwaechere Uebereinstimmung')
json.dump({'results':results,'mplus':MR},open(S+'/match_full_result.json','w'),ensure_ascii=False,indent=1,default=lambda o: sorted(o) if isinstance(o,set) else str(o))
cnt=collections.Counter(r['status'] for r in results.values()); print('Jordan-Qualitaeten',len(results),dict(cnt))
matched_m=set(r['best']['mplus'] for r in results.values() if r['status'] not in ('NO_MATCH',))
print('M-Plus-Qualitaeten',len(MR),'davon mit Jordan-Treffer',len(matched_m),'nur M-Plus',len(MR)-len(matched_m))
for k,r in sorted(results.items(),key=lambda x:x[1]['status']):
    if r['status']=='NO_MATCH': continue
    b=r['best']; d=b['detail']; m=MR[b['mplus']]
    print(f"{r['status']:16} {k:45} -> {b['mplus']:32} [{m['hersteller'] or '-'}] pts {b['score']} gemeinsam {len(d['colors_common'])}/{len(r['jordan']['colors'])}J {len(m['colors'])}M  {[(x,d[x]) for x in ['pol','staerke','polhoehe','ruecken','nk','brand'] if d[x] is False]}")
