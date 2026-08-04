# Alias retrocompatível. A lógica do provider mora em ProviderService (YouTube).
# Mantido pra não quebrar callers antigos (ImportYoutubeJob etc.) que referenciam
# YoutubeProviderService e YoutubeProviderService::ResolveError.
YoutubeProviderService = ProviderService
