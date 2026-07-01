export class MockKVNamespace {
  private readonly store = new Map<
    string,
    { value: string; expiresAt?: number }
  >()

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    const expiresAt = options?.expirationTtl
      ? Date.now() + options.expirationTtl * 1000
      : undefined
    this.store.set(key, { value, expiresAt })
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
}
