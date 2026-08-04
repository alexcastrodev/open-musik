import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { usePage, router } from '@inertiajs/react'

// ── Mocks ──────────────────────────────────────────────────────────────────
// @inertiajs/react is mocked globally in test/setup.js

const mockLoadQueue = vi.fn()

vi.mock('@/stores/playerStore', () => ({
  usePlayerStore: (selector) => selector({ loadQueue: mockLoadQueue }),
}))

vi.mock('@/components/SongCard', () => ({
  default: ({ song }) => <div data-testid="song-card">{song.display_title}</div>,
}))

vi.mock('@/components/GroupCard', () => ({
  default: ({ group }) => <div data-testid="group-card">{group.name}</div>,
}))

import SongsIndex from '@/pages/Songs/Index'

// ── Fixtures ───────────────────────────────────────────────────────────────

const makeSong = (overrides = {}) => ({
  id: 1,
  uuid: 'abc-123',
  display_title: 'Song One',
  display_artist: 'Artist A',
  album: 'Album X',
  display_cover: '/cover.jpg',
  formatted_duration: '3:30',
  ...overrides,
})

const makeSongItem = (song) => ({ type: 'song', song })

const makeGroupItem = (overrides = {}) => ({
  type: 'group',
  group_id: 99,
  name: 'Group A',
  group_cover: '/group_cover.jpg',
  songs: [makeSong({ id: 10 }), makeSong({ id: 11, display_title: 'Song Two' })],
  ...overrides,
})

function setup(props = {}) {
  usePage.mockReturnValue({
    props: {
      display_items: [],
      top_songs: [],
      query: null,
      ...props,
    },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SongsIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('estado vazio', () => {
    it('exibe mensagem quando não há músicas e não há busca ativa', () => {
      setup({ display_items: [], top_songs: [], query: null })
      render(<SongsIndex />)

      expect(screen.getByText('Nenhuma música na biblioteca.')).toBeInTheDocument()
    })

    it('não exibe barra de busca no estado vazio', () => {
      setup({ display_items: [], top_songs: [], query: null })
      render(<SongsIndex />)

      expect(screen.queryByPlaceholderText(/buscar/i)).not.toBeInTheDocument()
    })
  })

  describe('barra de busca', () => {
    it('renderiza o campo de busca quando há músicas', () => {
      setup({ display_items: [makeSongItem(makeSong())], top_songs: [] })
      render(<SongsIndex />)

      expect(screen.getByPlaceholderText('Buscar músicas, artistas, álbuns...')).toBeInTheDocument()
    })

    it('preenche o input com a query inicial vinda do servidor', () => {
      setup({ display_items: [makeSongItem(makeSong())], top_songs: [], query: 'rock' })
      render(<SongsIndex />)

      expect(screen.getByDisplayValue('rock')).toBeInTheDocument()
    })

    it('chama router.reload ao digitar na busca', () => {
      setup({ display_items: [makeSongItem(makeSong())], top_songs: [] })
      render(<SongsIndex />)

      fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: 'jazz' } })

      expect(router.reload).toHaveBeenCalledWith({
        data: { q: 'jazz' },
        only: ['display_items', 'query'],
        replace: true,
      })
    })

    it('passa q: undefined ao limpar a busca', () => {
      setup({ display_items: [makeSongItem(makeSong())], top_songs: [], query: 'rock' })
      render(<SongsIndex />)

      fireEvent.change(screen.getByPlaceholderText(/buscar/i), { target: { value: '' } })

      expect(router.reload).toHaveBeenCalledWith({
        data: { q: undefined },
        only: ['display_items', 'query'],
        replace: true,
      })
    })
  })

  describe('seção Músicas', () => {
    it('renderiza SongCard para itens do tipo song', () => {
      const songs = [makeSong({ id: 1 }), makeSong({ id: 2, display_title: 'Song Two' })]
      setup({ display_items: songs.map(makeSongItem), top_songs: [] })
      render(<SongsIndex />)

      const cards = screen.getAllByTestId('song-card')
      expect(cards).toHaveLength(2)
      expect(cards[0]).toHaveTextContent('Song One')
      expect(cards[1]).toHaveTextContent('Song Two')
    })

    it('renderiza GroupCard para itens do tipo group', () => {
      setup({ display_items: [makeGroupItem()], top_songs: [] })
      render(<SongsIndex />)

      expect(screen.getByTestId('group-card')).toBeInTheDocument()
    })

    it('exibe aviso de sem resultado quando há query mas display_items vazio', () => {
      setup({ display_items: [], top_songs: [], query: 'xyz' })
      render(<SongsIndex />)

      expect(screen.getByText(/nenhum resultado para "xyz"/i)).toBeInTheDocument()
    })
  })

  describe('seção Mais tocadas', () => {
    it('exibe seção Mais tocadas quando há top_songs e sem busca', () => {
      const top = [makeSong({ id: 5, display_title: 'Top Song' })]
      setup({ display_items: [makeSongItem(makeSong())], top_songs: top })
      render(<SongsIndex />)

      expect(screen.getByText('Mais tocadas')).toBeInTheDocument()
    })

    it('não exibe seção Mais tocadas quando há busca ativa', () => {
      const top = [makeSong({ id: 5, display_title: 'Top Song' })]
      setup({ display_items: [makeSongItem(makeSong())], top_songs: top, query: 'algo' })
      render(<SongsIndex />)

      expect(screen.queryByText('Mais tocadas')).not.toBeInTheDocument()
    })

    it('não exibe seção Mais tocadas quando lista está vazia', () => {
      setup({ display_items: [makeSongItem(makeSong())], top_songs: [] })
      render(<SongsIndex />)

      expect(screen.queryByText('Mais tocadas')).not.toBeInTheDocument()
    })
  })

  describe('seção Álbuns', () => {
    it('exibe seção Álbuns agrupando músicas por álbum', () => {
      const songs = [
        makeSong({ id: 1, album: 'Abbey Road' }),
        makeSong({ id: 2, album: 'Revolver' }),
      ]
      setup({ display_items: songs.map(makeSongItem), top_songs: [] })
      render(<SongsIndex />)

      expect(screen.getByText('Álbuns')).toBeInTheDocument()
      expect(screen.getByText('Abbey Road')).toBeInTheDocument()
      expect(screen.getByText('Revolver')).toBeInTheDocument()
    })

    it('exibe contador de álbuns', () => {
      const songs = [
        makeSong({ id: 1, album: 'Abbey Road' }),
        makeSong({ id: 2, album: 'Revolver' }),
      ]
      setup({ display_items: songs.map(makeSongItem), top_songs: [] })
      render(<SongsIndex />)

      expect(screen.getByText('2 álbuns')).toBeInTheDocument()
    })

    it('agrupa músicas do mesmo álbum em um único card', () => {
      const songs = [
        makeSong({ id: 1, album: 'Abbey Road' }),
        makeSong({ id: 2, album: 'Abbey Road', display_title: 'Come Together' }),
      ]
      setup({ display_items: songs.map(makeSongItem), top_songs: [] })
      render(<SongsIndex />)

      expect(screen.getByText('1 álbuns')).toBeInTheDocument()
    })

    it('usa "Sem álbum" para músicas sem álbum definido', () => {
      const song = makeSong({ id: 1, album: null })
      setup({ display_items: [makeSongItem(song)], top_songs: [] })
      render(<SongsIndex />)

      expect(screen.getByText('Sem álbum')).toBeInTheDocument()
    })

    it('não exibe seção Álbuns quando há busca ativa', () => {
      const song = makeSong({ id: 1, album: 'Abbey Road' })
      setup({ display_items: [makeSongItem(song)], top_songs: [], query: 'road' })
      render(<SongsIndex />)

      expect(screen.queryByText('Álbuns')).not.toBeInTheDocument()
    })

    it('chama loadQueue ao clicar em um álbum', () => {
      const song = makeSong({ id: 1, album: 'Abbey Road' })
      setup({ display_items: [makeSongItem(song)], top_songs: [] })
      render(<SongsIndex />)

      fireEvent.click(screen.getByText('Abbey Road'))

      expect(mockLoadQueue).toHaveBeenCalledWith([song], 0)
    })
  })

  describe('seção Artistas', () => {
    it('exibe seção Artistas agrupando músicas por artista', () => {
      const songs = [
        makeSong({ id: 1, display_artist: 'Beatles', album: null }),
        makeSong({ id: 2, display_artist: 'Stones', album: null }),
      ]
      setup({ display_items: songs.map(makeSongItem), top_songs: [] })
      render(<SongsIndex />)

      const section = screen.getByText('Artistas').closest('section')
      expect(section).toBeInTheDocument()
      expect(within(section).getByText('Beatles')).toBeInTheDocument()
      expect(within(section).getByText('Stones')).toBeInTheDocument()
    })

    it('exibe contador de artistas', () => {
      const songs = [
        makeSong({ id: 1, display_artist: 'Beatles', album: null }),
        makeSong({ id: 2, display_artist: 'Stones', album: null }),
      ]
      setup({ display_items: songs.map(makeSongItem), top_songs: [] })
      render(<SongsIndex />)

      expect(screen.getByText('2 artistas')).toBeInTheDocument()
    })

    it('usa "Desconhecido" para músicas sem artista', () => {
      const song = makeSong({ id: 1, display_artist: null, album: null })
      setup({ display_items: [makeSongItem(song)], top_songs: [] })
      render(<SongsIndex />)

      expect(screen.getByText('Desconhecido')).toBeInTheDocument()
    })

    it('exibe plural/singular correto de músicas por artista', () => {
      const songs = [
        makeSong({ id: 1, display_artist: 'Solo', album: null }),
        makeSong({ id: 2, display_artist: 'Banda', album: null }),
        makeSong({ id: 3, display_artist: 'Banda', display_title: 'Outra', album: null }),
      ]
      setup({ display_items: songs.map(makeSongItem), top_songs: [] })
      render(<SongsIndex />)

      expect(screen.getByText('1 música')).toBeInTheDocument()
      expect(screen.getByText('2 músicas')).toBeInTheDocument()
    })

    it('não exibe seção Artistas quando há busca ativa', () => {
      const song = makeSong({ id: 1, display_artist: 'Beatles', album: null })
      setup({ display_items: [makeSongItem(song)], top_songs: [], query: 'beat' })
      render(<SongsIndex />)

      expect(screen.queryByText('Artistas')).not.toBeInTheDocument()
    })

    it('chama loadQueue ao clicar em um artista', () => {
      const song = makeSong({ id: 1, display_artist: 'Beatles', album: null })
      setup({ display_items: [makeSongItem(song)], top_songs: [] })
      render(<SongsIndex />)

      const artistSection = screen.getByText('Artistas').closest('section')
      const artistButton = within(artistSection).getByRole('button')
      fireEvent.click(artistButton)

      expect(mockLoadQueue).toHaveBeenCalledWith([song], 0)
    })
  })
})
