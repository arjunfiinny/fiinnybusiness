// lib/config/ai_config.dart
class AiConfig {
  /// Cloud Run base URL for the AI proxy
  static const String baseUrl =
      'https://ai-proxy-1085936196639.asia-south1.run.app';

  /// Must match INTERNAL_API_KEY set on Cloud Run
  static const String apiKey = 'fiinny-local-dev-secret';

  /// Global kill-switch for LLM usage (rules still run either way)
  static const bool llmOn = true;

  /// Toggle if you later schedule weekly insights via cron
  static const bool weeklyBatchOn = true;

  /// If rules confidence is below this, we call the LLM fallback
  static const double confThresh = 0.80;

  /// Extra guard to ensure we always send minimal/redacted fields
  static const bool redactionOn = true;

  /// Optional: request timeouts for network calls (ms)
  static const int connectTimeoutMs = 8000;
  static const int readTimeoutMs = 15000;
}
