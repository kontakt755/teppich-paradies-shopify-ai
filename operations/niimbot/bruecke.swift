import Foundation
import CoreBluetooth
// BLE-Bruecke zum Niimbot B1 ohne Chromes Geraeteauswahl (#Packstation 09.11.2026). Gebaut von bauen.sh.
// stdin: Hexzeilen -> Schreiben ohne Antwort; Benachrichtigungen -> stdout Hexzeilen; "bereit" sobald verbunden.
// Exit: 3 Bluetooth aus/verboten, 4 Verbinden fehlgeschlagen, 5 getrennt, 6 Drucker nicht gefunden (20 s).
setvbuf(stdout, nil, _IOLBF, 0)
// Eigener "verantwortlicher Prozess": sonst prueft macOS die Bluetooth-Erlaubnis am Aufrufer (node, Terminal),
// der keine Bluetooth-Begruendung traegt, und beendet das Programm. Bewaehrter Weg (u. a. LLDB): disclaim.
@_silgen_name("responsibility_spawnattrs_setdisclaim") func setDisclaim(_ attr: UnsafeMutablePointer<posix_spawnattr_t?>, _ disclaim: Int32) -> Int32
if ProcessInfo.processInfo.environment["TP_NIIMBOT_EIGEN"] == nil {
  var attr: posix_spawnattr_t? = nil
  posix_spawnattr_init(&attr); _ = setDisclaim(&attr, 1)
  setenv("TP_NIIMBOT_EIGEN", "1", 1)
  let args = CommandLine.arguments.map { strdup($0) } + [nil]
  var pid: pid_t = 0
  let pfad = Bundle.main.executablePath ?? CommandLine.arguments[0]
  guard posix_spawn(&pid, pfad, nil, &attr, args, environ) == 0 else { exit(2) }
  var st: Int32 = 0; waitpid(pid, &st, 0)
  exit((st & 0x7f) == 0 ? (st >> 8) & 0xff : 128 + (st & 0x7f))
}
let praefix = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "B1"
func log(_ s: String) { FileHandle.standardError.write((s + "\n").data(using: .utf8)!) }
final class Bruecke: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  var cm: CBCentralManager!; var p: CBPeripheral?; var ch: CBCharacteristic?
  var schlange: [Data] = []
  // Schreiben ohne Antwort hat keinen Rueckkanal: nur senden, solange CoreBluetooth Platz meldet, sonst verliert der Drucker Zeilen.
  func senden() {
    guard let p = p, let c = ch else { return }
    let max = p.maximumWriteValueLength(for: .withoutResponse)
    while !schlange.isEmpty && p.canSendWriteWithoutResponse {
      let d = schlange.removeFirst()
      if d.count > max { schlange.insert(d.subdata(in: max..<d.count), at: 0) }
      p.writeValue(d.prefix(max), for: c, type: .withoutResponse)
    }
  }
  func peripheralIsReady(toSendWriteWithoutResponse per: CBPeripheral) { senden() }
  override init() { super.init(); cm = CBCentralManager(delegate: self, queue: nil) }
  func centralManagerDidUpdateState(_ c: CBCentralManager) {
    log("state \(c.state.rawValue)"); guard c.state == .poweredOn else { if c.state == .unauthorized || c.state == .unsupported { exit(3) }; return }
    // Ein schon verbundener B1 (z. B. von Chrome) wirbt nicht mehr: zuerst unter den verbundenen suchen.
    if let per = c.retrieveConnectedPeripherals(withServices: [CBUUID(string: "e7810a71-73ae-499d-8c15-faa9aef0c3f2")]).first(where: { ($0.name ?? "").hasPrefix(praefix) }) {
      log("schon verbunden \(per.name ?? "")"); p = per; per.delegate = self; c.connect(per); return
    }
    c.scanForPeripherals(withServices: nil)
    log("scan")
  }
  func centralManager(_ c: CBCentralManager, didDiscover per: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
    guard p == nil, let n = per.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String, n.hasPrefix(praefix) else { return }
    log("gefunden \(n)"); p = per; c.stopScan(); per.delegate = self; c.connect(per)
  }
  func centralManager(_ c: CBCentralManager, didConnect per: CBPeripheral) { log("verbunden"); per.discoverServices(nil) }
  func centralManager(_ c: CBCentralManager, didFailToConnect per: CBPeripheral, error: Error?) { log("fehler \(String(describing: error))"); exit(4) }
  func centralManager(_ c: CBCentralManager, didDisconnectPeripheral per: CBPeripheral, error: Error?) { log("getrennt"); exit(5) }
  func peripheral(_ per: CBPeripheral, didDiscoverServices error: Error?) { for s in per.services ?? [] where s.uuid.uuidString.count > 4 { per.discoverCharacteristics(nil, for: s) } }
  func peripheral(_ per: CBPeripheral, didDiscoverCharacteristicsFor s: CBService, error: Error?) {
    guard ch == nil else { return }
    for c in s.characteristics ?? [] where c.properties.contains(.notify) && c.properties.contains(.writeWithoutResponse) { ch = c; per.setNotifyValue(true, for: c); return }
  }
  func peripheral(_ per: CBPeripheral, didUpdateNotificationStateFor c: CBCharacteristic, error: Error?) { print("bereit"); lese() }
  func peripheral(_ per: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) { if let d = c.value { print(d.map { String(format: "%02x", $0) }.joined()) } }
  func lese() {
    Thread.detachNewThread {
      while let z = readLine() {
        var d = Data(); var i = z.startIndex
        while let j = z.index(i, offsetBy: 2, limitedBy: z.endIndex), i < j { if let b = UInt8(z[i..<j], radix: 16) { d.append(b) }; i = j }
        DispatchQueue.main.async { self.schlange.append(d); self.senden() }
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 1) { if let p = self.p { self.cm.cancelPeripheralConnection(p) }; exit(0) }
    }
  }
}
let b = Bruecke()
DispatchQueue.main.asyncAfter(deadline: .now() + 20) { if b.ch == nil { log("zeitueberschreitung"); exit(6) } }
RunLoop.main.run()
