"""Lernlauf: wertet die lokalen Claude-Code-Protokolle der letzten Tage aus (nur lesend).

Aufruf: python3 scripts/lernlauf.py [--tage 7]

Zeigt Tokens je Tag und Modell, Modellangabe der Subagenten, wie oft der Benutzer
die Empfehlung einer Frage genommen hat (mit den Abweichungen), die haeufigsten
kurzen Benutzer-Nachrichten und je Chat Dauer und laengste Wartezeit.
Die Ausgabe enthaelt Chat-Inhalte: nicht ins Repository, nicht in Issues oder PRs.
"""

import argparse
import collections
import datetime as dt
import glob
import json
import os
import re

WURZEL = os.path.expanduser('~/.claude/projects')
MODELLE = ('fable', 'mythos', 'opus', 'sonnet', 'haiku')
EMPFEHLUNG = re.compile(r'empf|recommend', re.I)


def kurzmodell(name):
    return next((m for m in MODELLE if m in (name or '')), name or '?')


def antwort_zu(frage, ergebnis):
    """Antwort auf eine Frage aus dem Ergebnistext von AskUserQuestion, sonst None."""
    m = re.search(re.escape(frage) + r'"\s*=\s*"(.*?)"(?:,\s*"|\.|$)', ergebnis, re.S)
    return m.group(1) if m else None


def einordnen(optionen, antwort):
    """'unbeantwortet' | 'ohne Empfehlung' | 'Empfehlung genommen' | 'andere Option' | 'eigener Text'."""
    if antwort is None or 'did not answer' in antwort:
        return 'unbeantwortet'
    empfohlen = [o for o in optionen if EMPFEHLUNG.search(o)]
    if not empfohlen:
        return 'ohne Empfehlung'
    if any(o in antwort for o in empfohlen):
        return 'Empfehlung genommen'
    return 'andere Option' if any(o in antwort for o in optionen) else 'eigener Text'


def zeit(wert):
    try:
        return dt.datetime.fromisoformat(wert.replace('Z', '+00:00'))
    except (AttributeError, ValueError):
        return None


def auswerten(tage):
    seit = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=tage)
    tokens = collections.defaultdict(collections.Counter)
    subagenten = collections.defaultdict(collections.Counter)
    fragen = collections.Counter()
    abweichungen, chats, kurz, gesehen = [], [], collections.Counter(), set()
    for pfad in glob.glob(WURZEL + '/**/*.jsonl', recursive=True):
        if os.path.getmtime(pfad) < seit.timestamp():
            continue
        haupt = os.path.dirname(os.path.dirname(pfad)) == WURZEL
        chat = {'titel': '', 'start': None, 'ende': None, 'prompts': 0, 'warte': 0.0, 'geplant': False}
        offen, letzte = {}, None
        with open(pfad, errors='replace') as datei:
            for zeile in datei:
                try:
                    e = json.loads(zeile)
                except ValueError:
                    continue
                if e.get('type') == 'custom-title':
                    chat['titel'] = e.get('customTitle') or chat['titel']
                t = zeit(e.get('timestamp'))
                inhalt = (e.get('message') or {}).get('content')
                if e.get('type') == 'assistant' and t and t >= seit:
                    m = e['message']
                    tag = t.astimezone().date().isoformat()
                    chat['start'], chat['ende'], letzte = chat['start'] or t, t, t
                    for b in inhalt or []:
                        if b.get('type') != 'tool_use' or b['id'] in gesehen:
                            continue
                        gesehen.add(b['id'])
                        if b['name'] == 'AskUserQuestion':
                            offen[b['id']] = b.get('input', {}).get('questions', [])
                        elif b['name'] in ('Agent', 'Task'):
                            subagenten[tag][b.get('input', {}).get('model') or 'ohne Angabe'] += 1
                    if m.get('id') not in gesehen:  # eine Antwort steht je Inhaltsblock einmal im Protokoll
                        gesehen.add(m.get('id'))
                        u, mo = m.get('usage') or {}, kurzmodell(m.get('model'))
                        tokens[tag][mo, 'aus'] += u.get('output_tokens', 0)
                        tokens[tag][mo, 'neu'] += u.get('input_tokens', 0) + u.get('cache_creation_input_tokens', 0)
                elif e.get('type') == 'user' and not e.get('isMeta') and not e.get('isSidechain'):
                    text = inhalt if isinstance(inhalt, str) else ''
                    for b in inhalt if isinstance(inhalt, list) else []:
                        if b.get('type') == 'text':
                            text += b['text']
                        elif b.get('type') == 'tool_result' and b.get('tool_use_id') in offen and t and t >= seit:
                            r = b.get('content')
                            r = r if isinstance(r, str) else ' '.join(x.get('text', '') for x in r if isinstance(x, dict))
                            for q in offen.pop(b['tool_use_id']):
                                a = antwort_zu(q.get('question', ''), r)
                                art = einordnen([o.get('label', '') for o in q.get('options', [])], a)
                                fragen[art] += 1
                                if art in ('andere Option', 'eigener Text'):
                                    abweichungen.append((t.astimezone().strftime('%d.%m.'), q['question'][:90], ' '.join(a.split())[:70]))
                    text = text.strip()
                    if 'scheduled-task' in text[:300]:
                        chat['geplant'] = True
                    if haupt and text and t and t >= seit and not text.startswith(('<', '[', 'Caveat')):
                        chat['prompts'] += 1
                        if letzte:
                            chat['warte'] = max(chat['warte'], (t - letzte).total_seconds() / 3600)
                        if len(text) <= 60:
                            kurz[re.sub(r'\d+', 'N', text.lower())] += 1
        if haupt and chat['start'] and chat['prompts'] and not chat['geplant']:
            chats.append(chat)
    return tokens, subagenten, fragen, abweichungen, kurz, chats


def main():
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--tage', type=int, default=7)
    tokens, subagenten, fragen, abweichungen, kurz, chats = auswerten(p.parse_args().tage)

    print('== Tokens je Tag (Ausgabe in Tsd.; Anteil je Modell in %) ==')
    for tag in sorted(tokens):
        aus = {k[0]: v for k, v in tokens[tag].items() if k[1] == 'aus' and v}
        summe = sum(aus.values()) or 1
        neu = sum(v for k, v in tokens[tag].items() if k[1] == 'neu')
        print(f"{tag}  Ausgabe {summe/1e3:7.0f}  neue Eingabe {neu/1e3:7.0f}  " + '  '.join(f'{m} {v*100/summe:.0f}' for m, v in sorted(aus.items())))
    print('\n== Subagenten nach model-Angabe ==')
    for tag in sorted(subagenten):
        print(tag, dict(subagenten[tag]))
    print('\n== Fragen an den Benutzer ==')
    for art, n in fragen.most_common():
        print(f'{n:4}  {art}')
    for a in sorted(abweichungen):
        print('  abweichend:', ' | '.join(a))
    print('\n== Haeufigste kurze Benutzer-Nachrichten ==')
    for text, n in kurz.most_common(25):
        print(f'{n:4}  {text}')
    print('\n== Chats (Start, Dauer h, Nachrichten, laengste Wartezeit auf Benutzer h, Titel) ==')
    for c in sorted(chats, key=lambda c: c['start']):
        dauer = (c['ende'] - c['start']).total_seconds() / 3600
        print(f"{c['start'].astimezone().strftime('%d.%m. %H:%M')} {dauer:6.1f} {c['prompts']:4} {c['warte']:6.1f}  {c['titel'][:70]}")


if __name__ == '__main__':
    main()
