import json,re,os,csv,datetime,collections
S=os.path.dirname(os.path.abspath(__file__))
R=json.load(open(S+'/match_full_result.json')); results=R['results']; MR=R['mplus']
H=json.load(open(S+'/mplus/hersteller.json')); MC=json.load(open(S+'/mplus/colors.json')) if os.path.exists(S+'/mplus/colors.json') else {}
MASS=json.load(open(S+'/jordan/masstteppich_articles.json'))
MASSQ=sorted(set(re.sub(r'^Teppichboden (\S+) Maßteppich.*',r'\1',re.sub(r'\s+',' ',x['name'])).lower() for x in MASS if 'Maßteppich' in x['name']))
def ccode(c):
    m=re.findall(r'\d+',c); return str(int(m[-1])) if m else c
def artnr(a): return re.sub(r'^(\d{4})(\d{6})$',r'\1-\2',a) if a else a
today=datetime.date.today().isoformat()
def colors_block(j,m,q):
    jcol={}
    for x in j['articles']:
        code=ccode(x['farbe'] or x['art_nr'].split('_')[-1]); jcol.setdefault(code,{'article_numbers':[],'urls':[],'label':x['farbe']}); jcol[code]['article_numbers'].append(x['art_nr']); jcol[code]['urls'].append(x['url'])
    for code,pid in j['color_ids'].items():
        jcol.setdefault(code,{'article_numbers':[],'urls':[f'https://www.jordanshop.de/de-DE/product/{pid}'],'label':'Farbe '+code})
    mcol={}
    if m:
        for c in m['colors_raw']:
            if c['code']: mcol[ccode(c['code'])]={'code':c['code'],'name':c['name']}
        for art,x in MC.get(q,{}).items():
            if x.get('farbe'):
                code=ccode(x['farbe'].split()[0]); mcol.setdefault(code,{'code':x['farbe'].split()[0],'name':' '.join(x['farbe'].split()[1:])}); mcol[code].update({'article_number':artnr(x['art_nr']),'url':x['url'],'widths_cm':x['widths_cm'],'image':x['image']})
    out=[]
    for code in sorted(set(jcol)|set(mcol),key=lambda x:(len(x),x)):
        jj=jcol.get(code); mm=mcol.get(code); ja=jj is not None; ma=mm is not None
        out.append({'normalized_color':code,'jordan_color':jj['label'] if jj else None,'jordan_color_number':code if jj else None,'jordan_article_numbers':sorted(set(jj['article_numbers'])) if jj else [],'jordan_urls':sorted(set(jj['urls'])) if jj else [],'jordan_available':ja,
            'mplus_color':(mm['code']+' '+mm['name']) if mm else None,'mplus_color_number':mm['code'] if mm else None,'mplus_article_number':mm.get('article_number') if mm else None,'mplus_url':mm.get('url') if mm else None,'mplus_available':ma,
            'stock_jordan':'unbekannt (Login)' if ja else None,'stock_mplus':'unbekannt (Login)' if ma else None,
            'custom_size_available':ja,'edging_available':ja,'kettelleiste_available':None,'dropshipping_available':None,'rollenware_available':not j.get('tile',False) if j else None,
            'preferred_supplier':'jordan' if ja else ('mplus' if ma else None),'alternative_supplier':'mplus' if (ja and ma) else None,
            'note':None if (ja and ma) else ('nur Jordan' if ja else 'nur M-Plus - kein Wunschmass/Kettelservice annehmen')})
    return out
products=[]
for k,r in results.items():
    j=r['jordan']; b=r['best']; st=r['status']; q=b['mplus'] if (b and st!='NO_MATCH') else None; m=MR[q] if q else None; d=b['detail'] if b else {}
    reasons=[]; openq=[]
    if q:
        reasons.append(f"Belagsart {j['art']}{' Fliese' if j['tile'] else ''} beidseitig")
        for lab,key,ju,mu in [('Poleinsatzgewicht','pol',j['pol'],m['pol']),('Gesamtstaerke','staerke',j['staerke'],m['staerke']),('Polhoehe','polhoehe',j['polhoehe'],m['polhoehe'])]:
            if d.get(key) is True: reasons.append(f'{lab} gleich ({ju} / {mu})')
            elif d.get(key) is False: openq.append(f'{lab} weicht ab ({ju} vs. {mu})')
            else: openq.append(f'{lab} auf einer Seite nicht angegeben ({ju} / {mu})')
        for lab,key in [('Ruecken','ruecken'),('Nutzungsklasse','nk'),('Brandklasse','brand'),('Breite','widths')]:
            if d.get(key) is True: reasons.append(f'{lab} vereinbar')
            elif d.get(key) is False: openq.append(f'{lab} widerspricht')
        cc=d.get('colors_common',[]); reasons.append(f"{len(cc)} gemeinsame Farbnummern von {len(j['colors'])} (Jordan) / {len(m['colors'])} (M-Plus): {', '.join(cc)}")
        if d.get('name_link'): reasons.append('gleiche Qualitaetsbezeichnung/-nummer bei beiden')
        if m['hersteller']: reasons.append(f"Hersteller laut M-Plus-Leistungserklaerung: {m['hersteller']}")
        else: openq.append('Kein Herstellerbeleg auf M-Plus-Seite ('+(H.get(q,{}).get('hersteller_quelle') or '')+')')
        openq.append('Jordan-Leistungserklaerung nennt nur W. & L. Jordan - Herstellerbeleg fuer die Jordan-Seite fehlt')
        if r.get('review_note'): openq.append(r['review_note'])
        if r.get('aliases'): reasons.append('Jordan fuehrt dieselbe Ware auch als: '+', '.join(r['aliases']))
    else:
        top=r['candidates'][0] if r['candidates'] else None
        if top and top['score']>-99:
            mm=MR[top['mplus']]; dd=top['detail']
            reasons.append(f"Naechster Kandidat {mm['title']} (Punkte {top['score']}): "+', '.join(f'{x} abweichend' for x in ['pol','staerke','polhoehe','ruecken','nk','brand'] if dd.get(x) is False)+f"; gemeinsame Farbnummern {dd.get('colors_common')}")
        else: reasons.append('Kein M-Plus-Produkt derselben Belagsart')
    qual_word=(j['qualitaet'] or '').lower()
    rec={'jordan_alias_of':r.get('alias_of'),'jordan_aliases':r.get('aliases',[]),'tp_product':None,'tp_product_name':None,'jordan_product_name':j['names'][0],'jordan_product_names':j['names'],'mplus_product_name':m['title'] if m else None,'manufacturer_product_name':None,
         'manufacturer':m['hersteller'] if m else None,'manufacturer_source':(H.get(q,{}).get('hersteller_quelle') if q else None),'manufacturer_quality':None,
         'match_status':st,'match_score':b['score'] if b else None,'match_reasoning':reasons,'open_questions':openq,
         'jordan':{'collection':j['kollektion'],'quality':j['qualitaet'],'brand':j['marke'],'belagsart':j['art'],'tile':j['tile'],'article_number_pattern':re.sub(r'_\d+$','_<farbnr>',j['attributes'].get('Art. Nr.') or ''),'urls':j['urls'],'ean':j['ean'],'widths_cm':j['widths'],'docs':j['docs'],
                   'services':{'kettelung':'Serviceartikel "Teppicheinfassung Ketteln" (TEPKETT_001/002) bei Jordan - Anwendbarkeit je Qualitaet bestaetigen','masstteppich_artikel':qual_word in MASSQ},
                   'technical_data':{x:j['attributes'].get(x) for x in ['Teppich-Art','Struktur','Polmaterial','Poleinsatz gr/qm','Gewicht pro qm','Stärke (mm)','Polhöhe','Rückenausstattung','Nutzungsklasse','Luxusklasse','Brandverhalten','Trittschallverbesserung','Fußbodenheizung','Produktzertifizierung','Raumeignung','Treppeneignung','Stuhlrolleneignung','Lichtechtheit','Rapportfrei']},
                   'availability':{'listed':True,'stock':'unbekannt - nur mit Jordan-Kundenlogin','checked_at':today}},
         'mplus':({'quality':m['qualitaet'],'collection':m['collection'],'belagsart':m['art'],'tile':m['tile'],'article_number_first':artnr(m['art_nr']),'url':m['url'],'widths_cm':m['widths'],'docs':m['docs'],
                   'technical_data':{x:m['spec'].get(x) for x in ['Belagsart','Konstruktion / Struktur','Faserart','Poleinsatzgewicht per m² in g','Gesamtstärke in Millimeter','Florhöhe in millimeter','Rückenausstattung / Träger','Nutzungsklasse','Komfortklasse','Brandverhalten','Trittschallverbesserung in dB','Fußbodenheizung','Belagsformate','Einsatzbereich']},'eigenschaften':m['eigenschaften'],
                   'services':{'zuschnitt':'unbekannt - nicht annehmen','kettelung':'unbekannt'},'availability':{'listed':True,'stock':'unbekannt - nur mit M-Plus-Haendlerlogin','checked_at':today}} if m else None),
         'colors':colors_block(j,m,q)}
    c=rec['colors']; rec['color_summary']={'common':[x['normalized_color'] for x in c if x['jordan_available'] and x['mplus_available']],'jordan_only':[x['normalized_color'] for x in c if x['jordan_available'] and not x['mplus_available']],'mplus_only':[x['normalized_color'] for x in c if x['mplus_available'] and not x['jordan_available']]}
    products.append(rec)
matched=set(p['mplus_product_name'] for p in products if p['mplus'])
mplus_only=[]
for q,m in MR.items():
    if m['title'] in matched: continue
    mplus_only.append({'mplus_product_name':m['title'],'quality':m['qualitaet'],'collection':m['collection'],'belagsart':m['art'],'tile':m['tile'],'manufacturer':m['hersteller'],'manufacturer_source':H.get(q,{}).get('hersteller_quelle'),'article_number_first':artnr(m['art_nr']),'url':m['url'],'widths_cm':m['widths'],'colors':[{'mplus_color_number':c['code'],'mplus_color':c['name'],'mplus_available':True,'jordan_available':False,'custom_size_available':False,'edging_available':False,'preferred_supplier':'mplus'} for c in m['colors_raw']],'technical_data':{x:m['spec'].get(x) for x in ['Belagsart','Konstruktion / Struktur','Faserart','Poleinsatzgewicht per m² in g','Gesamtstärke in Millimeter','Florhöhe in millimeter','Rückenausstattung / Träger','Nutzungsklasse','Brandverhalten']},'match_status':'NO_MATCH','note':'nur bei M-Plus - kein Wunschmass/Kettelservice annehmen'})
cnt=collections.Counter(p['match_status'] for p in products)
ds={'schema_version':2,'category':'teppichboden','phase':'Vollabgleich (Phase 4)','generated_at':datetime.datetime.now().isoformat(timespec='seconds'),
    'summary':{'jordan_qualities':len(products),'mplus_qualities':len(MR),'status_counts':dict(cnt),'mplus_only_qualities':len(mplus_only),'jordan_color_articles':sum(len(p['jordan']['urls']) for p in products),'stock':'beide Shops nur mit Login - hier nur "gelistet"'},
    'status_definitions':{'MATCH_CONFIRMED':'gleiche Qualitaetsbezeichnung/-nummer, Technik und Farbnummern gleich, Hersteller ueber M-Plus-LE belegt','MATCH_PROBABLE':'Technik und Farbnummern gleich, Hersteller nur ueber M-Plus-LE belegt, keine Namensverbindung','MATCH_POSSIBLE':'Technik ohne Widerspruch, Farbnummern nur teilweise oder kein Herstellerbeleg','REVIEW_REQUIRED':'starke Farbuebereinstimmung, aber ein technisches Merkmal widerspricht, oder M-Plus-Qualitaet trifft mehrere Jordan-Qualitaeten','NO_MATCH':'kein Gegenstueck'},
    'products':products,'mplus_only':mplus_only}
os.makedirs(S+'/out',exist_ok=True)
json.dump(ds,open(S+'/out/abgleich-teppichboden.json','w'),indent=1,ensure_ascii=False)
with open(S+'/out/abgleich-teppichboden-qualitaeten.csv','w',newline='') as f:
    w=csv.writer(f,delimiter=';'); w.writerow(['status','jordan_kollektion','jordan_qualitaet','jordan_produktnamen','jordan_breiten','jordan_farben','mplus_produkt','mplus_kollektion','hersteller','farben_gemeinsam','farben_nur_jordan','farben_nur_mplus','punkte','offene_fragen'])
    for p in products: w.writerow([p['match_status'],p['jordan']['collection'],p['jordan']['quality'],' | '.join(p['jordan_product_names']),'/'.join(p['jordan']['widths_cm']),len([c for c in p['colors'] if c['jordan_available']]),p['mplus_product_name'] or '',p['mplus']['collection'] if p['mplus'] else '',p['manufacturer'] or '',len(p['color_summary']['common']),len(p['color_summary']['jordan_only']),len(p['color_summary']['mplus_only']),p['match_score'],' | '.join(p['open_questions'])])
    for m in mplus_only: w.writerow(['NO_MATCH (nur M-Plus)','','','','/'.join(m['widths_cm']),'',m['mplus_product_name'],m['collection'],m['manufacturer'] or '',0,0,len(m['colors']),'',''])
with open(S+'/out/abgleich-teppichboden-farben.csv','w',newline='') as f:
    w=csv.writer(f,delimiter=';'); w.writerow(['status','jordan_qualitaet','mplus_produkt','farbnr','jordan_farbe','jordan_artikelnummern','mplus_farbe','mplus_artikelnummer','jordan','mplus','wunschmass','kettelung','bevorzugt','alternativ','hinweis'])
    for p in products:
        for c in p['colors']: w.writerow([p['match_status'],p['jordan']['quality'],p['mplus_product_name'] or '',c['normalized_color'],c['jordan_color'] or '',','.join(c['jordan_article_numbers']),c['mplus_color'] or '',c['mplus_article_number'] or '','ja' if c['jordan_available'] else 'nein','ja' if c['mplus_available'] else 'nein','ja' if c['custom_size_available'] else 'nein','ja' if c['edging_available'] else 'nein',c['preferred_supplier'] or '',c['alternative_supplier'] or '',c['note'] or ''])
print('Jordan-Qualitaeten',len(products),dict(cnt),'| nur M-Plus',len(mplus_only))
