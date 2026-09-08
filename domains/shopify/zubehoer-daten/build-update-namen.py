#!/usr/bin/env python3
"""Zubehoer: Herstellernamen im Titel, Hersteller-Zeile, Herstellerangaben, Marke-Metafeld/-Tag.
Erzeugt ProductUpdateInput-Batches (update-namen-*.json)."""
import json, re, os, html
HERE=os.path.dirname(os.path.abspath(__file__))
plan={p["supplier_pid"]:p for p in json.load(open(f"{HERE}/import-plan.json"))}
raw=json.load(open(f"{HERE}/jordan-zubehoer.json"))
ids=json.load(open(f"{HERE}/product-ids.json"))
TITEL={
"531452":"Übergangsprofil Alu eloxiert 28 × 1,5 mm, selbstklebend","531397":"Übergangsprofil Alu eloxiert 28 × 1,5 mm, gebohrt",
"507698":"JOKA Basic-Allrounder Übergangsprofil 7–15 mm, schraubbar","507990":"JOKA Basic-Allrounder Anpassungsprofil 7–15 mm, schraubbar",
"595812":"JOKA Mini APL Übergangsprofil 5–9 mm, schraubbar","474871":"Abschlussprofil Alu eloxiert 34 × 8,5 mm, selbstklebend",
"468005":"Abschlussprofil Alu eloxiert 47 × 15 mm, gebohrt","507816":"JOKA Basic-Allrounder Abschlussprofil 7–15 mm, schraubbar",
"531660":"Winkelprofil Alu eloxiert 18 × 24,5 mm, selbstklebend","517295":"Treppenkantenprofil Alu eloxiert 40 × 37 × 2,5 mm, gebohrt",
"492442":"JOKA JK 27 Universalklebstoff für Textil, PVC und CV","400":"JOKA JK 26 Designbelagsklebstoff","468616":"JOKA JK 20 Linoleumklebstoff",
"361881":"JOKA JK 22 Textilklebstoff","474697":"UZIN KE 2000 S Universal-Nass- und Haftklebstoff","473388":"UZIN U 3000 Haftfixierung für Designböden",
"461722":"UZIN Unifix wasserablösbare Dispersionsfixierung","493253":"JOKA JK 01 Dispersionsgrundierung","364849":"JOKA JK 13 Spachtelmasse zementär",
"540180":"JOKA JK 19 Fix Blitzspachtel zementär","526344":"JOKA JK 34 Silikon-Dichtstoff 310 ml, dauerelastisch","398":"Acryl-Dichtstoff überstreichbar 310 ml",
"464864":"AKO Elastic Teppichunterlage, Rollenware","4388425":"AKO Prima Antirutsch-Unterlage, Rollenware","415920":"JOKA JK 108 JOKAsoft Komfortunterlage für Teppichboden",
"1896048":"JOKA JK 139+ Silent Design Unterlage 1,5 mm","548499":"JOKA JK 124 XPS-Trittschalldämmung","507527":"JOKA JK 120 PE-Folie Aqua-Stop 0,2 mm",
"632868":"JOKA JK 145 Maler-Abdeckvlies saugstark","637765":"JOKA PUR Reiniger","467346":"Dr. Schutz Fußbodenreiniger R 1000",
"497239":"Dr. Schutz Teppichreiniger Konzentrat","467482":"Dr. Schutz Laminat-Reiniger","467389":"Dr. Schutz PU-Reiniger","637719":"JOKA Designpflege matt",
"635797":"UZIN U-Tack Universal-Sockelklebeband","468076":"SwitchTec Goman Trockenkleber-Band","492896":"SwitchTec Remur Verlegeband",
"396694":"SwitchTec Sigan Elements Universal Tape 70 mm","370143":"SwitchTec Sigan 3 Trockenklebstoff, Rolle 75 cm",
"3915101":"Forbo Coral Brush Sauberlaufmatte 55 × 90 cm","3471097":"Forbo Coral Brush Sauberlaufmatte 90 × 155 cm","3471085":"Forbo Coral Brush Sauberlaufmatte 135 × 205 cm"}
MARKE_FIX={"1896048":"JOKA","531452":"","531397":"","474871":"","468005":"","531660":"","517295":"","398":""}
import importlib.util
spec=importlib.util.spec_from_file_location("bp",f"{HERE}/build-productset.py"); bp=importlib.util.module_from_spec(spec); spec.loader.exec_module(bp)
def esc(s): return html.escape(str(s or ""),quote=False)
EXTRA={ # zusaetzliche Zeilen/Absaetze, die beim Import von Hand ergaenzt wurden
"464864":("Der Preis gilt je laufendem Meter in der gewählten Breite; die Stückzahl entspricht der Länge in Metern.",[("Verkaufseinheit","1 laufender Meter")]),
"4388425":("Der Preis gilt je laufendem Meter in der gewählten Breite; die Stückzahl entspricht der Länge in Metern.",[("Verkaufseinheit","1 laufender Meter")]),
"415920":("Wird als ganze Rolle geliefert.",[("Verkaufseinheit","Rolle mit 30,14 m²")]),
"1896048":("Der Preis gilt je Quadratmeter; die Stückzahl entspricht der Fläche in m².",[("Stärke","1,5 mm"),("Verkaufseinheit","1 m²")]),
"548499":("",[("Verkaufseinheit","Paket mit 15 m²")]),"507527":("",[("Stärke","0,2 mm"),("Verkaufseinheit","Rolle mit 30 m² oder 100 m²")]),
"632868":("",[("Gewicht","220 g/m²"),("Verkaufseinheit","Rolle 50 m × 100 cm")]),"635797":("",[("Verkaufseinheit","Rolle 50 m, 8 Breiten")]),
"468076":("",[("Verkaufseinheit","Rolle 50 m, 2 Breiten")]),"492896":("",[("Verkaufseinheit","Rolle 50 m, 3 Breiten")]),
"396694":("",[("Verkaufseinheit","Rolle 70 mm × 25 m")]),"370143":("",[("Verkaufseinheit","Rolle 75 cm × 25 m (20 m²)")]),
"526344":("",[("Gebinde","310-ml-Kartusche, 26 Farben")]),"398":("",[("Gebinde","310-ml-Kartusche, Weiß oder Transparent")]),
"3915101":("",[("Maße","55 × 90 cm")]),"3471097":("",[("Maße","90 × 155 cm")]),"3471085":("",[("Maße","135 × 205 cm")]),
}
def description(pid,p,title,marke):
    intro=bp.INTRO[pid]; extra_p,extra_rows=EXTRA.get(pid,("",[]))
    if extra_p: intro=intro+" "+extra_p
    r=raw[pid]; sd=(r.get("description") or "").strip(); st=p["supplier_title"]
    herst = sd if (sd and len(sd)>60 and not sd.startswith(st[:20]) and "Anmeldung" not in sd) else ""
    rows=[("Eignung",bp.EIGNUNG[p["kategorie"]])]
    if marke: rows.append(("Hersteller",marke))
    if p["option_names"]: rows.append(("Varianten",f"{len(p['variants'])} ({', '.join(p['option_names'])})"))
    a=r["variants"][0].get("attrs",{})
    if a.get("Ca.-Verbrauch") and a["Ca.-Verbrauch"] not in ("0",""): rows.append(("Verbrauch ca.",a["Ca.-Verbrauch"]))
    if p["kategorie"] in ("uebergangsprofile","abschlussprofile"):
        rows.append(("Längen",", ".join(sorted({v["options"].get("Länge","") for v in p["variants"] if v["options"].get("Länge")},key=lambda x:int(x.split()[0])))))
    if p["kategorie"] in ("kleber","bauchemie","reinigung") and pid not in ("526344","398"):
        rows.append(("Gebinde",", ".join(v["options"].get("Gebinde") or v["options"].get("Ausführung","") for v in p["variants"])))
    rows+=extra_rows
    badges="".join(f'<span class="pd-badge">{esc(b)}</span>' for b in bp.BADGES[p["kategorie"]])
    specs="".join(f"<tr>\n<th>{esc(k)}</th>\n<td>{esc(v)}</td>\n</tr>\n" for k,v in rows)
    h=f'<div class="pd-card">\n<h3>{esc(title)}</h3>\n<p>{esc(intro)}</p>\n'
    if herst: h+=f'<p class="pd-hersteller"><strong>Herstellerangaben:</strong> {esc(herst)}</p>\n'
    h+=f'<div class="pd-badges">\n{badges}\n</div>\n<table class="pd-specs">\n{specs}</table>\n</div>'
    return h
out=[]
for pid,p in plan.items():
    title=TITEL[pid]; marke=MARKE_FIX.get(pid,p["marke"]); cat=p["kategorie"]
    art={"uebergangsprofile":"uebergangsprofile","abschlussprofile":"abschlussprofile","kleber":"kleber-und-fixierung","bauchemie":"bauchemie","unterlagen":"verlege-und-daemmunterlagen","reinigung":"reinigungsmittel","verlegeband":"verlegeband","sauberlauf":"sauberlauf"}[cat]
    tags=["zubehoer",f"art: {art}"]+([f"marke: {marke.lower()}"] if marke else [])
    seo_t=f"{title} | TeppichParadies"; seo_d=bp.SEO_DESC[cat].format(t=title)
    mfs=[{"namespace":"global","key":"title_tag","type":"string","value":seo_t},{"namespace":"global","key":"description_tag","type":"string","value":seo_d}]
    if marke: mfs.append({"namespace":"custom","key":"marke","type":"single_line_text_field","value":marke})
    out.append({"id":ids[p["handle"]],"title":title,"tags":tags,"seo":{"title":seo_t,"description":seo_d},"descriptionHtml":description(pid,p,title,marke),"metafields":mfs})
B="/private/tmp/claude-502/-Users-tristan-teppich-paradies-shopify-ai/1b248fc1-a3ed-40cf-8150-e4881038911b/scratchpad"
for i in range(0,len(out),15):
    open(f"{B}/namen{i//15}.json","w").write(json.dumps({f"p{j}":x for j,x in enumerate(out[i:i+15])},ensure_ascii=False,separators=(",",":")))
json.dump(out,open(f"{HERE}/update-namen.json","w"),ensure_ascii=False,indent=1)
print(len(out)); print(out[10]["descriptionHtml"][:900])
