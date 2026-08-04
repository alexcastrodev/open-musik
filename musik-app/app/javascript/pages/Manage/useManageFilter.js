import { useState, useRef, useCallback, useEffect } from 'react'
import { router } from '@inertiajs/react'

// Busca + paginação server-side do /manage via partial reload do Inertia
// (mesmo padrão do Songs/Index, ver handleSearch lá). A busca é debounced pra
// não disparar uma request por tecla — o backend pagina e devolve só a página
// atual (ManageController::PER_PAGE).
export function useManageFilter(initialQuery) {
  const [search, setSearch] = useState(initialQuery ?? '')
  const debounceRef = useRef(null)

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const reload = useCallback((data) => {
    router.reload({
      data,
      only: ['songs', 'total', 'page', 'query'],
      replace: true,
    })
  }, [])

  const handleSearch = useCallback((value) => {
    setSearch(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // Busca nova volta pra página 1 (page: undefined tira o param da URL).
      reload({ q: value || undefined, page: undefined })
    }, 300)
  }, [reload])

  const goToPage = useCallback((page) => {
    reload({ page: page > 1 ? page : undefined })
  }, [reload])

  return { search, handleSearch, goToPage }
}
