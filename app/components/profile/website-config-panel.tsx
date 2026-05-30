"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { EMAIL_CONFIG } from "@/config"
import { Eye, EyeOff, Globe, Plus, Settings, Trash2 } from "lucide-react"
import { Role, ROLES } from "@/lib/permissions"
import {
  EmailDomainConfig,
  EmailDomainEntry,
  isValidEmailDomain,
  normalizeEmailDomain,
} from "@/lib/email-domains"

interface ConfigFormState {
  defaultRole: string
  domains: EmailDomainEntry[]
  adminContact: string
  maxEmails: string
  turnstileEnabled: boolean
  turnstileSiteKey: string
  turnstileSecretKey: string
}

const DEFAULT_VISIBLE = true

export function WebsiteConfigPanel() {
  const t = useTranslations("profile.website")
  const tCard = useTranslations("profile.card")
  const { toast } = useToast()
  const [form, setForm] = useState<ConfigFormState>({
    defaultRole: ROLES.CIVILIAN,
    domains: [],
    adminContact: "",
    maxEmails: EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString(),
    turnstileEnabled: false,
    turnstileSiteKey: "",
    turnstileSecretKey: "",
  })
  const [newDomain, setNewDomain] = useState("")
  const [loading, setLoading] = useState(false)
  const [showSecretKey, setShowSecretKey] = useState(false)

  const adminDomains = useMemo(() => form.domains.map((entry) => entry.domain), [form.domains])
  const visibleDomainCount = useMemo(
    () => form.domains.filter((entry) => entry.visibleToMembers).length,
    [form.domains]
  )

  useEffect(() => {
    void fetchConfig()
  }, [])

  const fetchConfig = async () => {
    const res = await fetch("/api/config")
    if (!res.ok) return

    const data = await res.json() as {
      defaultRole: Exclude<Role, typeof ROLES.EMPEROR>
      emailDomains: string
      emailDomainConfig?: EmailDomainConfig
      adminContact: string
      maxEmails: string
      turnstile?: {
        enabled: boolean
        siteKey: string
        secretKey?: string
      }
    }

    const domains = data.emailDomainConfig?.domains?.length
      ? data.emailDomainConfig.domains
      : data.emailDomains
        .split(",")
        .map((domain) => normalizeEmailDomain(domain))
        .filter(isValidEmailDomain)
        .map((domain) => ({ domain, visibleToMembers: DEFAULT_VISIBLE }))

    setForm({
      defaultRole: data.defaultRole,
      domains,
      adminContact: data.adminContact,
      maxEmails: data.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString(),
      turnstileEnabled: Boolean(data.turnstile?.enabled),
      turnstileSiteKey: data.turnstile?.siteKey ?? "",
      turnstileSecretKey: data.turnstile?.secretKey ?? "",
    })
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultRole: form.defaultRole,
          emailDomainConfig: { domains: form.domains },
          emailDomains: form.domains.map((entry) => entry.domain).join(","),
          adminContact: form.adminContact,
          maxEmails: form.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString(),
          turnstile: {
            enabled: form.turnstileEnabled,
            siteKey: form.turnstileSiteKey,
            secretKey: form.turnstileSecretKey,
          },
        }),
      })

      if (!res.ok) throw new Error(t("saveFailed"))

      toast({
        title: t("saveSuccess"),
        description: t("saveSuccess"),
      })
    } catch (error) {
      toast({
        title: t("saveFailed"),
        description: error instanceof Error ? error.message : t("saveFailed"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const addDomain = () => {
    const domain = normalizeEmailDomain(newDomain)

    if (!isValidEmailDomain(domain)) {
      toast({
        title: t("emailDomainsInvalid"),
        description: t("emailDomainsInvalid"),
        variant: "destructive",
      })
      return
    }

    if (form.domains.some((entry) => entry.domain === domain)) {
      toast({
        title: t("emailDomainsDuplicate"),
        description: t("emailDomainsDuplicate"),
      })
      return
    }

    setForm((prev) => ({
      ...prev,
      domains: [...prev.domains, { domain, visibleToMembers: true }],
    }))
    setNewDomain("")
  }

  const updateDomainVisibility = (domain: string, visibleToMembers: boolean) => {
    setForm((prev) => ({
      ...prev,
      domains: prev.domains.map((entry) =>
        entry.domain === domain ? { ...entry, visibleToMembers } : entry
      ),
    }))
  }

  const removeDomain = (domain: string) => {
    setForm((prev) => ({
      ...prev,
      domains: prev.domains.filter((entry) => entry.domain !== domain),
    }))
  }

  return (
    <div className="bg-background rounded-lg border-2 border-primary/20 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">{t("title")}</h2>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-sm">{t("defaultRole")}:</span>
          <Select value={form.defaultRole} onValueChange={(value) => setForm((prev) => ({ ...prev, defaultRole: value }))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROLES.DUKE}>{tCard("roles.DUKE")}</SelectItem>
              <SelectItem value={ROLES.KNIGHT}>{tCard("roles.KNIGHT")}</SelectItem>
              <SelectItem value={ROLES.CIVILIAN}>{tCard("roles.CIVILIAN")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-start gap-4">
          <span className="pt-2 text-sm">{t("emailDomains")}:</span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap gap-2 rounded-md border border-input bg-background px-3 py-2">
              {adminDomains.length > 0 ? (
                adminDomains.map((domain) => (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm text-foreground"
                  >
                    <Globe className="h-3.5 w-3.5 text-primary" />
                    <span>@{domain}</span>
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">{t("emailDomainsEmpty")}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("emailDomainsHint")}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-dashed border-primary/40 p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder={t("emailDomainsInputPlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addDomain()
                }
              }}
            />
            <Button type="button" onClick={addDomain} className="shrink-0 gap-2">
              <Plus className="h-4 w-4" />
              {t("emailDomainsAdd")}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">{t("emailDomainsCurrent")}</div>
            <div className="space-y-2">
              {form.domains.length > 0 ? (
                form.domains.map((entry) => (
                  <div
                    key={entry.domain}
                    className="flex flex-col gap-3 rounded-md border border-border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm">@{entry.domain}</div>
                      <div className="text-xs text-muted-foreground">
                        {entry.visibleToMembers ? t("emailDomainsVisible") : t("emailDomainsHidden")}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={entry.visibleToMembers}
                          onCheckedChange={(checked) => updateDomainVisibility(entry.domain, checked)}
                        />
                        <span>
                          {entry.visibleToMembers ? t("emailDomainsVisibleToMembers") : t("emailDomainsAdminOnly")}
                        </span>
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => removeDomain(entry.domain)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("emailDomainsEmpty")}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t("emailDomainsAllHint", { count: form.domains.length, visibleCount: visibleDomainCount })}
          </div>

          <p className="text-xs text-muted-foreground">{t("emailDomainsSaveHint")}</p>
        </div>

        <div className="space-y-4 rounded-lg border border-dashed border-primary/40 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="turnstile-enabled" className="text-sm font-medium">
                {t("turnstile.enable")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("turnstile.enableDescription")}
              </p>
            </div>
            <Switch
              id="turnstile-enabled"
              checked={form.turnstileEnabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, turnstileEnabled: checked }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="turnstile-site-key" className="text-sm font-medium">
              {t("turnstile.siteKey")}
            </Label>
            <Input
              id="turnstile-site-key"
              value={form.turnstileSiteKey}
              onChange={(e) => setForm((prev) => ({ ...prev, turnstileSiteKey: e.target.value }))}
              placeholder={t("turnstile.siteKeyPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="turnstile-secret-key" className="text-sm font-medium">
              {t("turnstile.secretKey")}
            </Label>
            <div className="relative">
              <Input
                id="turnstile-secret-key"
                type={showSecretKey ? "text" : "password"}
                value={form.turnstileSecretKey}
                onChange={(e) => setForm((prev) => ({ ...prev, turnstileSecretKey: e.target.value }))}
                placeholder={t("turnstile.secretKeyPlaceholder")}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowSecretKey((prev) => !prev)}
              >
                {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("turnstile.secretKeyDescription")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">{t("adminContact")}:</span>
          <div className="flex-1">
            <Input
              value={form.adminContact}
              onChange={(e) => setForm((prev) => ({ ...prev, adminContact: e.target.value }))}
              placeholder={t("adminContactPlaceholder")}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">{t("maxEmails")}:</span>
          <div className="flex-1">
            <Input
              type="number"
              min="1"
              max="100"
              value={form.maxEmails}
              onChange={(e) => setForm((prev) => ({ ...prev, maxEmails: e.target.value }))}
              placeholder={`${EMAIL_CONFIG.MAX_ACTIVE_EMAILS}`}
            />
          </div>
        </div>

        <Button 
          onClick={handleSave}
          disabled={loading}
          className="w-full"
        >
          {t("save")}
        </Button>
      </div>
    </div>
  )
}
