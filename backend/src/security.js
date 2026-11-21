'use strict';

const crypto = require('node:crypto');

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseAllowedOrigins(value = '') {
  return new Set(value.split(',').map((item) => item.trim()).filter(Boolean));
}

function originAllowed(origin, allowedOrigins) {
  // Non-browser clients may omit Origin. Browser origins must match exactly.
  if (!origin) return true;
  return allowedOrigins.has(origin);
}

function validTerminalSize(cols, rows) {
  return Number.isInteger(cols) && Number.isInteger(rows)
    && cols >= 20 && cols <= 300 && rows >= 5 && rows <= 120;
}

module.exports = { safeEqual, parseAllowedOrigins, originAllowed, validTerminalSize };
