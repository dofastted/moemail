"use client"

export type MessageType = "received" | "sent"

export interface MessageListItem {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  received_at?: number
  sent_at?: number
  content?: string
  html?: string
  type?: MessageType
}

export interface MessageDetailCache {
  version: number
  message: MessageListItem
  savedAt: number
}

export interface CachedMessageList {
  version: number
  messages: MessageListItem[]
  nextCursor: string | null
  total: number
  savedAt: number
}

export const MESSAGE_LIST_CACHE_VERSION = 1
export const MESSAGE_LIST_CACHE_PREFIX = "moemail:message-list"
export const MESSAGE_DETAIL_CACHE_VERSION = 1
export const MESSAGE_DETAIL_CACHE_PREFIX = "moemail:message-detail"
export const MESSAGE_LIST_CACHE_REFRESH_INTERVAL = 60_000

export function createMessageListCacheKey(userKey: string, emailId: string, messageType: MessageType) {
  return [
    MESSAGE_LIST_CACHE_PREFIX,
    MESSAGE_LIST_CACHE_VERSION,
    encodeURIComponent(userKey),
    encodeURIComponent(emailId),
    messageType,
  ].join(":")
}

export function createMessageDetailCacheKey(userKey: string, emailId: string, messageId: string, messageType: MessageType) {
  return [
    MESSAGE_DETAIL_CACHE_PREFIX,
    MESSAGE_DETAIL_CACHE_VERSION,
    encodeURIComponent(userKey),
    encodeURIComponent(emailId),
    encodeURIComponent(messageId),
    messageType,
  ].join(":")
}

export function createMessageCacheUserKey(user: { id?: string | null; email?: string | null; name?: string | null } | null | undefined) {
  return user?.id || user?.email || user?.name || "anonymous"
}

export function readMessageListCache(cacheKey: string): CachedMessageList | null {
  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) return null

    const cached = JSON.parse(raw) as CachedMessageList
    if (
      cached.version !== MESSAGE_LIST_CACHE_VERSION ||
      !Array.isArray(cached.messages)
    ) {
      window.localStorage.removeItem(cacheKey)
      return null
    }

    return cached
  } catch {
    return null
  }
}

export function writeMessageListCache(cacheKey: string, cache: Omit<CachedMessageList, "version" | "savedAt">) {
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({
      version: MESSAGE_LIST_CACHE_VERSION,
      savedAt: Date.now(),
      ...cache,
    }))
  } catch {
    // localStorage may be full or disabled. The live fetch still works.
  }
}

export function readMessageDetailCache(cacheKey: string): MessageDetailCache | null {
  try {
    const raw = window.localStorage.getItem(cacheKey)
    if (!raw) return null

    const cached = JSON.parse(raw) as MessageDetailCache
    if (cached.version !== MESSAGE_DETAIL_CACHE_VERSION || !cached.message?.id) {
      window.localStorage.removeItem(cacheKey)
      return null
    }

    return cached
  } catch {
    return null
  }
}

export function writeMessageDetailCache(cacheKey: string, message: MessageListItem) {
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({
      version: MESSAGE_DETAIL_CACHE_VERSION,
      savedAt: Date.now(),
      message,
    }))
  } catch {
    // localStorage may be full or disabled. The live fetch still works.
  }
}

export function isMessageListCacheFresh(cache: CachedMessageList | null) {
  if (!cache) return false
  return Date.now() - cache.savedAt < MESSAGE_LIST_CACHE_REFRESH_INTERVAL
}

export function findCachedMessage(cache: CachedMessageList | null, messageId: string) {
  return cache?.messages.find(message => message.id === messageId) || null
}
