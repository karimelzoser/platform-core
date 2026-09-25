import assert from 'node:assert/strict';
import test from 'node:test';
import { customerExportCsv, normalizeContactPoint } from './index.js';

void test('customer contact normalization canonicalizes email and E.164 phone identities', () => {
  assert.equal(
    normalizeContactPoint({
      channel: 'EMAIL',
      value: ' Ada@Example.COM ',
      isPrimary: true,
      isVerified: false,
    }).normalizedValue,
    'ada@example.com',
  );
  assert.equal(
    normalizeContactPoint({
      channel: 'PHONE',
      value: '+20 (10) 1234-5678',
      isPrimary: false,
      isVerified: true,
    }).normalizedValue,
    '+201012345678',
  );
  assert.throws(
    () =>
      normalizeContactPoint({
        channel: 'WHATSAPP',
        value: '01012345678',
        isPrimary: false,
        isVerified: false,
      }),
    /E.164/,
  );
});

void test('customer CSV exports quote cells and neutralize spreadsheet formulas', () => {
  assert.equal(
    customerExportCsv([
      {
        id: 'customer-1',
        displayName: '=SUM(1,1)',
        firstName: 'Ada',
        lastName: null,
        companyName: '"Example"',
        preferredLanguage: 'en',
        timezone: 'Africa/Cairo',
        contactPoints: 'EMAIL:ada@example.test',
      },
    ]),
    'id,display_name,first_name,last_name,company_name,preferred_language,timezone,contact_points\r\n' +
      '"customer-1","\'=SUM(1,1)","Ada","","""Example""","en","Africa/Cairo","EMAIL:ada@example.test"\r\n',
  );
});
