import { useEffect } from 'react'
import { isNative } from '../utils/platform'

export function useBackButton(onBack) {
  useEffect(() => {
    if (!isNative) return

    let App
    import('@capacitor/app').then(mod => {
      App = mod.App
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back()
        } else if (onBack) {
          onBack()
        } else {
          App.minimizeApp()
        }
      })
    })

    return () => {
      if (App) App.removeAllListeners()
    }
  }, [onBack])
}
