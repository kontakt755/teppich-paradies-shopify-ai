#!/usr/bin/env python3
"""Ordnet jede Datei eines gezogenen Themes einem Git-Stand zu.

Aufruf im Repo-Root:  python3 theme-herkunft.py <theme-ordner> [--tage 14]

Vergleicht per Git-Blob-Hash gegen origin/main, alle Remote-Branches der letzten
N Tage und alle lokalen Branches. Meldet, welche Dateien gleich main sind, aus
welchem Branch sie stammen und welche zu keinem Git-Stand passen.
"""
import collections, os, subprocess, sys, time

THEME_DIRS = ('assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates')


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True).stdout


def main():
    root = sys.argv[1]
    days = int(sys.argv[sys.argv.index('--tage') + 1]) if '--tage' in sys.argv else 14
    cutoff = time.time() - days * 86400
    refs = []
    for line in git('for-each-ref', '--format=%(refname:short) %(committerdate:unix)',
                    'refs/remotes/origin', 'refs/heads').splitlines():
        name, ts = line.rsplit(' ', 1)
        if name.endswith('/HEAD'):
            continue
        if name.startswith('origin/') and int(ts) < cutoff and name != 'origin/main':
            continue
        refs.append(name)

    index = collections.defaultdict(set)
    main_blobs = {}
    for ref in refs:
        for line in git('ls-tree', '-r', ref).splitlines():
            meta, path = line.split('\t', 1)
            if path.split('/')[0] not in THEME_DIRS:
                continue
            sha = meta.split()[2]
            index[(sha, path)].add(ref)
            if ref == 'origin/main':
                main_blobs[path] = sha

    files = sorted(os.path.relpath(os.path.join(d, f), root)
                   for d, _, fs in os.walk(root) for f in fs)
    files = [f for f in files if f.split('/')[0] in THEME_DIRS]
    shas = subprocess.run(['git', 'hash-object', '--stdin-paths'],
                          input='\n'.join(os.path.join(root, f) for f in files),
                          capture_output=True, text=True).stdout.split()

    same, by_ref, orphan = 0, collections.defaultdict(list), []
    for path, sha in zip(files, shas):
        if main_blobs.get(path) == sha:
            same += 1
            continue
        owners = sorted(r.replace('origin/', '') for r in index.get((sha, path), ())
                        if r not in ('origin/main', 'main'))
        if owners:
            owners = list(dict.fromkeys(owners))
            label = ' | '.join(owners[:4]) + (f' (+{len(owners) - 4} weitere)' if len(owners) > 4 else '')
            by_ref[label].append(path)
        else:
            orphan.append(f"{path} ({'neu' if path not in main_blobs else 'geaendert'})")

    missing = sorted(set(main_blobs) - set(files))
    print(f'{len(files)} Dateien: {same} = main, {sum(map(len, by_ref.values()))} aus Branches, '
          f'{len(orphan)} ohne Git-Stand, {len(missing)} auf main aber nicht im Theme')
    for owners, paths in sorted(by_ref.items(), key=lambda kv: -len(kv[1])):
        print(f'  [{len(paths):3}] {owners}: {" ".join(paths[:6])}{" ..." if len(paths) > 6 else ""}')
    if orphan:
        print('  OHNE GIT-STAND:')
        for entry in orphan:
            print(f'     {entry}')
    if missing:
        print('  fehlt gegenueber main:', ' '.join(missing))


if __name__ == '__main__':
    main()
