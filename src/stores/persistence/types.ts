export interface SavedSession {
  markup: string
  comments: Record<string, string>
  savedAt: number
}

export interface PersistenceAdapter {
  save(markup: string, comments: Record<string, string>): Promise<void>
  load(): Promise<SavedSession | null>
  clear(): Promise<void>
}
