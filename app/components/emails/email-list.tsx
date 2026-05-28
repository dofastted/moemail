"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useTranslations } from "next-intl"
import { CreateDialog } from "./create-dialog"
import { ShareDialog } from "./share-dialog"
import { Filter, Mail, RefreshCw, Search, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useThrottle } from "@/hooks/use-throttle"
import { EMAIL_CONFIG } from "@/config"
import { useToast } from "@/components/ui/use-toast"
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
import { ROLES } from "@/lib/permissions"
import { useUserRole } from "@/hooks/use-user-role"
import { useConfig } from "@/hooks/use-config"
import { Input } from "@/components/ui/input"

interface Email {
  id: string
  address: string
  createdAt: number
  expiresAt: number
}

interface EmailListProps {
  onEmailSelect: (email: Email | null) => void
  selectedEmailId?: string
}

interface EmailResponse {
  emails: Email[]
  nextCursor: string | null
  total: number | null
  hasMore: boolean
}

type LoadOptions = {
  reset?: boolean
  cursor?: string | null
  includeTotal?: boolean
  prefetch?: boolean
}

const DEFAULT_SEARCH = ""
const DEFAULT_DOMAIN = ""

export function EmailList({ onEmailSelect, selectedEmailId }: EmailListProps) {
  const { data: session } = useSession()
  const { config } = useConfig()
  const { role } = useUserRole()
  const t = useTranslations("emails.list")
  const tCommon = useTranslations("common.actions")
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [searchText, setSearchText] = useState(DEFAULT_SEARCH)
  const [domainSuffix, setDomainSuffix] = useState(DEFAULT_DOMAIN)
  const [appliedSearchText, setAppliedSearchText] = useState(DEFAULT_SEARCH)
  const [appliedDomainSuffix, setAppliedDomainSuffix] = useState(DEFAULT_DOMAIN)
  const [emailToDelete, setEmailToDelete] = useState<Email | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const { toast } = useToast()
  const requestIdRef = useRef(0)
  const emailsRef = useRef<Email[]>([])

  useEffect(() => {
    emailsRef.current = emails
  }, [emails])

  const hasFilters = useMemo(
    () => Boolean(appliedSearchText.trim() || appliedDomainSuffix.trim()),
    [appliedSearchText, appliedDomainSuffix]
  )

  const visibleEmails = emails
  const totalCount = total ?? emails.length

  const buildUrl = useCallback((cursor?: string | null, includeTotal = true) => {
    const url = new URL("/api/emails", window.location.origin)
    url.searchParams.set("limit", String(EMAIL_CONFIG.EMAIL_LIST_PAGE_SIZE))
    if (cursor) {
      url.searchParams.set("cursor", cursor)
    }
    if (appliedSearchText.trim()) {
      url.searchParams.set("search", appliedSearchText.trim())
    }
    if (appliedDomainSuffix.trim()) {
      url.searchParams.set("domain", appliedDomainSuffix.trim())
    }
    if (!includeTotal) {
      url.searchParams.set("includeTotal", "0")
    }
    return url
  }, [appliedDomainSuffix, appliedSearchText])

  const appendEmails = useCallback((incoming: Email[], replace = false) => {
    setEmails(prev => {
      const current = replace ? [] : prev
      const merged = [...current]
      const seen = new Set(current.map(email => email.id))

      for (const email of incoming) {
        if (seen.has(email.id)) {
          continue
        }
        seen.add(email.id)
        merged.push(email)
      }

      emailsRef.current = merged
      return merged
    })
  }, [])

  const prefetchEmails = useCallback(async (startCursor: string | null, requestId: number) => {
    let currentCursor = startCursor

    while (currentCursor && requestIdRef.current === requestId) {
      try {
        const url = buildUrl(currentCursor, false)
        const response = await fetch(url)
        const data = await response.json() as EmailResponse

        if (requestIdRef.current !== requestId) {
          return
        }

        appendEmails(data.emails, false)
        setNextCursor(data.nextCursor)
        currentCursor = data.nextCursor
      } catch (error) {
        if (requestIdRef.current === requestId) {
          console.error("Failed to prefetch emails:", error)
        }
        return
      }
    }
  }, [appendEmails, buildUrl])

  const fetchEmails = useCallback(async (options: LoadOptions = {}) => {
    const { reset = false, cursor = null, includeTotal = true, prefetch = false } = options
    const requestId = ++requestIdRef.current

    if (reset) {
      setLoading(true)
      setListError(null)
      setEmails([])
      emailsRef.current = []
      setNextCursor(null)
      setTotal(null)
    } else if (cursor) {
      setLoadingMore(true)
    } else {
      setRefreshing(true)
    }

    try {
      const url = buildUrl(cursor, includeTotal)
      const response = await fetch(url)
      const data = await response.json() as EmailResponse

      if (requestIdRef.current !== requestId) {
        return
      }

      appendEmails(data.emails, reset)
      setNextCursor(data.nextCursor)
      if (typeof data.total === "number") {
        setTotal(data.total)
      }

      if (prefetch && !cursor && data.hasMore && data.nextCursor) {
        void prefetchEmails(data.nextCursor, requestId)
      }
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setListError(error instanceof Error ? error.message : t("error"))
        console.error("Failed to fetch emails:", error)
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false)
        setRefreshing(false)
        setLoadingMore(false)
      }
    }
  }, [appendEmails, buildUrl, t])

  const applyFilters = useCallback(() => {
    setAppliedSearchText(searchText.trim())
    setAppliedDomainSuffix(domainSuffix.trim())
  }, [domainSuffix, searchText])

  const clearFilters = useCallback(() => {
    setSearchText(DEFAULT_SEARCH)
    setDomainSuffix(DEFAULT_DOMAIN)
    setAppliedSearchText(DEFAULT_SEARCH)
    setAppliedDomainSuffix(DEFAULT_DOMAIN)
  }, [])

  const handleRefresh = async () => {
    await fetchEmails({
      reset: true,
      includeTotal: true,
      prefetch: true,
    })
  }

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMore) return
    if (!nextCursor) return

    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    const threshold = clientHeight * 1.5
    const remainingScroll = scrollHeight - scrollTop

    if (remainingScroll <= threshold) {
      fetchEmails({
        cursor: nextCursor,
        includeTotal: false,
        prefetch: false,
      })
    }
  }, 200)

  useEffect(() => {
    if (!session) return

    fetchEmails({
      reset: true,
      includeTotal: true,
      prefetch: true,
    })
  }, [fetchEmails, session])

  const handleDelete = async (email: Email) => {
    try {
      const response = await fetch(`/api/emails/${email.id}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: t("error"),
          description: (data as { error: string }).error,
          variant: "destructive"
        })
        return
      }

      setEmails(prev => prev.filter(e => e.id !== email.id))
      setTotal(prev => Math.max((prev ?? emailsRef.current.length) - 1, 0))

      toast({
        title: t("success"),
        description: t("deleteSuccess")
      })
      
      if (selectedEmailId === email.id) {
        onEmailSelect(null)
      }
    } catch {
      toast({
        title: t("error"),
        description: t("deleteFailed"),
        variant: "destructive"
      })
    } finally {
      setEmailToDelete(null)
    }
  }

  if (!session) return null

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="p-2 flex justify-between items-center border-b border-primary/20">
          <div className="flex items-center gap-2">
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
              {role === ROLES.EMPEROR ? (
                t("emailCountUnlimited", {
                  count: totalCount,
                })
              ) : (
                t("emailCount", {
                  count: totalCount,
                  max: config?.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS
                })
              )}
            </span>
          </div>
          <CreateDialog onEmailCreated={handleRefresh} />
        </div>

        <div className="border-b border-primary/10 p-2 space-y-2">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    applyFilters()
                  }
                }}
                placeholder={t("searchPlaceholder")}
                className="pl-9"
              />
            </div>
            <div className="relative">
              <Input
                value={domainSuffix}
                onChange={(e) => setDomainSuffix(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    applyFilters()
                  }
                }}
                placeholder={t("domainPlaceholder")}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={applyFilters} className="flex-1" size="sm">
                <Filter className="size-4" />
                {t("applyFilter")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearFilters}
                disabled={!searchText && !domainSuffix && !appliedSearchText && !appliedDomainSuffix}
                className="shrink-0"
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2" onScroll={handleScroll}>
          {loading ? (
            <div className="text-center text-sm text-gray-500">{t("loading")}</div>
          ) : listError ? (
            <div className="text-center text-sm text-destructive">
              {listError}
            </div>
          ) : visibleEmails.length > 0 ? (
            <>
              <div className="space-y-1">
                {visibleEmails.map(email => (
                  <div
                    key={email.id}
                    className={cn("flex items-center gap-2 p-2 rounded cursor-pointer text-sm group",
                      "hover:bg-primary/5",
                      selectedEmailId === email.id && "bg-primary/10"
                    )}
                    onClick={() => onEmailSelect(email)}
                  >
                    <Mail className="h-4 w-4 text-primary/60" />
                    <div className="truncate flex-1">
                      <div className="font-medium truncate">{email.address}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(email.expiresAt).getFullYear() === 9999 ? (
                          t("permanent")
                        ) : (
                          `${t("expiresAt")}: ${new Date(email.expiresAt).toLocaleString()}`
                        )}
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <ShareDialog emailId={email.id} emailAddress={email.address} />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEmailToDelete(email)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {loadingMore && (
                <div className="text-center text-sm text-gray-500 py-2">
                  {t("loadingMore")}
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-sm text-gray-500">
              {hasFilters ? t("noFilteredEmails") : t("noEmails")}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!emailToDelete} onOpenChange={() => setEmailToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { email: emailToDelete?.address || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => emailToDelete && handleDelete(emailToDelete)}
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
} 
