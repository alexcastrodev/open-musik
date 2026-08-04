import { create } from 'zustand'
import HttpClient from '../lib/httpClient'

export const useUploadStore = create((set) => ({
  files: [],

  upload(selectedFiles) {
    const entries = Array.from(selectedFiles).map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      name: file.name,
      status: 'uploading',
      file,
    }))

    set((s) => ({ files: [...s.files, ...entries] }))

    entries.forEach((entry) => {
      const formData = new FormData()
      formData.append('files[]', entry.file)

      HttpClient.post('/songs/upload', formData)
        .then(async (r) => {
          const data = await r.json()
          if (!r.ok) throw new Error(data.error || 'Erro')
          set((s) => ({
            files: s.files.map((f) => f.id === entry.id ? { ...f, status: 'done' } : f),
          }))
        })
        .catch(() => {
          set((s) => ({
            files: s.files.map((f) => f.id === entry.id ? { ...f, status: 'error' } : f),
          }))
        })
    })
  },

  dismiss() {
    set({ files: [] })
  },
}))
