import json,re,os,collections
S=os.path.dirname(os.path.abspath(__file__))
J=json.load(open(S+'/jordan/products.json')); M=json.load(open(S+'/mplus/products.json'))
def num(x):
    if x is None: return None
    x=str(x).replace('.','').replace(',','.') if re.match(r'^\d{1,3}(\.\d{3})+$',str(x)) else str(x).replace(',','.')
    m=re.search(r'[\d.]+',x); 
    try: return float(m.group(0)) if m else None
    except: return None
def ccode(c):
    m=re.findall(r'\d+',c); 
    return str(int(m[-1])) if m else c
def jordan_rec(k,v):
    vs=list(v['variants'].values()); a=vs[0]['attributes']
    widths=sorted(set(str(int(num(p['attributes'].get('Breite (mm)') or 0)/10)) for p in vs if p['attributes'].get('Breite (mm)')))
    colors=sorted(set(ccode(c['label']) for p in vs for c in p['colors']))
    art='Nadelvlies' if 'Nadelvlies' in (a.get('Teppich-Art') or '')+vs[0]['title'] else ('Tuft' if 'Tuft' in (a.get('Teppich-Art') or '') else (a.get('Teppich-Art') or '?'))
    nk=set(re.findall(r'\d{2}',a.get('Nutzungsklasse') or '') ) | set(re.findall(r'\d{2}',' '.join(p['attributes'].get('Nutzungsklasse') or '' for p in vs)))
    return {'key':k,'art':art,'pol':num(a.get('Poleinsatz gr/qm')),'gesamt':num(a.get('Gewicht pro qm')),'staerke':num(a.get('Stärke (mm)')),'polhoehe':num(a.get('Polhöhe')),'ruecken':a.get('Rückenausstattung'),'nk':nk,'brand':(a.get('Brandverhalten') or '').split()[0].lower() if a.get('Brandverhalten') else None,'widths':widths,'colors':colors,'material':a.get('Polmaterial'),'struktur':a.get('Struktur'),'marke':a.get('Marke'),'ean':a.get('EAN Nummer')}
def mplus_rec(q,r):
    s=r['spec']
    art='Nadelvlies' if 'Nadelvlies' in (s.get('Belagsart') or '') else ('Tuft' if ('Getuftet' in (s.get('Konstruktion / Struktur') or '') or 'Tuft' in (s.get('Belagsart') or '')) else (s.get('Konstruktion / Struktur') or '?'))
    nk=set(re.findall(r'\d{2}',s.get('Nutzungsklasse') or ''))
    return {'key':q,'art':art,'pol':num(s.get('Poleinsatzgewicht per m² in g')),'gesamt':num(s.get('Gesamtgewicht per m² in g')),'staerke':num(s.get('Gesamtstärke in Millimeter')),'polhoehe':num(s.get('Florhöhe in millimeter')),'ruecken':s.get('Rückenausstattung / Träger'),'nk':nk,'brand':(s.get('Brandverhalten') or '').lower() or None,'widths':r['widths_cm'],'colors':sorted(set(ccode(c['code']) for c in r['colors'] if c['code'])),'material':s.get('Faserart'),'struktur':s.get('Konstruktion / Struktur'),'format':s.get('Belagsformate'),'qualitaet':s.get('Qualität'),'title':r['title']}
def close(a,b,tol):
    return a is not None and b is not None and abs(a-b)<=tol
def ruecken_ok(j,m):
    j=(j or '').lower(); m=(m or '').lower()
    if not j or not m: return None
    if 'textil' in j and 'textil' in m: return True
    if 'vlies' in j and ('vlies' in m or 'comfort' in m): return True
    return False
def score(j,m):
    d={}
    d['art']=j['art']==m['art']
    d['pol']=close(j['pol'],m['pol'],max(30,0.05*(j['pol'] or 0)))
    d['staerke']=close(j['staerke'],m['staerke'],0.6)
    d['polhoehe']=close(j['polhoehe'],m['polhoehe'],0.6)
    d['ruecken']=ruecken_ok(j['ruecken'],m['ruecken'])
    d['nk']=bool(j['nk'] & m['nk']) if j['nk'] and m['nk'] else None
    d['brand']=(j['brand']==m['brand']) if j['brand'] and m['brand'] else None
    d['widths']=bool(set(j['widths'])&set(m['widths'])) if j['widths'] and m['widths'] else None
    common=sorted(set(j['colors'])&set(m['colors']),key=int)
    d['colors_common']=common; d['colors_j_only']=sorted(set(j['colors'])-set(m['colors']),key=int); d['colors_m_only']=sorted(set(m['colors'])-set(j['colors']),key=int)
    pts=0
    if not d['art']: return -99,d
    for k,w in [('pol',3),('staerke',2),('polhoehe',2),('ruecken',1),('nk',1),('brand',1),('widths',1)]:
        if d[k] is True: pts+=w
        elif d[k] is False: pts-=w
    if len(common)>=3: pts+=3+min(len(common),8)//2
    elif len(common)>=1: pts+=1
    return pts,d
res={}
MR={q:mplus_rec(q,r) for q,r in M.items()}
for k,v in J.items():
    j=jordan_rec(k,v); cands=[]
    for q,m in MR.items():
        p,d=score(j,m); cands.append((p,q,d))
    cands.sort(key=lambda x:-x[0])
    res[k]={'jordan':j,'candidates':[{'score':p,'mplus':q,'mplus_title':MR[q]['title'],'mplus_rec':MR[q],'detail':d} for p,q,d in cands[:3]]}
    print('\n###',k,'|',j['art'],'| Pol',j['pol'],'| Gesamt',j['gesamt'],'| St',j['staerke'],'| PH',j['polhoehe'],'|',j['ruecken'],'| NK',sorted(j['nk']),'|',j['brand'],'|',j['widths'],'| Farben',j['colors'])
    for p,q,d in cands[:3]:
        m=MR[q]; print(f"   {p:>3} {q} [{m['title']}] Pol {m['pol']} St {m['staerke']} PH {m['polhoehe']} {m['ruecken']} NK {sorted(m['nk'])} {m['brand']} {m['widths']} Farben {m['colors']}")
        print('       ', {x:d[x] for x in ['pol','staerke','polhoehe','ruecken','nk','brand','widths']}, 'gemeinsam',d['colors_common'])
json.dump(res,open(S+'/match_result.json','w'),indent=1,ensure_ascii=False,default=lambda o: sorted(o) if isinstance(o,set) else str(o))
