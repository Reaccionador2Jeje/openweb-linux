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
  return typeof origin === 'string'
    && origin.length > 0
    && allowedOrigins.has(origin);
}

function validTerminalSize(cols, rows) {
  return Number.isInteger(cols) && Number.isInteger(rows)
    && cols >= 20 && cols <= 300 && rows >= 5 && rows <= 120;
}

function createTicketStore(options = {}) {
  const ttlMs = options.ttlMs || 30_000;
  const now = options.now || Date.now;
  const tickets = new Map();

  function prune() {
    const time = now();
    for (const [ticket, entry] of tickets) {
      if (entry.expiresAt <= time) tickets.delete(ticket);
    }
  }

  return {
    issue(origin) {
      if (typeof origin !== 'string' || !origin) {
        throw new Error('A valid origin is required');
      }

      prune();

      const ticket = crypto.randomBytes(32).toString('base64url');
      tickets.set(ticket, {
        origin,
        expiresAt: now() + ttlMs
      });

      return ticket;
    },

    consume(ticket, origin) {
      if (typeof ticket !== 'string' || !ticket) return false;

      prune();

      const entry = tickets.get(ticket);
      if (!entry) return false;

      // Consume before returning, even if the origin does not match.
      tickets.delete(ticket);

      return entry.origin === origin && entry.expiresAt > now();
    },

    get size() {
      prune();
      return tickets.size;
    }
  };
}

module.exports = {
  safeEqual,
  parseAllowedOrigins,
  originAllowed,
  validTerminalSize,
  createTicketStore
};
