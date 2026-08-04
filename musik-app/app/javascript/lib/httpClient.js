function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || ''
}

const HttpClient = {
  get(url) {
    return fetch(url, {
      headers: { Accept: 'application/json' },
    }).then((r) => r.json())
  },

  post(url, body) {
    const isFormData = body instanceof FormData
    return fetch(url, {
      method: 'POST',
      headers: isFormData
        ? { 'X-CSRF-Token': csrfToken() }
        : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
      body: isFormData ? body : JSON.stringify(body),
    })
  },

  patch(url, body) {
    return fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken() },
      body: JSON.stringify(body),
    })
  },

  delete(url) {
    return fetch(url, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': csrfToken() },
    })
  },
}

export default HttpClient
