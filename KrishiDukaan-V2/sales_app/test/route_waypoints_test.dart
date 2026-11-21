import 'package:flutter_test/flutter_test.dart';
import 'package:krishidukaan_sales/core/services/location_service.dart';
import 'package:krishidukaan_sales/features/day_session/data/day_session.dart';
import 'package:krishidukaan_sales/features/day_session/data/day_session_repository.dart';
import 'package:krishidukaan_sales/features/dealers/data/dealer_visit.dart';

void main() {
  test('route follows timed breadcrumbs and visits, skipping poor fixes', () {
    final start = DateTime.utc(2026, 11, 21, 3);
    const origin = LatLngPoint(12.9716, 77.5946);
    const first = LatLngPoint(12.9800, 77.6000);
    const visitPoint = LatLngPoint(13.0000, 77.6200);
    const last = LatLngPoint(13.0200, 77.6400);
    const finish = LatLngPoint(13.0300, 77.6500);

    final session = DaySession(
      id: 'day',
      salesExecutiveId: 'rep',
      date: '2026-11-21',
      status: SessionStatusValue.active,
      startGeo: origin,
      startedAt: start,
      trackPoints: [
        TrackPoint(
          point: last,
          at: start.add(const Duration(minutes: 45)),
          accuracyM: 10,
        ),
        TrackPoint(
          point: first,
          at: start.add(const Duration(minutes: 15)),
          accuracyM: 10,
        ),
        TrackPoint(
          point: const LatLngPoint(14, 78),
          at: start.add(const Duration(minutes: 25)),
          accuracyM: 500,
        ),
        TrackPoint(
          point: const LatLngPoint(12.9801, 77.6001),
          at: start.add(const Duration(minutes: 16)),
          accuracyM: 10,
        ),
      ],
    );
    final visit = DealerVisit(
      id: 'visit',
      dealerId: 'dealer',
      dealerName: 'Shop',
      salesExecutiveId: 'rep',
      purpose: 'Pitching',
      geo: visitPoint,
      visitedAt: start.add(const Duration(minutes: 30)),
    );

    final points = DaySessionRepository.waypointsFor(session, [visit], finish);
    expect(points, [origin, first, visitPoint, last, finish]);
  });
}
