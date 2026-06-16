"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { EmailList } from "./email-list"
import { MessageListContainer } from "./message-list-container"
import { MessageView } from "./message-view"
import { SendDialog } from "./send-dialog"
import { cn } from "@/lib/utils"
import { useCopy } from "@/hooks/use-copy"
import { useSendPermission } from "@/hooks/use-send-permission"
import { Copy } from "lucide-react"
import { useSession } from "next-auth/react"
import {
  createMessageCacheUserKey,
  createMessageListCacheKey,
  writeMessageListCache,
  type MessageListItem,
  type MessageType,
} from "./message-cache"

interface Email {
  id: string
  address: string
}

export function ThreeColumnLayout() {
  const t = useTranslations("emails.layout")
  const { data: session } = useSession()
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [selectedMessageType, setSelectedMessageType] = useState<MessageType>("received")
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const { copyToClipboard } = useCopy()
  const { canSend: canSendEmails } = useSendPermission()
  const preloadedEmailsRef = useRef<string[]>([])
  const preloadAbortRef = useRef<AbortController | null>(null)
  const cacheUserKey = useMemo(() => createMessageCacheUserKey(session?.user), [session?.user])

  const columnClass = "border-2 border-primary/20 bg-background rounded-lg overflow-hidden flex flex-col"
  const headerClass = "p-2 border-b-2 border-primary/20 flex items-center justify-between shrink-0"
  const titleClass = "text-sm font-bold px-2 w-full overflow-hidden"

  // 移动端视图逻辑
  const getMobileView = () => {
    if (selectedMessageId) return "message"
    if (selectedEmail) return "emails"
    return "list"
  }

  const mobileView = getMobileView()

  const copyEmailAddress = () => {
    copyToClipboard(selectedEmail?.address || "")
  }

  const handleMessageSelect = (messageId: string | null, messageType: 'received' | 'sent' = 'received') => {
    setSelectedMessageId(messageId)
    setSelectedMessageType(messageType)
  }

  const handleSendSuccess = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  useEffect(() => {
    if (!selectedEmail) {
      setSelectedMessageId(null)
    }
  }, [selectedEmail])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!session?.user) return

    const abortController = new AbortController()
    preloadAbortRef.current?.abort()
    preloadAbortRef.current = abortController

    const preloadFirstFiveEmails = async () => {
      try {
        const response = await fetch("/api/emails?limit=5&includeTotal=0", {
          signal: abortController.signal,
        })
        if (!response.ok) {
          return
        }

        const data = await response.json() as {
          emails: Email[]
        }

        const preloadTargets = data.emails.slice(0, 5)
        for (const email of preloadTargets) {
          if (abortController.signal.aborted) {
            return
          }
          if (preloadedEmailsRef.current.includes(email.id)) {
            continue
          }
          preloadedEmailsRef.current.push(email.id)

          try {
            const url = new URL(`/api/emails/${email.id}`, window.location.origin)
            url.searchParams.set("includeTotal", "0")

            const messageResponse = await fetch(url, {
              signal: abortController.signal,
            })
            if (!messageResponse.ok) {
              continue
            }

            const messageData = await messageResponse.json() as {
              messages?: MessageListItem[]
              nextCursor?: string | null
              total?: number | null
            }
            const messages = Array.isArray(messageData.messages) ? messageData.messages : []

            writeMessageListCache(
              createMessageListCacheKey(cacheUserKey, email.id, "received"),
              {
                messages,
                nextCursor: messageData.nextCursor || null,
                total: messageData.total || messages.length,
              }
            )

          } catch {
            if (!abortController.signal.aborted) {
              continue
            }
          }
        }
      } catch {
        return
      }
    }

    void preloadFirstFiveEmails()

    return () => {
      abortController.abort()
    }
  }, [cacheUserKey, session?.user])

  return (
    <div className="pb-5 pt-20 h-full flex flex-col">
      {/* 桌面端三栏布局 */}
      <div className="hidden lg:grid grid-cols-12 gap-4 h-full min-h-0">
        <div className={cn("col-span-3", columnClass)}>
          <div className={headerClass}>
            <h2 className={titleClass}>{t("myEmails")}</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <EmailList
              onEmailSelect={(email) => {
                setSelectedEmail(email)
                setSelectedMessageId(null)
              }}
              selectedEmailId={selectedEmail?.id}
            />
          </div>
        </div>

        <div className={cn("col-span-4", columnClass)}>
          <div className={headerClass}>
            <h2 className={titleClass}>
              {selectedEmail ? (
                <div className="w-full flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="truncate min-w-0">{selectedEmail.address}</span>
                    <div className="shrink-0 cursor-pointer text-primary" onClick={copyEmailAddress}>
                      <Copy className="size-4" />
                    </div>
                  </div>
                  {selectedEmail && canSendEmails && (
                    <SendDialog
                      emailId={selectedEmail.id}
                      fromAddress={selectedEmail.address}
                      onSendSuccess={handleSendSuccess}
                    />
                  )}
                </div>
              ) : (
                t("selectEmail")
              )}
            </h2>
          </div>
          {selectedEmail && (
            <div className="flex-1 overflow-auto">
              <MessageListContainer
                email={selectedEmail}
                onMessageSelect={handleMessageSelect}
                selectedMessageId={selectedMessageId}
                refreshTrigger={refreshTrigger}
                cacheUserKey={cacheUserKey}
              />
            </div>
          )}
        </div>

        <div className={cn("col-span-5", columnClass)}>
          <div className={headerClass}>
            <h2 className={titleClass}>
              {selectedMessageId ? t("messageContent") : t("selectMessage")}
            </h2>
          </div>
          {selectedEmail && selectedMessageId && (
            <div className="flex-1 overflow-auto">
              <MessageView
                emailId={selectedEmail.id}
                messageId={selectedMessageId}
                messageType={selectedMessageType}
                fromAddress={selectedEmail.address}
                onSendSuccess={handleSendSuccess}
                onClose={() => setSelectedMessageId(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* 移动端单栏布局 */}
      <div className="lg:hidden h-full min-h-0">
        <div className={cn("h-full", columnClass)}>
          {mobileView === "list" && (
            <>
              <div className={headerClass}>
                <h2 className={titleClass}>{t("myEmails")}</h2>
              </div>
              <div className="flex-1 overflow-auto">
                <EmailList
                  onEmailSelect={(email) => {
                    setSelectedEmail(email)
                  }}
                  selectedEmailId={selectedEmail?.id}
                />
              </div>
            </>
          )}

          {mobileView === "emails" && selectedEmail && (
            <div className="h-full flex flex-col">
              <div className={cn(headerClass, "gap-2")}>
                <button
                  onClick={() => {
                    setSelectedEmail(null)
                  }}
                  className="text-sm text-primary shrink-0"
                >
                  {t("backToEmailList")}
                </button>
                <div className="flex-1 flex justify-between items-center gap-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate min-w-0 flex-1 text-right">{selectedEmail.address}</span>
                    <div className="shrink-0 cursor-pointer text-primary" onClick={copyEmailAddress}>
                      <Copy className="size-4" />
                    </div>
                  </div>
                  {canSendEmails && (
                    <SendDialog
                      emailId={selectedEmail.id}
                      fromAddress={selectedEmail.address}
                      onSendSuccess={handleSendSuccess}
                    />
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <MessageListContainer
                  email={selectedEmail}
                  onMessageSelect={handleMessageSelect}
                  selectedMessageId={selectedMessageId}
                  refreshTrigger={refreshTrigger}
                  cacheUserKey={cacheUserKey}
                />
              </div>
            </div>
          )}

          {mobileView === "message" && selectedEmail && selectedMessageId && (
            <div className="h-full flex flex-col">
              <div className={headerClass}>
                <button
                  onClick={() => setSelectedMessageId(null)}
                  className="text-sm text-primary"
                >
                  {t("backToMessageList")}
                </button>
                <span className="text-sm font-medium">{t("messageContent")}</span>
              </div>
              <div className="flex-1 overflow-auto">
                <MessageView
                  emailId={selectedEmail.id}
                  messageId={selectedMessageId}
                  messageType={selectedMessageType}
                  fromAddress={selectedEmail.address}
                  onSendSuccess={handleSendSuccess}
                  onClose={() => setSelectedMessageId(null)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 
