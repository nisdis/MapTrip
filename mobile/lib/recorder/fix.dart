import 'dart:math' as math;

/// One GPS reading, numbered so the web page never applies it twice.
class Fix {
  const Fix({
    required this.seq,
    required this.lat,
    required this.lng,
    required this.t,
    required this.accuracy,
    this.speed,
    this.speedAccuracy,
    this.altitude,
    this.heading,
    this.altitudeAccuracy,
    this.headingAccuracy,
  });

  final int seq;
  final double lat;
  final double lng;

  /// epoch ms
  final int t;
  final double accuracy;

  /// m/s, if the device reported it
  final double? speed;

  /// uncertainty of [speed] in m/s, if the device reports it
  final double? speedAccuracy;
  final double? altitude;
  final double? heading;

  /// uncertainty of [altitude] in m, if the device reports it
  final double? altitudeAccuracy;

  /// uncertainty of [heading] in degrees, if the device reports it
  final double? headingAccuracy;

  Map<String, Object?> toJson() => {
    'seq': seq,
    'lat': lat,
    'lng': lng,
    't': t,
    'accuracy': accuracy,
    'speed': speed,
    'speedAccuracy': speedAccuracy,
    'altitude': altitude,
    'heading': heading,
    'altitudeAccuracy': altitudeAccuracy,
    'headingAccuracy': headingAccuracy,
  };

  static Fix fromJson(Map<String, Object?> j) => Fix(
    seq: (j['seq'] as num).toInt(),
    lat: (j['lat'] as num).toDouble(),
    lng: (j['lng'] as num).toDouble(),
    t: (j['t'] as num).toInt(),
    accuracy: (j['accuracy'] as num).toDouble(),
    speed: (j['speed'] as num?)?.toDouble(),
    speedAccuracy: (j['speedAccuracy'] as num?)?.toDouble(),
    altitude: (j['altitude'] as num?)?.toDouble(),
    heading: (j['heading'] as num?)?.toDouble(),
    altitudeAccuracy: (j['altitudeAccuracy'] as num?)?.toDouble(),
    headingAccuracy: (j['headingAccuracy'] as num?)?.toDouble(),
  );
}

/// Great-circle distance in metres.
double haversineM(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371e3;
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLng = rad(lng2 - lng1);
  final h =
      math.pow(math.sin(dLat / 2), 2) +
      math.cos(rad(lat1)) *
          math.cos(rad(lat2)) *
          math.pow(math.sin(dLng / 2), 2);
  return 2 * r * math.asin(math.min(1, math.sqrt(h)));
}
