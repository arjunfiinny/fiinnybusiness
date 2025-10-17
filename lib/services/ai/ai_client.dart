import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:lifemap/config/app_config.dart';

class AiClient {
  static Future<Map<String, dynamic>> postJson(String path, Map<String, dynamic> body) async {
    final url = Uri.parse('${AiConfig.baseUrl}$path');
    final resp = await http.post(url,
      headers: {'Content-Type': 'application/json', 'x-api-key': AiConfig.apiKey},
      body: jsonEncode(body),
    );
    if (resp.statusCode < 200 || resp.statusCode >= 300) {
      throw Exception('AI call failed: ${resp.statusCode} ${resp.body}');
    }
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }
}
