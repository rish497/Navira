import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const original = process.cwd();
const isolated = await mkdtemp(path.join(os.tmpdir(), 'navira-report-flow-'));
process.chdir(isolated);

try {
  const operations = await import(`../src/server/operations.js?incident-test=${Date.now()}`);
  const civilian = { id: 'civilian-test', role: 'civilian', name: 'Civilian Test', organization: null };
  const operator = { id: 'operator-test', role: 'operator', name: 'Operator Test', organization: 'Response Office' };
  const location = { longitude: 77.5946, latitude: 12.9716, accuracy: 12 };
  await operations.updateLocation(civilian, location);
  const report = await operations.createIncidentReport(civilian, {
    ...location,
    disasterType: 'Flood',
    details: 'Isolated workflow test',
    fileName: 'report.png',
    imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
  });
  assert.equal(report.status, 'pending-review');
  const review = await operations.reviewIncidentReport(operator, {
    id: report.id,
    decision: 'natural-disaster',
    confirmedType: 'Flood',
    notificationRadiusKm: 5,
    reviewNotes: 'Confirmed for workflow test',
  });
  assert.equal(review.notified, 1);
  assert.equal(review.event.operatorDefinedArea, true);
  const civilianData = await operations.getOperations(civilian);
  assert.equal(civilianData.notifications.length, 1);
  assert.equal(civilianData.communityEvents.length, 1);
  assert.equal(civilianData.notifications[0].status, 'unread');
  await operations.markNotificationRead(civilian, { id: civilianData.notifications[0].id });
  const refreshed = await operations.getOperations(civilian);
  assert.equal(refreshed.notifications[0].status, 'read');
  console.log(JSON.stringify({ status: 'passed', reportStatus: refreshed.incidentReports[0].status, notified: review.notified }, null, 2));
} finally {
  process.chdir(original);
  await rm(isolated, { recursive: true, force: true });
}
