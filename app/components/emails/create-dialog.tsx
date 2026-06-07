"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Check, ChevronDown, Copy, Plus, RefreshCw, Shuffle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { nanoid } from "nanoid"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { EXPIRY_OPTIONS } from "@/types/email"
import { useCopy } from "@/hooks/use-copy"
import { useConfig } from "@/hooks/use-config"
import { cn } from "@/lib/utils"

interface CreateDialogProps {
  onEmailCreated: () => void
}

const RANDOM_DOMAIN_VALUE = "__random__"

function pickRandomDomain(domains: string[]) {
  return domains[Math.floor(Math.random() * domains.length)] ?? ""
}

export function CreateDialog({ onEmailCreated }: CreateDialogProps) {
  const { config } = useConfig()
  const t = useTranslations("emails.create")
  const tList = useTranslations("emails.list")
  const tCommon = useTranslations("common.actions")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [emailName, setEmailName] = useState("")
  const [currentDomain, setCurrentDomain] = useState("")
  const [domainPopoverOpen, setDomainPopoverOpen] = useState(false)
  const [expiryTime, setExpiryTime] = useState(EXPIRY_OPTIONS[1].value.toString())
  const { toast } = useToast()
  const { copyToClipboard } = useCopy()
  const availableDomains = useMemo(() => config?.emailDomainsArray ?? [], [config?.emailDomainsArray])
  const hasAvailableDomains = availableDomains.length > 0
  const isRandomDomain = currentDomain === RANDOM_DOMAIN_VALUE
  const currentDomainLabel = isRandomDomain ? t("randomDomain") : `@${currentDomain}`

  const generateRandomName = () => setEmailName(nanoid(8))

  const copyEmailAddress = () => {
    if (!currentDomain || isRandomDomain) return
    copyToClipboard(`${emailName}@${currentDomain}`)
  }

  const createEmail = async () => {
    if (!hasAvailableDomains || !currentDomain) {
      toast({
        title: tList("error"),
        description: t("noDomains"),
        variant: "destructive"
      })
      return
    }

    if (!emailName.trim()) {
      toast({
        title: tList("error"),
        description: t("namePlaceholder"),
        variant: "destructive"
      })
      return
    }

    const domain = isRandomDomain ? pickRandomDomain(availableDomains) : currentDomain
    if (!domain) {
      toast({
        title: tList("error"),
        description: t("noDomains"),
        variant: "destructive"
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/emails/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: emailName,
          domain,
          expiryTime: parseInt(expiryTime)
        })
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: tList("error"),
          description: (data as { error: string }).error,
          variant: "destructive"
        })
        return
      }

      toast({
        title: tList("success"),
        description: t("success")
      })
      onEmailCreated()
      setOpen(false)
      setEmailName("")
    } catch {
      toast({
        title: tList("error"),
        description: t("failed"),
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (availableDomains.length === 0) {
      setCurrentDomain("")
      return
    }

    setCurrentDomain((domain) => (
      domain === RANDOM_DOMAIN_VALUE || availableDomains.includes(domain)
        ? domain
        : availableDomains[0] ?? ""
    ))
  }, [availableDomains])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          {t("title")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Input
              value={emailName}
              onChange={(e) => setEmailName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="flex-1"
            />
            {hasAvailableDomains && (
              <Popover open={domainPopoverOpen} onOpenChange={setDomainPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-[180px] justify-between gap-2 px-3 font-normal"
                  >
                    <span className="truncate">{currentDomainLabel}</span>
                    <ChevronDown className="size-4 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[220px] p-1">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                      isRandomDomain && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => {
                      setCurrentDomain(RANDOM_DOMAIN_VALUE)
                      setDomainPopoverOpen(false)
                    }}
                  >
                    <Shuffle className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{t("randomDomain")}</span>
                    {isRandomDomain && <Check className="size-4 shrink-0" />}
                  </button>
                  {availableDomains.map((domain) => (
                    <button
                      key={domain}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                        currentDomain === domain && "bg-accent text-accent-foreground"
                      )}
                      onClick={() => {
                        setCurrentDomain(domain)
                        setDomainPopoverOpen(false)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">@{domain}</span>
                      {currentDomain === domain && <Check className="size-4 shrink-0" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={generateRandomName}
              type="button"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <Label className="shrink-0 text-muted-foreground">{t("expiryTime")}</Label>
            <RadioGroup
              value={expiryTime}
              onValueChange={setExpiryTime}
              className="flex flex-wrap gap-4"
            >
              {EXPIRY_OPTIONS.map((option, index) => {
                const labels = [t("oneHour"), t("oneDay"), t("threeDays"), t("oneMonth"), t("permanent")]
                return (
                  <div key={option.value} className="flex items-center gap-2">
                    <RadioGroupItem value={option.value.toString()} id={option.value.toString()} />
                    <Label htmlFor={option.value.toString()} className="cursor-pointer text-sm">
                      {labels[index]}
                    </Label>
                  </div>
                )
              })}
            </RadioGroup>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="shrink-0">{t("domain")}:</span>
            {!hasAvailableDomains ? (
              <span className="text-destructive">{t("noDomains")}</span>
            ) : emailName ? (
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate">
                  {isRandomDomain ? `${emailName}@${t("randomDomainPreview")}` : `${emailName}@${currentDomain}`}
                </span>
                {!isRandomDomain && (
                  <div
                    className="shrink-0 cursor-pointer hover:text-primary transition-colors"
                    onClick={copyEmailAddress}
                  >
                    <Copy className="size-4" />
                  </div>
                )}
              </div>
            ) : (
              <span className="text-gray-400">...</span>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={createEmail} disabled={loading || !hasAvailableDomains}>
            {loading ? t("creating") : t("create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
