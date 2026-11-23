import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:geolocator/geolocator.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'config.dart';
import 'live/background_share.dart';
import 'recorder/fix.dart';
import 'recorder/fix_buffer.dart';
import 'recorder/gps_service.dart';

/// How often the live share is updated while the phone is locked
/// (the same pace as the web page: LIVE_UPDATE_MS in useLiveShare.ts).
const liveUpdateEvery = Duration(seconds: 20);

/// The whole app: the web app in a web view, plus what a web page can't do on a
/// phone: keep GPS running with the screen locked, and keep a live share going.
///
/// Protocol with the page: see src/services/appBridge.ts in the web app.
class WebShell extends StatefulWidget {
  const WebShell({super.key});

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> with WidgetsBindingObserver {
  InAppWebViewController? _web;
  late final GpsService _gps = GpsService(_onPosition);
  FixBuffer? _buffer;
  File? _stateFile;
  late final BackgroundShare _live = BackgroundShare(baseUrl: Uri.parse(appUrl).origin, cookies: _cookies);

  /// idle | recording | paused: what the page last told us
  String _recording = 'idle';
  int _startedAt = 0;
  bool _foreground = true;
  Timer? _liveTimer;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  /// Picks up where a previous run left off (app killed mid-trip).
  Future<void> _init() async {
    final dir = await getApplicationSupportDirectory();
    final buffer = FixBuffer(File('${dir.path}/trip_fixes.jsonl'));
    await buffer.restore();
    _buffer = buffer;
    _stateFile = File('${dir.path}/app_state.json');
    try {
      final s = jsonDecode(await _stateFile!.readAsString()) as Map<String, Object?>;
      _recording = (s['recording'] as String?) ?? 'idle';
      _startedAt = (s['startedAt'] as num?)?.toInt() ?? 0;
      _live.handoff(ShareHandoff.fromJson(s['share']));
    } catch (_) {
      // first run
    }
    _ready = true;
    await _applyGpsMode();
  }

  void _saveState() {
    final share = _live.share;
    _stateFile?.writeAsString(jsonEncode({
      'recording': _recording,
      'startedAt': _startedAt,
      'share': share == null
          ? null
          : {
              'token': share.token,
              'expiresAt': share.expiresAt,
              'lastT': share.lastT,
              'status': share.status,
              'stats': share.stats,
              'last': share.last == null ? null : {'lat': share.last!.lat, 'lng': share.last!.lng, 't': share.last!.t},
              'at': share.at,
            },
    }));
  }

  Future<void> _applyGpsMode() async {
    if (!_ready) return;
    final mode = _recording != 'idle'
        ? GpsMode.recording
        : _foreground
            ? GpsMode.foreground
            : GpsMode.off;
    await _gps.setMode(mode);
  }

  // ---------------------------------------------------------------- GPS

  void _onPosition(Position p) {
    final buffer = _buffer;
    if (buffer == null) return;
    final recording = _recording != 'idle';
    final fix = buffer.add(
      lat: p.latitude,
      lng: p.longitude,
      t: p.timestamp.millisecondsSinceEpoch,
      accuracy: p.accuracy,
      speed: p.hasSpeed && p.speed >= 0 ? p.speed : null,
      altitude: p.hasAltitude ? p.altitude : null,
      heading: p.hasHeading && p.heading >= 0 ? p.heading : null,
      // Only trip fixes are kept until the page confirms them.
      persist: recording,
    );
    if (recording && !_foreground) _live.onFix(fix);
    if (_foreground) _sendFixes([fix]);
  }

  Future<void> _sendFixes(List<Fix> fixes) async {
    final web = _web;
    if (web == null || fixes.isEmpty) return;
    if (!isTrustedOrigin(await web.getUrl())) return;
    final msg = jsonEncode({'type': 'fixes', 'fixes': fixes.map((f) => f.toJson()).toList()});
    try {
      await web.evaluateJavascript(source: 'window.__rmtReceive && window.__rmtReceive($msg);');
    } catch (_) {
      // page not ready: they stay pending and go with the next "hello"
    }
  }

  // ---------------------------------------------------------------- bridge

  Future<Object?> _onMessage(List<dynamic> args) async {
    final web = _web;
    if (web == null || !isTrustedOrigin(await web.getUrl())) return null;
    final msg = args.isNotEmpty ? args.first : null;
    if (msg is! Map) return null;
    final buffer = _buffer;
    switch (msg['type']) {
      case 'hello':
        await _applyGpsMode();
        final share = _live.share;
        return {
          'version': appVersion,
          'platform': Platform.operatingSystem,
          'recording': _recording,
          'pending': buffer?.pending.map((f) => f.toJson()).toList() ?? [],
          'share': share == null ? null : {'token': share.token, 'expiresAt': share.expiresAt},
        };
      case 'recording':
        final state = msg['state'];
        final next = state == 'recording' || state == 'paused' ? state as String : 'idle';
        if (next == 'idle' && _recording != 'idle') {
          buffer?.clear(); // trip finished: nothing to keep
          _live.handoff(null);
        }
        _recording = next;
        _startedAt = (msg['startedAt'] as num?)?.toInt() ?? 0;
        _saveState();
        await _applyGpsMode();
        return {'ok': true};
      case 'ack':
        final seq = msg['seq'];
        if (seq is num) buffer?.ack(seq.toInt());
        return {'ok': true};
      case 'share':
        _live.handoff(ShareHandoff.fromJson(msg['share']));
        _saveState();
        return {'ok': true};
      case 'shareText':
        final text = [msg['text'], msg['url']].whereType<String>().join('\n');
        await SharePlus.instance.share(ShareParams(text: text, subject: msg['title'] as String?));
        return {'ok': true};
    }
    return null;
  }

  // ---------------------------------------------------------------- lifecycle

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _foreground = true;
      _liveTimer?.cancel(); // the page takes the live share back
      _liveTimer = null;
      _applyGpsMode();
      // Everything recorded while locked, in one go.
      final pending = _buffer?.pending ?? const [];
      if (pending.isNotEmpty) _sendFixes(pending);
    } else if (state == AppLifecycleState.hidden || state == AppLifecycleState.paused) {
      if (!_foreground) return;
      _foreground = false;
      _applyGpsMode();
      if (_recording != 'idle' && _live.share != null) {
        _liveTimer ??= Timer.periodic(liveUpdateEvery, (_) async {
          final going = await _live.send();
          if (!going) {
            _liveTimer?.cancel();
            _liveTimer = null;
            _saveState();
          }
        });
      }
    }
  }

  Future<String?> _cookies() async {
    final cookies = await CookieManager.instance().getCookies(url: WebUri(appUrl));
    if (cookies.isEmpty) return null;
    return cookies.map((c) => '${c.name}=${c.value}').join('; ');
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _liveTimer?.cancel();
    _gps.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- UI

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final web = _web;
        if (web != null && await web.canGoBack()) {
          await web.goBack();
        } else {
          await SystemNavigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF4F6F5),
        body: SafeArea(
          bottom: false,
          child: InAppWebView(
            initialUrlRequest: URLRequest(url: WebUri(appUrl)),
            initialSettings: InAppWebViewSettings(
              javaScriptEnabled: true,
              useShouldOverrideUrlLoading: true,
              mediaPlaybackRequiresUserGesture: false,
              allowsInlineMediaPlayback: true,
              geolocationEnabled: true,
              supportZoom: false,
              applicationNameForUserAgent: 'RecordMyTripApp/$appVersion',
              isInspectable: kDebugMode,
            ),
            // Tells the page it is inside the app, before any of its code runs.
            initialUserScripts: UnmodifiableListView([
              UserScript(
                source: 'window.__RMT_APP__ = ${jsonEncode({'version': appVersion, 'platform': Platform.operatingSystem})};',
                injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
                forMainFrameOnly: true,
                allowedOriginRules: trustedOrigins,
              ),
            ]),
            onWebViewCreated: (controller) {
              _web = controller;
              controller.addJavaScriptHandler(handlerName: 'rmt', callback: _onMessage);
            },
            // Links away from the app (Wikipedia, websites, phone numbers) open outside it.
            shouldOverrideUrlLoading: (controller, action) async {
              final uri = action.request.url;
              if (uri == null || isTrustedOrigin(uri) || uri.scheme == 'about' || uri.scheme == 'blob' || uri.scheme == 'data') {
                return NavigationActionPolicy.ALLOW;
              }
              await launchUrl(uri, mode: LaunchMode.externalApplication);
              return NavigationActionPolicy.CANCEL;
            },
            // Fallback for page code that asks the browser for location directly.
            onGeolocationPermissionsShowPrompt: (controller, origin) async {
              final ok = isTrustedOrigin(Uri.tryParse(origin));
              return GeolocationPermissionShowPromptResponse(origin: origin, allow: ok, retain: ok);
            },
            onPermissionRequest: (controller, request) async {
              return PermissionResponse(
                resources: request.resources,
                action: isTrustedOrigin(request.origin) ? PermissionResponseAction.GRANT : PermissionResponseAction.DENY,
              );
            },
          ),
        ),
      ),
    );
  }
}
