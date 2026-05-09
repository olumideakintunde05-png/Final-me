/* ═══════════════════════════════════════════
   Daniel Wisdom Hub — sw.js
   Handles daily reminder notifications even
   when the browser tab is closed.
═══════════════════════════════════════════ */

const SW_VERSION = 'dwh-sw-v1';

// ── Install & Activate ───────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// ── State stored in SW memory ─────────────
let reminderHour   = null;
let reminderMinute = null;
let reminderTimer  = null;
let quotePool      = [];

const MESSAGES = [
  '📖 Time to read your daily wisdom!',
  '✨ Your daily quote is waiting for you.',
  '🌟 A new quote to fuel your day.',
  '💡 Time for your daily dose of inspiration!',
  '🔥 Don\'t break your streak — read today\'s quote!'
];

// ── Receive message from main page ────────
self.addEventListener('message', e => {
  const data = e.data;
  if(!data || data.type !== 'SET_REMINDER') return;

  reminderHour   = data.hour;
  reminderMinute = data.minute;

  // Update quote pool if provided
  if(data.quotes && data.quotes.length) {
    quotePool = data.quotes;
  }

  // Persist to IndexedDB so we survive SW restart
  persistReminder(data.hour, data.minute, quotePool);

  // Schedule the alarm
  scheduleAlarm(data.hour, data.minute);
});

// ── Schedule the alarm ────────────────────
function scheduleAlarm(hour, minute) {
  // Clear any existing timer
  if(reminderTimer) clearTimeout(reminderTimer);

  const now  = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if(next <= now) next.setDate(next.getDate() + 1);

  const ms = next - now;

  reminderTimer = setTimeout(() => fireReminder(hour, minute), ms);
}

// ── Fire the notification ─────────────────
function fireReminder(hour, minute) {
  const q = quotePool.length
    ? quotePool[Math.floor(Math.random() * quotePool.length)]
    : null;

  const msg  = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  const body = q
    ? `${msg}\n\n"${q.quote}" — ${q.author}`
    : msg;

  self.registration.showNotification('✦ Daniel Wisdom Hub', {
    body,
    icon:  '/favicon.ico',
    badge: '/favicon.ico',
    tag:   'daily-wisdom',
    renotify: true,
    requireInteraction: false,
    data: { url: self.registration.scope }
  });

  // Reschedule for next day (exact 24 h)
  reminderTimer = setTimeout(() => fireReminder(hour, minute), 24 * 60 * 60 * 1000);
}

// ── Tap notification → open site ──────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing tab if open
      const existing = clients.find(c => c.url.startsWith(self.registration.scope));
      if(existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});

// ── Persist reminder to IndexedDB ─────────
// SW memory is wiped when the browser kills it.
// We store the reminder settings in IndexedDB so
// we can restore them on the next SW startup.
function persistReminder(hour, minute, quotes) {
  const req = indexedDB.open('dwh-sw', 1);
  req.onupgradeneeded = e => {
    e.target.result.createObjectStore('config', { keyPath: 'key' });
  };
  req.onsuccess = e => {
    const db   = e.target.result;
    const tx   = db.transaction('config', 'readwrite');
    const store = tx.objectStore('config');
    store.put({ key: 'reminder', hour, minute });
    // Store a small slice of quotes (max 50) to keep IndexedDB size small
    store.put({ key: 'quotes', quotes: quotes.slice(0, 50) });
  };
}

// ── Restore reminder on SW restart ────────
// When the browser restarts the SW after killing it,
// re-read the persisted alarm and reschedule it.
(function restoreOnStartup() {
  const req = indexedDB.open('dwh-sw', 1);
  req.onupgradeneeded = e => {
    e.target.result.createObjectStore('config', { keyPath: 'key' });
  };
  req.onsuccess = e => {
    const db    = e.target.result;
    const tx    = db.transaction('config', 'readonly');
    const store = tx.objectStore('config');

    store.get('reminder').onsuccess = r => {
      const saved = r.result;
      if(!saved) return;
      reminderHour   = saved.hour;
      reminderMinute = saved.minute;
      scheduleAlarm(saved.hour, saved.minute);
    };

    store.get('quotes').onsuccess = r => {
      if(r.result && r.result.quotes) quotePool = r.result.quotes;
    };
  };
})();
