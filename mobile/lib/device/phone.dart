import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:permission_handler/permission_handler.dart';

/// Phone details the page needs to explain background recording, and the
/// permissions that keep it visible and running.
class Phone {
  Map<String, Object?>? _device;

  /// Brand and model, so the page can show the right battery settings.
  Future<Map<String, Object?>> device() async {
    if (_device != null) return _device!;
    final info = DeviceInfoPlugin();
    if (Platform.isAndroid) {
      final a = await info.androidInfo;
      _device = {
        'os': 'android',
        'manufacturer': a.manufacturer.toLowerCase(),
        'model': a.model,
        'sdk': a.version.sdkInt,
      };
    } else if (Platform.isIOS) {
      final i = await info.iosInfo;
      _device = {
        'os': 'ios',
        'manufacturer': 'apple',
        'model': i.utsname.machine,
        'sdk': 0,
      };
    } else {
      _device = {
        'os': Platform.operatingSystem,
        'manufacturer': '',
        'model': '',
        'sdk': 0,
      };
    }
    return _device!;
  }

  /// Android: is the app exempt from battery optimisation (Battery: Unrestricted)?
  /// Reading this needs no permission. iOS has no such setting: always true.
  Future<bool> batteryUnrestricted() async {
    if (!Platform.isAndroid) return true;
    try {
      return await Permission.ignoreBatteryOptimizations.isGranted;
    } catch (_) {
      return false;
    }
  }

  /// The app's settings page, where Battery is. (We don't ask for the
  /// battery-exemption permission itself: Google Play restricts it.)
  Future<void> openSettings() => openAppSettings();

  /// Android 13+: needed for the "Recording your trip" notification to show.
  /// Asked once, when the first trip starts; recording works either way.
  Future<void> askNotifications() async {
    if (!Platform.isAndroid) return;
    try {
      final status = await Permission.notification.status;
      if (status.isDenied) await Permission.notification.request();
    } catch (_) {
      // older Android: nothing to ask
    }
  }

  /// Camera access for Take photo / Record video: 'granted', 'denied' (ask
  /// again later) or 'blocked' (only Settings can turn it on). Asks if needed.
  Future<String> askCamera() async {
    try {
      var status = await Permission.camera.status;
      if (status.isDenied) status = await Permission.camera.request();
      if (status.isGranted || status.isLimited) return 'granted';
      if (status.isPermanentlyDenied || status.isRestricted) return 'blocked';
      return 'denied';
    } catch (_) {
      return 'granted'; // no runtime permissions here: the camera app decides
    }
  }
}
