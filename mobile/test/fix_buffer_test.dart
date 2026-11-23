import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:record_my_trip/recorder/fix_buffer.dart';

void main() {
  late Directory dir;
  setUp(() => dir = Directory.systemTemp.createTempSync('fixbuf'));
  tearDown(() => dir.deleteSync(recursive: true));

  FixBuffer fresh() => FixBuffer(File('${dir.path}/fixes.jsonl'));
  void addN(FixBuffer b, int n) {
    for (var i = 0; i < n; i++) {
      b.add(lat: 12.97 + i * 0.001, lng: 77.6, t: 1000 + i * 1000, accuracy: 5, speed: 10);
    }
  }

  test('numbers fixes and keeps them until the page confirms them', () {
    final b = fresh();
    addN(b, 5);
    expect(b.pending.map((f) => f.seq), [1, 2, 3, 4, 5]);
    b.ack(3);
    expect(b.pending.map((f) => f.seq), [4, 5]);
    b.ack(2); // late, older ack: no effect
    expect(b.pending.length, 2);
  });

  test('a killed app gets its unconfirmed fixes back, and numbering carries on', () async {
    final b = fresh();
    addN(b, 6);
    b.ack(2);
    final again = fresh();
    await again.restore();
    expect(again.pending.map((f) => f.seq), [3, 4, 5, 6]);
    expect(again.pending.first.lat, closeTo(12.972, 1e-9));
    final next = again.add(lat: 1, lng: 2, t: 9999, accuracy: 5);
    expect(next.seq, 7);
  });

  test('a half-written last line (crash mid-write) is skipped', () async {
    final b = fresh();
    addN(b, 2);
    File('${dir.path}/fixes.jsonl').writeAsStringSync('{"seq":3,"lat":1', mode: FileMode.append);
    final again = fresh();
    await again.restore();
    expect(again.pending.map((f) => f.seq), [1, 2]);
  });

  test('fixes outside a trip are numbered but not kept', () {
    final b = fresh();
    final f = b.add(lat: 1, lng: 2, t: 1, accuracy: 5, persist: false);
    expect(f.seq, 1);
    expect(b.pending, isEmpty);
    expect(File('${dir.path}/fixes.jsonl').existsSync(), isFalse);
  });

  test('finishing a trip clears everything; numbers never go back', () async {
    final b = fresh();
    addN(b, 4);
    b.clear();
    expect(b.pending, isEmpty);
    expect(File('${dir.path}/fixes.jsonl').existsSync(), isFalse);
    expect(b.add(lat: 1, lng: 2, t: 1, accuracy: 5).seq, 5);
  });

  test('the file stays small: confirmed fixes are dropped from it', () async {
    final b = fresh();
    for (var i = 0; i < 100; i++) {
      addN(b, 1);
      b.ack(i + 1);
    }
    final lines = File('${dir.path}/fixes.jsonl').readAsLinesSync();
    expect(lines.length, 1); // just the last ack
  });
}
