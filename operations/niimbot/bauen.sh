#!/bin/sh
# Baut die Bluetooth-Bruecke fuer den Niimbot B1 als kleines App-Buendel (nur macOS, nur Bordmittel:
# swiftc und codesign aus den Xcode Command Line Tools). Ein App-Buendel braucht es, weil macOS die
# Bluetooth-Erlaubnis an einer Info.plist mit Begruendung festmacht.
# Aufruf: npm run niimbot:bauen   (Ziel: ~/Library/Application Support/TeppichParadies/NiimbotBruecke.app)
set -eu
HIER="$(cd "$(dirname "$0")" && pwd)"
ZIEL="${TP_NIIMBOT_APP:-$HOME/Library/Application Support/TeppichParadies/NiimbotBruecke.app}"
mkdir -p "$ZIEL/Contents/MacOS"
cat > "$ZIEL/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>net.teppich-paradies.niimbot-bruecke</string>
<key>CFBundleName</key><string>NiimbotBruecke</string>
<key>CFBundleExecutable</key><string>niimbot-bruecke</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSBackgroundOnly</key><true/>
<key>NSBluetoothAlwaysUsageDescription</key><string>Aufkleber auf dem Niimbot-Etikettendrucker drucken</string>
</dict></plist>
PLIST
swiftc -O -o "$ZIEL/Contents/MacOS/niimbot-bruecke" "$HIER/bruecke.swift"
codesign -s - -f "$ZIEL"
echo "gebaut: $ZIEL"
