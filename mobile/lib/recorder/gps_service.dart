import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

enum GpsMode {
  /// No GPS (app in the background, not recording): saves battery.
  off,

  /// For the map while the app is open.
  foreground,

  /// Recording a trip: keeps going with the screen locked. On Android this runs
  /// as a foreground service with a "Recording your trip" notification; on iOS
  /// with background location updates (the blue location pill).
  recording,
}

/// Owns the one GPS stream the app uses.
class GpsService {
  GpsService(this.onPosition);

  final void Function(Position) onPosition;
  StreamSubscription<Position>? _sub;
  GpsMode _mode = GpsMode.off;
  bool _asked = false;

  GpsMode get mode => _mode;

  /// "While using the app" is enough: background recording continues a stream
  /// started in the foreground, so we never ask for "Always".
  Future<bool> _permission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var p = await Geolocator.checkPermission();
    if (p == LocationPermission.denied && !_asked) {
      _asked = true;
      p = await Geolocator.requestPermission();
    }
    return p == LocationPermission.whileInUse || p == LocationPermission.always;
  }

  LocationSettings _settings(GpsMode mode) {
    final recording = mode == GpsMode.recording;
    if (Platform.isAndroid) {
      return AndroidSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 0,
        intervalDuration: const Duration(seconds: 1),
        foregroundNotificationConfig: recording
            ? const ForegroundNotificationConfig(
                notificationTitle: 'Recording your trip',
                notificationText:
                    'Record My Trip keeps recording while your screen is off.',
                notificationChannelName: 'Trip recording',
                enableWakeLock: true,
                setOngoing: true,
              )
            : null,
      );
    }
    if (Platform.isIOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 0,
        activityType: ActivityType.other,
        pauseLocationUpdatesAutomatically: false,
        allowBackgroundLocationUpdates: recording,
        showBackgroundLocationIndicator: recording,
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.best,
      distanceFilter: 0,
    );
  }

  Future<void> setMode(GpsMode mode) async {
    if (mode == _mode && (_sub != null || mode == GpsMode.off)) return;
    _mode = mode;
    await _sub?.cancel();
    _sub = null;
    if (mode == GpsMode.off) return;
    if (!await _permission()) return;
    if (_mode != mode) return; // changed while we waited for permission
    _sub = Geolocator.getPositionStream(locationSettings: _settings(mode))
        .listen(
          onPosition,
          onError: (Object e) {
            if (kDebugMode) debugPrint('GPS error: $e');
            _sub = null; // try again on the next mode change / resume
          },
          cancelOnError: true,
        );
  }

  Future<void> dispose() async {
    await _sub?.cancel();
    _sub = null;
  }
}
