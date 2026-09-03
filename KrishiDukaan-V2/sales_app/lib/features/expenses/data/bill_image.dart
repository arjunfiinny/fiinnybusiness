import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';

/// A bill photo held in memory, ready to upload.
///
/// Deliberately bytes rather than a `dart:io` File: `dart:io` does not exist on
/// web, so a File-typed bill would make the whole app impossible to compile for
/// the browser. `image_picker` hands back an [XFile] on every platform, and
/// reading it once here means the same value can both render the preview and be
/// uploaded, with no second read and no platform branch at the call sites.
class BillImage {
  final Uint8List bytes;
  final String contentType;

  /// File extension including the dot, derived from the content type so the
  /// object in Storage is named for what it actually is.
  final String extension;

  const BillImage({
    required this.bytes,
    required this.contentType,
    required this.extension,
  });

  static Future<BillImage> fromXFile(XFile file) async {
    final bytes = await file.readAsBytes();

    // image_picker reports a mimeType on web; on mobile it is usually null, but
    // the picker re-encodes to JPEG whenever imageQuality is set, so falling
    // back to the file extension and then to JPEG is accurate in practice.
    final mime = file.mimeType ?? _mimeFromName(file.name);
    return BillImage(
      bytes: bytes,
      contentType: mime,
      extension: _extensionFor(mime),
    );
  }

  static String _mimeFromName(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }

  static String _extensionFor(String contentType) {
    switch (contentType) {
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'image/heic':
        return '.heic';
      default:
        return '.jpg';
    }
  }
}
