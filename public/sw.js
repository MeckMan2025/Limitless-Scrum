// Service Worker — Push notification receiver only (no caching/offline)

const ICON = '/ScrumLogo.png'

self.addEventListener('push', (event) => {
  let data = { title: 'New Notification', body: '', icon: ICON }
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() }
    }
  } catch (e) {
    if (event.data) data.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || ICON,
      badge: ICON,
      tag: data.tag || data.title,
      renotify: true,
      data: data,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // A notification can name the page it is about (the EN Helper reminder
  // sends '/helper/'). Without one, it opens the app as it always has.
  const target = event.notification.data?.url

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (!client.url.includes(self.location.origin) || !('focus' in client)) continue
        if (!target) return client.focus()
        // Already on that page: bring it forward. Otherwise take this window
        // there, which keeps it inside the installed app instead of Safari.
        if (new URL(client.url).pathname.startsWith(target)) return client.focus()
        if ('navigate' in client) return client.navigate(target).then(c => (c || client).focus())
      }
      return clients.openWindow(target || '/')
    })
  )
})

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})
