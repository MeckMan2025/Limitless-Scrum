export const isNative = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()
