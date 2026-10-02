import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/lib/csv/parse.js';

test('parses comma-separated member rows', () => {
  assert.deepEqual(parseCsv('full_name,email\nAda Lovelace,ada@example.org\n'), [
    ['full_name', 'email'],
    ['Ada Lovelace', 'ada@example.org'],
  ]);
});

test('supports quoted commas, escaped quotes, and embedded line breaks', () => {
  assert.deepEqual(parseCsv('full_name,notes\n"Doe, Jane","said ""hello""\nthen left"'), [
    ['full_name', 'notes'],
    ['Doe, Jane', 'said "hello"\nthen left'],
  ]);
});

test('ignores blank lines and accepts CRLF input', () => {
  assert.deepEqual(parseCsv('full_name,email\r\nAda,ada@example.org\r\n\r\n'), [
    ['full_name', 'email'],
    ['Ada', 'ada@example.org'],
  ]);
});

test('rejects an unclosed quoted field', () => {
  assert.throws(() => parseCsv('full_name\n"Ada'), /unclosed quoted field/);
});
