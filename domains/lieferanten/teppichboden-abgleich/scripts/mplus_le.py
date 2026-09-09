import json,urllib.request,re,os,time,sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))+'/py')
from pypdf import PdfReader
S=os.path.dirname(os.path.abspath(__file__)); P=S+'/mplus/pdf'; os.makedirs(P,exist_ok=True)
M=json.load(open(S+'/mplus/products.json'))
out=json.load(open(S+'/mplus/hersteller.json')) if os.path.exists(S+'/mplus/hersteller.json') else {}
for q,r in M.items():
    if q in out: continue
    rec={'le_files':[],'hersteller':None,'hersteller_raw':[]}
    for u in r['docs']:
        fn=u.split('/')[-1]
        if not re.search(r'(?i)^(LE_|Leistungserkl|DoP)',fn): continue
        f=P+'/'+q+'__'+fn
        if not os.path.exists(f):
            try: urllib.request.urlretrieve(u,f); time.sleep(1)
            except Exception as e: print('ERR',u,e,flush=True); continue
        try: t='\n'.join((pg.extract_text() or '') for pg in PdfReader(f).pages[:2])
        except Exception as e: print('PDF-ERR',f,e,flush=True); continue
        open(f+'.txt','w').write(t)
        firms=sorted(set(x.strip() for x in re.findall(r'([A-ZÄÖÜ][A-Za-zäöüß&.\- ]{2,50}(?:GmbH & Co\. KG|GmbH|AG|N\.?V\.?|B\.?V\.?|S\.?A\.?|Ltd|KG|S\.?p\.?A\.?|bv|BV|NV|Co BV|Co\. KG)[^\n]{0,70})',t)))
        firms=[f2 for f2 in firms if not re.search(r'(?i)Textiles & Flooring|TFI|Rheinland|Institut|Notifizierte|Prüf',f2)]
        m=re.search(r'(?i)Hersteller:\s*\n?\s*([^\n]+)',t)
        rec['le_files'].append(fn); rec['hersteller_raw']+=firms
        if m and not rec['hersteller']: rec['hersteller']=m.group(1).strip()
    if not rec['hersteller'] and rec['hersteller_raw']: rec['hersteller']=rec['hersteller_raw'][0]
    out[q]=rec; json.dump(out,open(S+'/mplus/hersteller.json','w'),indent=1,ensure_ascii=False)
    print(q,'|',rec['hersteller'],'|',rec['le_files'],flush=True)
print('done')
