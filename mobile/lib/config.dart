/// Where the web app lives. Override for testing a preview deployment:
///   flutter run --dart-define=APP_URL=https://mapx-git-....vercel.app
const String appUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'https://map.recordmytrip.com',
);

const String appVersion = '1.0.4';

/// Pages the app's bridge (GPS, live sharing, share sheet) is offered to.
/// Anything else (a link to Wikipedia, a website) opens in the browser.
final Set<String> trustedOrigins = {
  Uri.parse(appUrl).origin,
  'https://map.recordmytrip.com',
  'https://mapx-iota.vercel.app',
};

bool isTrustedOrigin(Uri? uri) {
  if (uri == null) return false;
  if (!(uri.scheme == 'https' || uri.scheme == 'http')) return false;
  return trustedOrigins.contains(uri.origin);
}
