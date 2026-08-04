import { create } from 'zustand'

// Singleton audio element — lives outside the store so it persists across re-renders
const audio = new Audio()
audio.preload = 'auto'

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function updateMediaSessionMetadata(song) {
  if (!('mediaSession' in navigator)) return
  const artwork = song.display_cover
    ? [{ src: song.display_cover, sizes: '512x512', type: 'image/jpeg' }]
    : []
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.display_title || '—',
    artist: song.display_artist || '',
    album: song.album || '',
    artwork,
  })
}

function updateMediaSessionPositionState() {
  if (!('mediaSession' in navigator)) return
  if (!audio.duration || isNaN(audio.duration)) return
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: audio.currentTime,
    })
  } catch (_) {}
}

export const usePlayerStore = create((set, get) => {
  // ── Audio event listeners ──────────────────────────────────────────────────

  audio.addEventListener('timeupdate', () => {
    set({ currentTime: audio.currentTime })
    updateMediaSessionPositionState()
  })

  audio.addEventListener('loadedmetadata', () => {
    set({ duration: audio.duration })
    updateMediaSessionPositionState()
  })

  audio.addEventListener('waiting', () => {
    set({ loading: true })
  })

  audio.addEventListener('playing', () => {
    set({ loading: false, playing: true })
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing'
    }
  })

  audio.addEventListener('pause', () => {
    set({ loading: false, playing: false })
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused'
    }
  })

  audio.addEventListener('error', () => {
    set({ loading: false, playing: false })
  })

  audio.addEventListener('ended', () => {
    const { repeat, queue, currentIndex, shuffle } = get()

    if (repeat === 'one') {
      audio.currentTime = 0
      audio.play().catch(() => {})
      return
    }

    if (queue.length === 0) return

    const isLast = currentIndex === queue.length - 1

    if (isLast && repeat === 'none') {
      set({ playing: false })
      return
    }

    // Advance to next (mirrors next() logic)
    get().next()
  })

  // ── Media Session action handlers ─────────────────────────────────────────

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => {
      audio.play().catch(() => {})
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      audio.pause()
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      get().previous()
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      get().next()
    })
    navigator.mediaSession.setActionHandler('seekbackward', (d) => {
      audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset ?? 10))
      updateMediaSessionPositionState()
    })
    navigator.mediaSession.setActionHandler('seekforward', (d) => {
      audio.currentTime = Math.min(
        audio.duration || Infinity,
        audio.currentTime + (d.seekOffset ?? 10),
      )
      updateMediaSessionPositionState()
    })
    navigator.mediaSession.setActionHandler('seekto', (d) => {
      if (d.seekTime != null && audio.duration) {
        audio.currentTime = d.seekTime
        updateMediaSessionPositionState()
      }
    })
  }

  // Carrega e toca uma song. Songs "sem cache" (s3_url nil — áudio liberado do
  // S3 via Manage) não têm o que tocar no player web; rebaixam só pelo bot.
  function loadAndPlay(song) {
    if (!song?.s3_url) return false
    audio.src = song.s3_url
    audio.load()
    audio.play().catch(() => {})
    updateMediaSessionMetadata(song)
    return true
  }

  // ── Store ─────────────────────────────────────────────────────────────────

  return {
    // State
    queue: [],
    currentIndex: 0,
    playing: false,
    shuffle: false,
    repeat: 'none',
    currentTime: 0,
    duration: 0,
    loading: false,

    // Actions
    loadQueue(songs, startIndex = 0) {
      const song = songs[startIndex]
      if (!song) return

      set({
        queue: songs,
        currentIndex: startIndex,
        currentTime: 0,
        duration: 0,
        loading: true,
      })

      if (!loadAndPlay(song)) set({ loading: false })
    },

    togglePlay() {
      if (audio.paused) {
        audio.play().catch(() => {})
      } else {
        audio.pause()
      }
    },

    next() {
      const { queue, currentIndex, shuffle } = get()
      if (queue.length === 0) return

      let nextIndex
      if (shuffle) {
        do {
          nextIndex = Math.floor(Math.random() * queue.length)
        } while (nextIndex === currentIndex && queue.length > 1)
      } else {
        nextIndex = (currentIndex + 1) % queue.length
      }

      const song = queue[nextIndex]
      set({ currentIndex: nextIndex, currentTime: 0, duration: 0, loading: true })
      if (!loadAndPlay(song)) set({ loading: false })
    },

    previous() {
      const { queue, currentIndex } = get()

      if (audio.currentTime > 3) {
        audio.currentTime = 0
        return
      }

      if (queue.length === 0) {
        audio.currentTime = 0
        return
      }

      const prevIndex = (currentIndex - 1 + queue.length) % queue.length
      const song = queue[prevIndex]
      set({ currentIndex: prevIndex, currentTime: 0, duration: 0, loading: true })
      if (!loadAndPlay(song)) set({ loading: false })
    },

    seek(time) {
      audio.currentTime = time
      set({ currentTime: time })
    },

    toggleShuffle() {
      set((s) => ({ shuffle: !s.shuffle }))
    },

    toggleRepeat() {
      const modes = ['none', 'all', 'one']
      const { repeat } = get()
      const next = modes[(modes.indexOf(repeat) + 1) % modes.length]
      set({ repeat: next })
    },

    stopAll() {
      audio.pause()
      audio.src = ''
      set({ queue: [], currentIndex: 0, playing: false, currentTime: 0, duration: 0, loading: false })
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
    },
  }
})

/** Convenience: expose the singleton audio element for any component that needs it */
export { audio, formatTime }
