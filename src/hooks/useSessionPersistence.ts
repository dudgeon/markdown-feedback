const STORAGE_KEY = 'markdown-feedback-session'

export interface SavedSession {
  markup: string
  comments: Record<string, string>
  savedAt: number
}

export function useSessionPersistence() {
  function getSavedSession(): SavedSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (
        typeof parsed.markup === 'string' &&
        typeof parsed.savedAt === 'number' &&
        parsed.markup.trim().length > 0
      ) {
        return parsed as SavedSession
      }
      return null
    } catch {
      return null
    }
  }

  function saveSession(markup: string, comments: Record<string, string>) {
    try {
      const session: SavedSession = {
        markup,
        comments,
        savedAt: Date.now(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    } catch {
      // Quota exceeded or other storage error — silently ignore
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore
    }
  }

  return { getSavedSession, saveSession, clearSession }
}
