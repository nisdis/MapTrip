import 'dart:convert';
import 'dart:io';

import 'fix.dart';

/// Every fix recorded during a trip, kept until the web page confirms it has
/// it ("ack"). While the phone is locked the page is frozen, so fixes pile up
/// here and are handed over in one batch when it wakes.
///
/// Also written to a file, one JSON line per fix, so a trip survives the app
/// being killed: on restart the unconfirmed fixes are still there.
class FixBuffer {
  FixBuffer(this.file);

  final File file;
  final List<Fix> _pending = [];
  int _nextSeq = 1;
  int _acked = 0;

  List<Fix> get pending => List.unmodifiable(_pending);
  int get acked => _acked;

  /// Reload what a previous run left (the app was killed mid-trip).
  Future<void> restore() async {
    if (!await file.exists()) return;
    for (final line in await file.readAsLines()) {
      if (line.trim().isEmpty) continue;
      try {
        final obj = jsonDecode(line) as Map<String, Object?>;
        if (obj['ack'] != null) {
          _acked = (obj['ack'] as num).toInt();
        } else {
          final f = Fix.fromJson(obj);
          _pending.add(f);
          if (f.seq >= _nextSeq) _nextSeq = f.seq + 1;
        }
      } catch (_) {
        // a half-written last line after a crash: skip it
      }
    }
    _pending.removeWhere((f) => f.seq <= _acked);
    if (_acked >= _nextSeq) _nextSeq = _acked + 1;
  }

  /// Number a new reading and keep it.
  Fix add({
    required double lat,
    required double lng,
    required int t,
    required double accuracy,
    double? speed,
    double? speedAccuracy,
    double? altitude,
    double? heading,
    double? altitudeAccuracy,
    double? headingAccuracy,
    bool persist = true,
  }) {
    final fix = Fix(
      seq: _nextSeq++,
      lat: lat,
      lng: lng,
      t: t,
      accuracy: accuracy,
      speed: speed,
      speedAccuracy: speedAccuracy,
      altitude: altitude,
      heading: heading,
      altitudeAccuracy: altitudeAccuracy,
      headingAccuracy: headingAccuracy,
    );
    if (persist) {
      _pending.add(fix);
      file.writeAsStringSync(
        '${jsonEncode(fix.toJson())}\n',
        mode: FileMode.append,
        flush: false,
      );
    }
    return fix;
  }

  /// The page has everything up to [seq]: forget it.
  void ack(int seq) {
    if (seq <= _acked) return;
    _acked = seq;
    final before = _pending.length;
    _pending.removeWhere((f) => f.seq <= seq);
    // Nothing kept was confirmed: no write.
    if (_pending.length == before) return;
    if (_pending.isEmpty) {
      // Nothing outstanding: start the file afresh (keeps it small).
      file.writeAsStringSync('${jsonEncode({'ack': seq})}\n');
    } else {
      file.writeAsStringSync(
        '${jsonEncode({'ack': seq})}\n',
        mode: FileMode.append,
      );
    }
  }

  /// Trip over: drop everything (sequence numbers keep counting up).
  void clear() {
    _pending.clear();
    _acked = _nextSeq - 1;
    if (file.existsSync()) file.deleteSync();
  }
}
