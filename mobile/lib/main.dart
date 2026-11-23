import 'package:material_ui/material_ui.dart';

import 'web_shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const RecordMyTripApp());
}

class RecordMyTripApp extends StatelessWidget {
  const RecordMyTripApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Record My Trip',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0E6B4F)),
      ),
      home: const WebShell(),
    );
  }
}
