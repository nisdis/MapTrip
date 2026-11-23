import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:record_my_trip/live/background_share.dart';
import 'package:record_my_trip/recorder/fix.dart';

void main() {
  const t0 = 1800000000000;
  var now = t0;
  final requests = <http.Request>[];
  var status = 200;

  BackgroundShare make() {
    requests.clear();
    status = 200;
    now = t0;
    return BackgroundShare(
      baseUrl: 'https://map.example',
      cookies: () async => 'session=abc',
      now: () => now,
      client: MockClient((r) async {
        requests.add(r);
        return http.Response(jsonEncode({'count': 1, 'lastT': null}), status);
      }),
    );
  }

  ShareHandoff handoff({String status = 'recording', int? lastT = t0}) => ShareHandoff.fromJson({
        'token': 'a' * 22,
        'expiresAt': t0 + 3600000,
        'lastT': lastT,
        'status': status,
        'stats': {'distanceM': 1000, 'estimatedM': 50, 'maxSpeedMs': 15, 'speedMs': 10, 'altitudeM': 900, 'activeSeconds': 600},
        'last': {'lat': 12.97, 'lng': 77.6, 't': t0},
        'at': t0,
      })!;

  // ~111 m north per step, one per 10 s
  Fix fix(int i, {double accuracy = 5, double speed = 11}) =>
      Fix(seq: i, lat: 12.97 + i * 0.001, lng: 77.6, t: t0 + i * 10000, accuracy: accuracy, speed: speed, altitude: 910);

  test('continues the trail and stats from what the page last reported', () async {
    final s = make()..handoff(handoff());
    for (var i = 1; i <= 3; i++) {
      s.onFix(fix(i));
    }
    now = t0 + 30000;
    expect(await s.send(), isTrue);
    final body = jsonDecode(requests.single.body) as Map<String, dynamic>;
    expect(requests.single.url.toString(), 'https://map.example/api/live');
    expect(requests.single.headers['Cookie'], 'session=abc');
    expect(body['action'], 'update');
    expect((body['points'] as List).length, 3);
    final stats = body['stats'] as Map<String, dynamic>;
    expect(stats['distanceM'], closeTo(1000 + 3 * 111.2, 1));
    expect(stats['activeSeconds'], 630);
    expect(stats['altitudeM'], 910);
    expect(stats['maxSpeedMs'], 15);
    expect(s.unsent, isEmpty);
  });

  test('uses the same rules as the web recorder: poor fixes, standing still, already sent', () {
    final s = make()..handoff(handoff(lastT: t0 + 10000));
    s.onFix(fix(1)); // the server already has this time
    s.onFix(fix(2, accuracy: 80)); // too vague
    s.onFix(fix(3, speed: 200)); // a glitch
    s.onFix(fix(4));
    s.onFix(Fix(seq: 5, lat: 12.97 + 4 * 0.001 + 0.00001, lng: 77.6, t: t0 + 50000, accuracy: 5, speed: 0)); // ~1 m
    expect(s.unsent.length, 1);
  });

  test('keeps points when offline or the server fails, sends them later', () async {
    final s = make()..handoff(handoff());
    s.onFix(fix(1));
    status = 503;
    expect(await s.send(), isTrue);
    expect(s.unsent.length, 1);
    status = 200;
    await s.send();
    expect(s.unsent, isEmpty);
  });

  test('stops when the share ended, expired, or the person signed out', () async {
    final s = make()..handoff(handoff());
    status = 410;
    expect(await s.send(), isFalse);
    expect(s.share, isNull);

    s.handoff(handoff());
    now = t0 + 3600000;
    expect(await s.send(), isFalse);
    expect(requests.length, 1); // expired: nothing sent
  });

  test('while paused, no trail is added and the clock stops', () async {
    final s = make()..handoff(handoff(status: 'paused'));
    s.onFix(fix(1));
    now = t0 + 60000;
    await s.send();
    final body = jsonDecode(requests.single.body) as Map<String, dynamic>;
    expect(body['points'], isEmpty);
    expect(body['status'], 'paused');
    expect((body['stats'] as Map)['activeSeconds'], 600);
  });
}
