import json,re,os,datetime,collections
S=os.path.dirname(os.path.abspath(__file__))
J=json.load(open(S+'/jordan/products.json')); M=json.load(open(S+'/mplus/products.json'))
JC=json.load(open(S+'/jordan/color_articles.json')); MC=json.load(open(S+'/mplus/colors.json'))
MASS=json.load(open(S+'/jordan/masstteppich_articles.json'))
def artnr(a):
    import re as _r
    return _r.sub(r'^(\d{4})(\d{6})$',r'\1-\2',a) if a else a
def ccode(c):
    m=re.findall(r'\d+',c); return str(int(m[-1])) if m else c
SHOPIFY={'Strong 733':('Fortiva Nadelvlies Teppichboden 200cm','gid://shopify/Product/16020483440974'),'Strong 966 Fliese':('Quadra Nadelvlies Teppichfliese 50x50cm','gid://shopify/Product/16020510277966'),'Trend 026 Plaza':('Vantana Teppichboden 400cm 500cm','gid://shopify/Product/15983218557262'),'Sprint 027 Riva':('Amara Teppichboden 400cm 500cm','gid://shopify/Product/15982632567118'),'Sprint 027 Altro':('Altessa Teppichboden 400cm 500cm','gid://shopify/Product/15983006908750'),'Trend 026 Terra':('Novaris Teppichboden 400cm 500cm','gid://shopify/Product/15983225012558'),'030 Wool & Sisal Calais':('Callista Teppichboden 400cm 500cm','gid://shopify/Product/15983022735694'),'Omega 028 Format Object':('Kontura Teppichboden 400cm','gid://shopify/Product/15982562115918'),'Sprint 027 Lara':('Vallora Teppichboden 400cm 500cm','gid://shopify/Product/15982984954190'),'Trend 026 Rigoletto':('Reganza Teppichboden 400cm 500cm','gid://shopify/Product/15983222587726')}
# Entscheidungen des Testlaufs (manuell aus match_out.txt + DoP-Pruefung abgeleitet)
DECISION={
 'Strong 733':dict(mplus='MPlus-Analog-2029-733',status='MATCH_CONFIRMED',manufacturer='Vebe Floorcoverings bv (NL-8280 Genemuiden)',manufacturer_source='M-Plus Leistungserklaerung Analog 29 Strong 733 (Hersteller: Vebe Floorcoverings bv)',
   reasoning=['Identische Qualitaetsbezeichnung "Strong 733" bei beiden Grosshaendlern','Nadelvlies, Poleinsatzgewicht 800 g/m², Gesamtstaerke 5 mm, NK 33, Cfl-s1, Rollenbreite 200 cm - alle Werte gleich','70 % PP / 30 % PA (Jordan: Solution-Dyed; M-Plus: dorix PA) - gleiche Faserzusammensetzung','10 von 10 M-Plus-Farbnummern kommen bei Jordan mit identischer Nummer vor (21, 44, 54, 56, 85, 88, 89, 142, 180, 181)','Hersteller ueber M-Plus-DoP belegt: Vebe Floorcoverings; Jordan-DoP nennt nur W. & L. Jordan (Eigenmarke)'],
   open=['Jordan fuehrt 3 Farben mehr (16, 24, 120) - bei M-Plus nicht gelistet','Rueckenbezeichnung abweichend benannt (Jordan "Latexvollbad", M-Plus "Latex Vlies / Comfortruecken") - technisch vereinbar, nicht widerspruechlich']),
 'Strong 966 Fliese':dict(mplus='MPlus-Analog-2029-966',status='MATCH_CONFIRMED',manufacturer='Vebe Floorcoverings bv (NL-8280 Genemuiden)',manufacturer_source='M-Plus Leistungserklaerung Analog 29 Strong 966 (Hersteller: Vebe Floorcoverings bv)',
   reasoning=['Identische Qualitaetsbezeichnung "Strong 966" (Fliese 50x50 cm) bei beiden','Nadelvlies, Poleinsatzgewicht 500 g/m², NK 33, Bfl-s1, Fliese 50x50 cm - gleich','8 von 8 M-Plus-Farbnummern bei Jordan vorhanden (39, 50, 70, 72, 80, 85, 89, 141)','Hersteller ueber M-Plus-DoP belegt: Vebe Floorcoverings'],
   open=['Jordan fuehrt 2 Farben mehr (24, 181)','Ruecken: Jordan "Beyond ECO", M-Plus "Schwerbeschichtung" - Bezeichnungen abweichend, Gesamtgewicht (Jordan 3.170 g/m²) spricht fuer Schwerbeschichtung; M-Plus-Datenblatt gegenpruefen']),
 'Trend 026 Plaza':dict(mplus='M-Plus-Akzente-2029-2403-TR',status='MATCH_PROBABLE',manufacturer='Condor Carpets bv (NL) - laut M-Plus-DoP; fuer Jordan Plaza nicht direkt belegt',manufacturer_source='M-Plus Leistungserklaerung LE_Akzente_29_2403 (Hersteller: Condor Carpets bv); Jordan-DoP nennt nur W. & L. Jordan',
   reasoning=['Technische Daten vollstaendig gleich: Tuft-Velours, Poleinsatz 1.100 g/m², Gesamtstaerke 9 mm, Polhoehe 7 mm, Textilruecken, NK 32, Cfl-s1, 400 + 500 cm, 100 % PA solution dyed','Alle 7 M-Plus-Farbnummern (22, 70, 72, 75, 76, 90, 178) kommen bei Jordan mit identischer Nummer vor - inkl. der untypischen 178','Keine Namensaehnlichkeit (Plaza vs. 2403) - Match ausschliesslich ueber Daten'],
   open=['Herstellerbeleg nur auf M-Plus-Seite (Condor). Bestaetigung fuer Jordan Plaza fehlt (z. B. GUT-PRODIS-Eintrag oder Rueckfrage Jordan-Vertrieb) - deshalb PROBABLE statt CONFIRMED','Jordan fuehrt 11 Farben mehr (42, 77, 78, 79, 80, 83, 85, 86, 92, 93, 94)']),
 'Sprint 027 Riva':dict(mplus=None,status='NO_MATCH',manufacturer=None,manufacturer_source='Jordan-DoP nennt W. & L. Jordan; kein Beleg',reasoning=['Naechster Kandidat M-Plus Avantgarde 2029 2205 (ITC Co BV): Pol 540 vs. 525 g/m², Polhoehe 2,9 vs. 2,6 mm, NK 23/33 vs. 32, Brandklasse Bfl-s1 vs. Cfl-s1 - zu viele Abweichungen','3 gemeinsame Farbnummern (14, 39, 95) sind bei niedrigen Nummern kein Beleg'],open=['Falls Jordan-Vertrieb den Hersteller nennt, erneut gegen M-Plus pruefen']),
 'Trend 026 Terra':dict(mplus=None,status='NO_MATCH',manufacturer=None,manufacturer_source='kein Beleg',reasoning=['Naechster Kandidat Avantgarde 2029 2210 (ITC): Polhoehe 4,5 vs. 5,5 mm, NK 23/32 vs. 33, Pol 620 vs. 650 - abweichend','Nur 3 von 14 Farbnummern gemeinsam'],open=[]),
 'Sprint 027 Altro':dict(mplus=None,status='NO_MATCH',manufacturer=None,manufacturer_source='kein Beleg',reasoning=['Kein M-Plus-Produkt mit 100 % PP Loop, 500 g/m² Pol, Vliesruecken, Efl'],open=[]),
 'Sprint 027 Lara':dict(mplus=None,status='NO_MATCH',manufacturer=None,manufacturer_source='kein Beleg',reasoning=['Naechster Kandidat Akzente 2029 2416-FB (Associated Weavers): Pol 1.400 vs. 1.450, Staerke/Polhoehe gleich, aber Filz-/Comfortruecken statt Textilruecken und nur 1 gemeinsame Farbnummer (92)','Jordan Lara ist 100 % recyceltes Polyester - M-Plus 2416 laut Faserart Solution dyed PES; Ruecken widerspricht'],open=['Ruecken bei Jordan Lara im Datenblatt gegenpruefen; falls doch Vlies, Kandidat 2416 erneut bewerten']),
 'Trend 026 Rigoletto':dict(mplus=None,status='NO_MATCH',manufacturer=None,manufacturer_source='kein Beleg',reasoning=['Kein M-Plus-Produkt mit 2.500 g/m² Pol, 15 mm, Uni-Saxony'],open=[]),
 'Omega 028 Format Object':dict(mplus=None,status='NO_MATCH',manufacturer=None,manufacturer_source='kein Beleg',reasoning=['Naechster Kandidat Extrem 2029 TB 1158 (Pol 800, PH 3,0): nur 4 Farben, keine gemeinsame Farbnummer'],open=[]),
 '030 Wool & Sisal Calais':dict(mplus=None,status='NO_MATCH',manufacturer=None,manufacturer_source='kein Beleg',reasoning=['M-Plus fuehrt Naturfaser nur in Ambiente 2025 1307/1308 - abweichende Daten','Jordan Calais: 100 % Schurwolle Boucle, 1.200 g/m², 7,8 mm, Maßteppich moeglich'],open=['Ambiente 2025 1307/1308 im Detail gegen Calais pruefen (Datenblatt)']),
}
MASSQ=sorted(set(re.sub(r'^Teppichboden (\S+) Maßteppich.*',r'\1',re.sub(r'\s+',' ',x['name'])) for x in MASS if 'Maßteppich' in x['name']))
def jordan_block(k,v):
    vs=list(v['variants'].values()); a=vs[0]['attributes']
    arts=JC.get(k,[])
    return {'product_names':sorted(v['variants'].keys()),'collection':a.get('Kollektionsname'),'brand':a.get('Marke'),'quality':a.get('Qualität'),
            'article_number_pattern':re.sub(r'_\d+$','_<farbnr>',a.get('Art. Nr.') or ''),'urls':[p['url'] for p in vs],'ean':[p['attributes'].get('EAN Nummer') for p in vs],
            'widths_cm':sorted(set(str(int(float(p['attributes'].get('Breite (mm)','0').replace('.',''))//10)) for p in vs if p['attributes'].get('Breite (mm)'))),
            'docs':vs[0]['docs'],'services':{'kettelung':'Serviceartikel "Teppicheinfassung Ketteln" (TEPKETT_001/002) bei Jordan vorhanden - Anwendbarkeit je Qualitaet bestaetigen','masstteppich_artikel':k.split()[-1] in MASSQ,'masstteppich_im_datenblatt':k=='030 Wool & Sisal Calais'},
            'technical_data':{x:a.get(x) for x in ['Teppich-Art','Struktur','Polmaterial','Poleinsatz gr/qm','Gewicht pro qm','Stärke (mm)','Polhöhe','Rückenausstattung','Nutzungsklasse','Luxusklasse','Brandverhalten','Trittschallverbesserung','Fußbodenheizung','Produktzertifizierung','Raumeignung','Treppeneignung','Stuhlrolleneignung']},
            'availability':{'listed':True,'stock':'unbekannt - Bestand/Preis nur mit Jordan-Kundenlogin sichtbar','checked_at':datetime.date.today().isoformat()}}
def mplus_block(q):
    r=M[q]; s=r['spec']
    return {'product_name':r['title'],'quality':s.get('Qualität'),'collection':r['collection'],'article_number_first':artnr(r['art_nr_first']),'url':r['url'],'widths_cm':r['widths_cm'],'docs':r['docs'],
            'technical_data':{x:s.get(x) for x in ['Belagsart','Konstruktion / Struktur','Faserart','Poleinsatzgewicht per m² in g','Gesamtstärke in Millimeter','Florhöhe in millimeter','Rückenausstattung / Träger','Nutzungsklasse','Komfortklasse','Brandverhalten','Trittschallverbesserung in dB','Fußbodenheizung','Belagsformate','Einsatzbereich']},'eigenschaften':r['eigenschaften'],
            'services':{'zuschnitt':'unbekannt - M-Plus-Seite nennt keinen Zuschnitt-/Kettelservice; nicht annehmen','kettelung':'unbekannt'},
            'availability':{'listed':True,'stock':'unbekannt - Bestand/Preis nur mit M-Plus-Haendlerlogin sichtbar','checked_at':datetime.date.today().isoformat()}}
def colors_block(k,v,q):
    jcol={}
    for name,p in v['variants'].items():
        for c in p['colors']:
            code=ccode(c['label']); jcol.setdefault(code,{'label':c['label'],'ids':[],'names':[]}); jcol[code]['ids'].append(c['id']); jcol[code]['names'].append(name)
    jart={}
    for x in JC.get(k,[]):
        code=ccode(x['farbe'] or x['art_nr'].split('_')[-1]); jart.setdefault(code,[]).append({'article_number':x['art_nr'],'product_name':x['name'],'url':x['url']})
    mcol={}
    if q:
        for c in M[q]['colors']:
            if c['code']: mcol[ccode(c['code'])]={'code':c['code'],'name':c['name']}
        for art,x in MC.get(q,{}).items():
            if x['farbe']:
                code=ccode(x['farbe'].split()[0]); mcol.setdefault(code,{'code':x['farbe'].split()[0],'name':' '.join(x['farbe'].split()[1:])}); mcol[code].update({'article_number':artnr(x['art_nr']),'url':x['url'],'widths_cm':x['widths_cm'],'image':x['image']})
    out=[]
    for code in sorted(set(jcol)|set(mcol),key=lambda x:(len(x),x)):
        j=jcol.get(code); m=mcol.get(code)
        ja=j is not None; ma=m is not None
        out.append({'normalized_color':code,
            'jordan_color':j['label'] if j else None,'jordan_color_number':code if j else None,'jordan_article_numbers':[x['article_number'] for x in jart.get(code,[])],'jordan_urls':[f"https://www.jordanshop.de/de-DE/product/{i}" for i in j['ids']] if j else [],'jordan_available':ja,
            'mplus_color':(m['code']+' '+m['name']) if m else None,'mplus_color_number':m['code'] if m else None,'mplus_article_number':m.get('article_number') if m else None,'mplus_url':m.get('url') if m else None,'mplus_available':ma,
            'stock_jordan':'unbekannt (Login)' if ja else None,'stock_mplus':'unbekannt (Login)' if ma else None,
            'custom_size_available':ja,'edging_available':ja,'kettelleiste_available':None,'dropshipping_available':None,'rollenware_available':True,
            'preferred_supplier':'jordan' if ja else ('mplus' if ma else None),'alternative_supplier':'mplus' if (ja and ma) else None,
            'note':None if (ja and ma) else ('nur Jordan' if ja else 'nur M-Plus - kein Wunschmass/Kettelservice annehmen')})
    return out
products=[]
for k,v in J.items():
    d=DECISION[k]; q=d['mplus']
    rec={'tp_product':{'title':SHOPIFY[k][0],'shopify_id':SHOPIFY[k][1],'note':'bestehendes Shopify-Produkt (Quelle Jordan); Eigenname bleibt'},
         'tp_product_name':SHOPIFY[k][0].split(' Teppich')[0].split(' Nadelvlies')[0],'jordan_product_name':sorted(v['variants'].keys())[0],'mplus_product_name':M[q]['title'] if q else None,'manufacturer_product_name':None,
         'manufacturer':d['manufacturer'],'manufacturer_source':d['manufacturer_source'],'manufacturer_quality':None,
         'match_status':d['status'],'match_reasoning':d['reasoning'],'open_questions':d['open'],
         'jordan':jordan_block(k,v),'mplus':mplus_block(q) if q else None,
         'colors':colors_block(k,v,q)}
    c=rec['colors']; rec['color_summary']={'common':[x['normalized_color'] for x in c if x['jordan_available'] and x['mplus_available']],'jordan_only':[x['normalized_color'] for x in c if x['jordan_available'] and not x['mplus_available']],'mplus_only':[x['normalized_color'] for x in c if x['mplus_available'] and not x['jordan_available']]}
    products.append(rec)
ds={'schema_version':1,'category':'teppichboden','phase':'Testlauf (Phase 2)','generated_at':datetime.datetime.now().isoformat(timespec='seconds'),
    'sources':{'jordan':{'shop':'https://www.jordanshop.de','method':'Quicksearch-API (/de-DE/quicksearch?query=) fuer Artikelnummern je Farbe; Produktseite /de-DE/product/<id> per curl (SSR: Attributtabelle, Farbvarianten-Select, Dokumente); PDFs TTD/DoP/GUT','stock':'nicht ohne Login'},
               'mplus':{'shop':'https://www.m-plus.de','method':'Kategorie Textile Bodenbelaege /c/20.1 mit Facette Kollektion (CMSME000670) und page=5 (max. 100 Treffer je Abfrage); Produktseite per curl (SSR: Farbtonliste, Spezifikationen, Downloads); Leistungserklaerungen (LE_*.pdf) nennen den Hersteller','stock':'nicht ohne Login'}},
    'status_definitions':{'MATCH_CONFIRMED':'Hersteller belegt und technische Daten sowie Farbnummern uebereinstimmend','MATCH_PROBABLE':'Technische Daten und Farbnummern uebereinstimmend, Herstellerbeleg fehlt auf einer Seite','MATCH_POSSIBLE':'Teilweise Uebereinstimmung, keine Sicherheit','NO_MATCH':'Kein passendes Produkt beim anderen Grosshaendler','REVIEW_REQUIRED':'Widerspruechliche Angaben, manuelle Pruefung'},
    'jordan_masstteppich_qualitaeten':MASSQ,
    'products':products}
os.makedirs(S+'/out',exist_ok=True)
json.dump(ds,open(S+'/out/abgleich-testlauf.json','w'),indent=1,ensure_ascii=False)
for p in products: print(p['match_status'].ljust(16),p['jordan_product_name'].ljust(50),'->',(p['mplus_product_name'] or '-').ljust(45),'| gemeinsam',len(p['color_summary']['common']),'nurJ',len(p['color_summary']['jordan_only']),'nurM',len(p['color_summary']['mplus_only']))
print('Massteppich-Qualitaeten Jordan:',MASSQ)
