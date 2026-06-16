"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Calendar, Mail, RefreshCw, Share2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useThrottle } from "@/hooks/use-throttle"
import { EMAIL_CONFIG } from "@/config"
import { useToast } from "@/components/ui/use-toast"
import { ShareMessageDialog } from "./share-message-dialog"
import {
  createMessageListCacheKey,
  isMessageListCacheFresh,
  readMessageListCache,
  writeMessageListCache,
  type MessageListItem,
  type MessageType,
} from "./message-cache"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface MessageListProps {
  email: {
    id: string
    address: string
  }
  messageType: MessageType
  onMessageSelect: (messageId: string | null, messageType?: MessageType) => void
  selectedMessageId?: string | null
  refreshTrigger?: number
  cacheUserKey?: string
  preloadedMessageList?: {
    messages: MessageListItem[]
    nextCursor: string | null
    total: number
    savedAt: number
  } | null
}

interface MessageResponse {
  messages?: MessageListItem[]
  nextCursor?: string | null
  total?: number | null
  error?: string
}

export function MessageList({
  email,
  messageType,
  onMessageSelect,
  selectedMessageId,
  refreshTrigger,
  cacheUserKey = "anonymous",
  preloadedMessageList,
}: MessageListProps) {
  const t = useTranslations("emails.messages")
  const tList = useTranslations("emails.list")
  const tCommon = useTranslations("common.actions")
  const { toast } = useToast()
  const [messages, setMessages] = useState<MessageListItem[]>(preloadedMessageList?.messages || [])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(preloadedMessageList?.nextCursor || null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(preloadedMessageList?.total || 0)
  const [messageToDelete, setMessageToDelete] = useState<MessageListItem | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messagesRef = useRef<MessageListItem[]>(preloadedMessageList?.messages || [])
  const requestIdRef = useRef(0)
  const totalRef = useRef(preloadedMessageList?.total || 0)
  const cacheKeyRef = useRef(createMessageListCacheKey(cacheUserKey, email.id, messageType))

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    totalRef.current = total
  }, [total])

  useEffect(() => {
    cacheKeyRef.current = createMessageListCacheKey(cacheUserKey, email.id, messageType)
  }, [cacheUserKey, email.id, messageType])

  const stopPolling = () => {
    if (pollTimeoutRef.current) {
      clearInterval(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }

  const writeCache = (items: MessageListItem[], cursor: string | null, count: number) => {
    writeMessageListCache(cacheKeyRef.current, {
      messages: items,
      nextCursor: cursor,
      total: count,
    })
  }

  const mergeMessages = (incoming: MessageListItem[], reset: boolean) => {
    if (reset) return incoming

    const current = messagesRef.current
    const seen = new Set(current.map(message => message.id))
    const merged = [...current]

    for (const message of incoming) {
      if (seen.has(message.id)) {
        continue
      }
      seen.add(message.id)
      merged.push(message)
    }

    return merged
  }

  const fetchMessages = async (cursor?: string | null, reset = false, includeTotal = true) => {
    const requestId = ++requestIdRef.current

    try {
      setListError(null)
      const url = new URL(`/api/emails/${email.id}`, window.location.origin)
      if (messageType === "sent") {
        url.searchParams.set("type", "sent")
      }
      if (cursor) {
        url.searchParams.set("cursor", cursor)
      }
      if (!includeTotal) {
        url.searchParams.set("includeTotal", "0")
      }

      const response = await fetch(url)
      const data = await response.json() as MessageResponse

      if (requestIdRef.current !== requestId) {
        return
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          stopPolling()
        }
        setListError(data.error || t("loadError"))
        return
      }

      const incomingMessages = Array.isArray(data.messages) ? data.messages : []
      const mergedMessages = mergeMessages(incomingMessages, reset || !cursor)
      const nextTotal = typeof data.total === "number" ? data.total : totalRef.current
      messagesRef.current = mergedMessages
      totalRef.current = nextTotal
      setMessages(mergedMessages)
      setNextCursor(data.nextCursor || null)
      setTotal(nextTotal)
      writeCache(mergedMessages, data.nextCursor || null, nextTotal)
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setListError(t("networkError"))
      }
      console.error("Failed to fetch messages:", error)
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false)
        setRefreshing(false)
        setLoadingMore(false)
      }
    }
  }

  const startPolling = () => {
    stopPolling()
    pollTimeoutRef.current = setInterval(() => {
      if (!refreshing && !loadingMore) {
        void fetchMessages(undefined, true, false)
      }
    }, EMAIL_CONFIG.POLL_INTERVAL)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchMessages(undefined, true)
  }

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMore) return
    if (!nextCursor) return

    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    const threshold = clientHeight * 1.5
    const remainingScroll = scrollHeight - scrollTop

    if (remainingScroll <= threshold) {
      void fetchMessages(nextCursor, false, false)
    }
  }, 200)

  const handleDelete = async (message: MessageListItem) => {
    try {
      const response = await fetch(`/api/emails/${email.id}/${message.id}${messageType === "sent" ? "?type=sent" : ""}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: tList("error"),
          description: (data as { error: string }).error,
          variant: "destructive",
        })
        return
      }

      const updatedMessages = messagesRef.current.filter(item => item.id !== message.id)
      const updatedTotal = Math.max(total - 1, 0)
      messagesRef.current = updatedMessages
      setMessages(updatedMessages)
      setTotal(updatedTotal)
      writeCache(updatedMessages, nextCursor, updatedTotal)

      toast({
        title: tList("success"),
        description: tList("deleteSuccess"),
      })

      if (selectedMessageId === message.id) {
        onMessageSelect(null)
      }
    } catch {
      toast({
        title: tList("error"),
        description: tList("deleteFailed"),
        variant: "destructive",
      })
    } finally {
      setMessageToDelete(null)
    }
  }

  useEffect(() => {
    if (!email.id) return

    const cached = readMessageListCache(cacheKeyRef.current)
    if (cached) {
      messagesRef.current = cached.messages
      setMessages(cached.messages)
      setNextCursor(cached.nextCursor)
      setTotal(cached.total)
      totalRef.current = cached.total
      setLoading(false)
      if (isMessageListCacheFresh(cached)) {
        startPolling()
        void fetchMessages(undefined, true, false)
        return () => stopPolling()
      }
    }

    setLoading(true)
    setRefreshing(false)
    setLoadingMore(false)
    setMessages(preloadedMessageList?.messages || [])
    messagesRef.current = preloadedMessageList?.messages || []
    setNextCursor(preloadedMessageList?.nextCursor || null)
    setTotal(preloadedMessageList?.total || 0)
    void fetchMessages(undefined, true, true)
    startPolling()

    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.id, messageType])

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      void fetchMessages(undefined, true, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger])

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="p-2 flex justify-between items-center border-b border-primary/20">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn("h-8 w-8", refreshing && "animate-spin")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <span className="text-xs text-gray-500">
            {total > 0 ? `${total} ${t("messageCount")}` : t("noMessages")}
          </span>
        </div>

        <div className="flex-1 overflow-auto" onScroll={handleScroll}>
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">{t("loading")}</div>
          ) : listError ? (
            <div className="p-4 text-center text-sm text-destructive">{listError}</div>
          ) : messages.length > 0 ? (
            <div className="divide-y divide-primary/10">
              {messages.map(message => (
                <div
                  key={message.id}
                  onClick={() => onMessageSelect(message.id, messageType)}
                  className={cn(
                    "p-3 hover:bg-primary/5 cursor-pointer group",
                    selectedMessageId === message.id && "bg-primary/10"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-primary/60 mt-1" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{message.subject}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <span className="truncate">
                          {message.from_address || message.to_address || ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(message.received_at || message.sent_at || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <ShareMessageDialog
                        emailId={email.id}
                        messageId={message.id}
                        messageSubject={message.subject}
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Share2 className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMessageToDelete(message)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {loadingMore && (
                <div className="text-center text-sm text-gray-500 py-2">
                  {t("loadingMore")}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-gray-500">
              {t("noMessages")}
            </div>
          )}
        </div>
      </div>
      <AlertDialog open={!!messageToDelete} onOpenChange={() => setMessageToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tList("deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tList("deleteDescription", { email: messageToDelete?.subject || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => messageToDelete && void handleDelete(messageToDelete)}
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
