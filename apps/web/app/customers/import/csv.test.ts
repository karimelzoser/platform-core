import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCustomerImportCsv } from './csv.js';

void test('parses quoted CSV customer fields without splitting embedded commas or newlines', () => {
  const result = parseCustomerImportCsv(
    'display_name,first_name,last_name,company_name,email,phone\n' +
      '"Ada, Inc.",Ada,Lovelace,"Example ""Labs""\nCairo",ada@example.test,+201001234567\n',
  );

  assert.deepEqual(result, {
    customers: [
      {
        displayName: 'Ada, Inc.',
        firstName: 'Ada',
        lastName: 'Lovelace',
        companyName: 'Example "Labs"\nCairo',
        contactPoints: [
          {
            channel: 'EMAIL',
            value: 'ada@example.test',
            label: 'Imported email',
            isPrimary: true,
          },
          {
            channel: 'PHONE',
            value: '+201001234567',
            label: 'Imported phone',
            isPrimary: false,
          },
        ],
      },
    ],
  });
});

void test('rejects unterminated quoted CSV fields before any import request is made', () => {
  assert.deepEqual(
    parseCustomerImportCsv(
      'display_name,first_name,last_name,company_name,email,phone\n"Ada,Ada,,,,\n',
    ),
    { error: 'CSV contains an unterminated quoted field.' },
  );
});
