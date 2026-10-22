// EN Helper's own service worker, scoped to /helper/.
//
// Its own scope means its own push subscription, separate from the main app's,
// even in a browser where both apps share one profile. That is what lets
// notebook reminders come from the EN Helper icon and nothing else does.
// Push only: no caching, the same as the main app's /sw.js.

const ICON = '/helper/icon-192.png'

self.addEventListener('push', (event) => {
  let data = { title: 'EN Helper', body: '', url: '/helper/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    if (event.data) data.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: ICON,
      badge: ICON,
      tag: data.tag || 'en-helper',
      renotify: true,
      data,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/helper/') && 'focus' in client) return client.focus()
      }
      return clients.openWindow('/helper/')
    })
  )
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()))
