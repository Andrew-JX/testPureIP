import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIp } from '../public/ip-validation.js';

test('accepts ordinary public IPv4 addresses', () => {
  for (const ip of ['1.1.1.1', '8.8.8.8', '45.33.32.156']) assert.equal(isPublicIp(ip), true, ip);
});

test('rejects private, shared, documentation and reserved IPv4 addresses', () => {
  const addresses = [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.1.1',
    '172.16.0.1', '192.0.0.1', '192.0.2.1', '192.168.1.1', '198.18.0.1',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
  ];
  for (const ip of addresses) assert.equal(isPublicIp(ip), false, ip);
});

test('accepts global IPv6 and rejects local, protocol and documentation ranges', () => {
  for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicIp(ip), true, ip);
  const addresses = [
    '::', '::1', '::ffff:8.8.8.8', 'fc00::1', 'fd12:3456::1', 'fe80::1',
    'ff02::1', '2001::1', '2001:db8::1', '2002:0808:0808::1', '3fff::1',
  ];
  for (const ip of addresses) assert.equal(isPublicIp(ip), false, ip);
});

test('rejects malformed or padded input', () => {
  for (const value of ['', 'localhost', '999.1.1.1', '1.1.1.01', ' 8.8.8.8', '8.8.8.8 ']) {
    assert.equal(isPublicIp(value), false, JSON.stringify(value));
  }
});
