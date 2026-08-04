import { useState, useCallback, useRef, useEffect } from 'react'

export function useShareSong(song) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const share = useCallback(async () => {
    if (!song?.uuid) return

    const url = `${window.location.origin}/songs/${song.uuid}`

    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }

    setCopied(true)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }, [song])

  return { copied, share }
}
