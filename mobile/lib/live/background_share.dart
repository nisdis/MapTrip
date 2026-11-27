import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../recorder/fix.dart';

/// What the web page tells us about its live share (see appBridge.ts ShareHandoff).
class ShareHandoff {
  ShareHandoff({
    required this.token,
    required this.expiresAt,
    required this.lastT,
    required this.status,
    required this.stats,
    required this.last,
    required this.at,
  });

  final String token;
  final int expiresAt;
  final int? lastT;
  final String status;
  final Map<String, Object?> stats;
  final ({double lat, double lng, int t})? last;
  final int at;

  static ShareHandoff? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final last = raw['last'];
    return ShareHandoff(
      token: raw['token'] as String,
      expiresAt: (raw['expiresAt'] as num).toInt(),
      lastT: (raw['lastT'] as num?)?.toInt(),
      status: raw['status'] == 'paused' ? 'paused' : 'recording',
      stats: Map<String, Object?>.from(raw['stats'] as Map),
      last: last is Map
          ? (
              lat: (last['lat'] as num).toDouble(),
              lng: (last['lng'] as num).toDouble(),
              t: (last['t'] as num).toInt(),
            )
          : null,
      at: (raw['at'] as num).toInt(),
    );
  }
}

/// Same rules as the web recorder (useTripRecorder.ts), so the trail viewers
/// see while the phone is locked matches the one the page builds later.
const double maxAccuracyM = 50;
const double minMoveM = 5;
const double maxPlausibleMs = 340; // ~1,220 km/h: a plane with a tailwind

/// Keeps a live share going while the phone is locked (the web page is frozen
/// then). Uses the page's last report, adds what has been recorded since, and
/// sends it every 20 s to the same /api/live endpoint the page uses. The server
/// ignores points it already has, so the page and the app can overlap safely.
class BackgroundShare {
  BackgroundShare({
    required this.baseUrl,
    required this.cookies,
    http.Client? client,
    this.now = _systemNow,
  }) : _client = client ?? http.Client();

  final String baseUrl;

  /// The page's session cookie, read from the web view when needed.
  final Future<String?> Function() cookies;
  final http.Client _client;
  final int Function() now;

  ShareHandoff? _share;
  final List<List<Object?>> _unsent = [];
  ({double lat, double lng, int t})? _lastPoint;
  double _addedM = 0;
  double _maxSpeed = 0;
  double? _speed;
  double? _altitude;
  bool _sending = false;

  ShareHandoff? get share => _share;
  List<List<Object?>> get unsent => List.unmodifiable(_unsent);

  /// The page reported its share (or that it ended). Starts afresh from it.
  void handoff(ShareHandoff? share) {
    _share = share;
    _unsent.clear();
    _lastPoint = share?.last;
    _addedM = 0;
    _maxSpeed = 0;
    _speed = null;
    _altitude = null;
  }

  /// A fix recorded while the page is frozen.
  void onFix(Fix f) {
    final share = _share;
    if (share == null || share.status != 'recording') return;
    if (share.lastT != null && f.t <= share.lastT!) return;
    if (f.accuracy > maxAccuracyM) return;
    // Same as the web (speedEstimator.ts): the phone's speed only counts on a
    // real GPS fix, and not when it's within its own error of standing still.
    var speed = f.accuracy > 25 ? 0.0 : (f.speed ?? 0);
    final sa = f.speedAccuracy;
    if (sa != null && sa > 0 && speed < 2 * sa) speed = 0;
    if (speed > maxPlausibleMs) return;
    _speed = speed;
    _altitude = f.altitude ?? _altitude;
    final prev = _lastPoint;
    final moved = prev == null
        ? 0.0
        : haversineM(prev.lat, prev.lng, f.lat, f.lng);
    if (prev != null && moved < minMoveM) return; // standing still
    if (prev != null && f.t <= prev.t) return;
    _addedM += moved;
    if (speed > _maxSpeed) _maxSpeed = speed;
    _lastPoint = (lat: f.lat, lng: f.lng, t: f.t);
    _unsent.add([
      (f.lat * 1e6).round() / 1e6,
      (f.lng * 1e6).round() / 1e6,
      f.t,
      (speed * 10).round() / 10,
      0,
    ]);
  }

  /// The page's stats plus what has happened since it last reported.
  Map<String, Object?> statsNow() {
    final share = _share!;
    final s = share.stats;
    num n(String k) => (s[k] as num?) ?? 0;
    final elapsed = share.status == 'recording'
        ? ((now() - share.at) / 1000).floor()
        : 0;
    return {
      'distanceM': n('distanceM') + _addedM,
      'estimatedM': n('estimatedM'),
      'maxSpeedMs': n('maxSpeedMs') > _maxSpeed ? n('maxSpeedMs') : _maxSpeed,
      'speedMs': _speed ?? n('speedMs'),
      'altitudeM': _altitude ?? s['altitudeM'],
      'activeSeconds': n('activeSeconds') + elapsed,
    };
  }

  /// Send what's new. Returns false if the share is over (or there is none).
  Future<bool> send() async {
    final share = _share;
    if (share == null) return false;
    if (now() >= share.expiresAt) {
      handoff(null);
      return false;
    }
    if (_sending) return true;
    _sending = true;
    try {
      final batch = List<List<Object?>>.from(_unsent.take(2000));
      final cookie = await cookies();
      final res = await _client.post(
        Uri.parse('$baseUrl/api/live'),
        headers: {
          'Content-Type': 'application/json',
          if (cookie != null && cookie.isNotEmpty) 'Cookie': cookie,
        },
        body: jsonEncode({
          'action': 'update',
          'token': share.token,
          'points': batch,
          'status': share.status,
          'stats': statsNow(),
        }),
      );
      if (res.statusCode == 410 || res.statusCode == 401) {
        handoff(null); // ended, expired, or signed out
        return false;
      }
      if (res.statusCode == 200 && identical(share, _share)) {
        _unsent.removeRange(0, batch.length);
      }
      return true;
    } catch (_) {
      return true; // offline: try again next time, nothing is lost
    } finally {
      _sending = false;
    }
  }
}

int _systemNow() => DateTime.now().millisecondsSinceEpoch;
