"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Globe, Plus, Settings, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useEffect, useMemo, useState } from "react"
import { Role, ROLES } from "@/lib/permissions"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EMAIL_CONFIG } from "@/config"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { isValidEmailDomain, normalizeEmailDomain, type RoleEmailDomains } from "@/lib/email-domains"

type ConfigurableDomainRole = keyof RoleEmailDomains

const DOMAIN_ROLES: ConfigurableDomainRole[] = ["duke", "knight"]

export function WebsiteConfigPanel() {
  const t = useTranslations("profile.website")
  const tCard = useTranslations("profile.card")
  const [defaultRole, setDefaultRole] = useState<string>("")
  const [emailRoleDomains, setEmailRoleDomains] = useState<RoleEmailDomains>({
    duke: [],
    knight: [],
  })
  const [emailDomainInputs, setEmailDomainInputs] = useState<Record<ConfigurableDomainRole, string>>({
    duke: "",
    knight: "",
  })
  const [adminContact, setAdminContact] = useState<string>("")
  const [maxEmails, setMaxEmails] = useState<string>(EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString())
  const [turnstileEnabled, setTurnstileEnabled] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("")
  const [turnstileSecretKey, setTurnstileSecretKey] = useState("")
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const allEmailDomains = useMemo(() => (
    Array.from(new Set([...emailRoleDomains.duke, ...emailRoleDomains.knight]))
  ), [emailRoleDomains])
  const roleNames: Record<ConfigurableDomainRole, string> = {
    duke: tCard("roles.DUKE"),
    knight: tCard("roles.KNIGHT"),
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    const res = await fetch("/api/config")
    if (res.ok) {
      const data = await res.json() as { 
        defaultRole: Exclude<Role, typeof ROLES.EMPEROR>,
        emailDomains: string,
        emailRoleDomains?: Partial<RoleEmailDomains>,
        adminContact: string,
        maxEmails: string,
        turnstile?: {
          enabled: boolean,
          siteKey: string,
          secretKey?: string
        }
      }
      const fallbackDomains = data.emailDomains
        .split(",")
        .map((domain) => normalizeEmailDomain(domain))
        .filter(isValidEmailDomain)

      setDefaultRole(data.defaultRole)
      setEmailRoleDomains({
        duke: data.emailRoleDomains?.duke ?? fallbackDomains,
        knight: data.emailRoleDomains?.knight ?? fallbackDomains,
      })
      setAdminContact(data.adminContact)
      setMaxEmails(data.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString())
      setTurnstileEnabled(Boolean(data.turnstile?.enabled))
      setTurnstileSiteKey(data.turnstile?.siteKey ?? "")
      setTurnstileSecretKey(data.turnstile?.secretKey ?? "")
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          defaultRole, 
          emailDomains: allEmailDomains.join(","),
          emailRoleDomains,
          adminContact,
          maxEmails: maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS.toString(),
          turnstile: {
            enabled: turnstileEnabled,
            siteKey: turnstileSiteKey,
            secretKey: turnstileSecretKey
          }
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

  const addEmailDomain = (role: ConfigurableDomainRole) => {
    const domain = normalizeEmailDomain(emailDomainInputs[role])

    if (!isValidEmailDomain(domain)) {
      toast({
        title: t("emailDomainsInvalid"),
        description: t("emailDomainsInvalid"),
        variant: "destructive",
      })
      return
    }

    if (emailRoleDomains[role].includes(domain)) {
      toast({
        title: t("emailDomainsDuplicate"),
        description: t("emailDomainsDuplicate"),
      })
      return
    }

    setEmailRoleDomains((prev) => ({
      ...prev,
      [role]: [...prev[role], domain],
    }))
    setEmailDomainInputs((prev) => ({ ...prev, [role]: "" }))
  }

  const removeEmailDomain = (role: ConfigurableDomainRole, domain: string) => {
    setEmailRoleDomains((prev) => ({
      ...prev,
      [role]: prev[role].filter((item) => item !== domain),
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
          <Select value={defaultRole} onValueChange={setDefaultRole}>
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
            <div className="grid gap-2 md:grid-cols-2">
              {DOMAIN_ROLES.map((role) => (
                <div key={role} className="rounded-md border border-input bg-background px-3 py-2">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Globe className="h-3.5 w-3.5 text-primary" />
                    <span>{roleNames[role]}</span>
                    <span className="text-xs text-muted-foreground">({emailRoleDomains[role].length})</span>
                  </div>
                  <div className="flex min-h-7 flex-wrap gap-1.5">
                    {emailRoleDomains[role].length > 0 ? (
                      emailRoleDomains[role].slice(0, 3).map((domain) => (
                        <span
                          key={domain}
                          className="max-w-[12rem] truncate rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-foreground"
                        >
                          {domain}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("emailDomainsEmpty")}</span>
                    )}
                    {emailRoleDomains[role].length > 3 ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        +{emailRoleDomains[role].length - 3}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("emailDomainsHint")}</p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="shrink-0 gap-2">
                <Settings className="h-4 w-4" />
                {t("emailDomainsManage")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[520px]">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">{t("emailDomainsManage")}</h3>
                  <p className="text-xs text-muted-foreground">{t("emailDomainsPopoverHint")}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {DOMAIN_ROLES.map((role) => (
                    <div key={role} className="space-y-3 rounded-md border border-border p-3">
                      <div>
                        <div className="text-sm font-semibold">{roleNames[role]}</div>
                        <p className="text-xs text-muted-foreground">{t(`emailDomainsRoleHint.${role}`)}</p>
                      </div>

                      <div className="flex gap-2">
                        <Input
                          value={emailDomainInputs[role]}
                          onChange={(e) => setEmailDomainInputs((prev) => ({ ...prev, [role]: e.target.value }))}
                          placeholder={t("emailDomainsInputPlaceholder")}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              addEmailDomain(role)
                            }
                          }}
                        />
                        <Button type="button" size="icon" onClick={() => addEmailDomain(role)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="max-h-52 space-y-2 overflow-auto pr-1">
                        {emailRoleDomains[role].length > 0 ? (
                          emailRoleDomains[role].map((domain) => (
                            <div
                              key={domain}
                              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                            >
                              <span className="min-w-0 truncate text-sm">{domain}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => removeEmailDomain(role, domain)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                            {t("emailDomainsEmpty")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {t("emailDomainsAllHint", { count: allEmailDomains.length })}
                </div>

                <p className="text-xs text-muted-foreground">{t("emailDomainsSaveHint")}</p>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm">{t("adminContact")}:</span>
          <div className="flex-1">
            <Input 
              value={adminContact}
              onChange={(e) => setAdminContact(e.target.value)}
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
              value={maxEmails}
              onChange={(e) => setMaxEmails(e.target.value)}
              placeholder={`${EMAIL_CONFIG.MAX_ACTIVE_EMAILS}`}
            />
          </div>
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
              checked={turnstileEnabled}
              onCheckedChange={setTurnstileEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="turnstile-site-key" className="text-sm font-medium">
              {t("turnstile.siteKey")}
            </Label>
            <Input
              id="turnstile-site-key"
              value={turnstileSiteKey}
              onChange={(e) => setTurnstileSiteKey(e.target.value)}
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
                value={turnstileSecretKey}
                onChange={(e) => setTurnstileSecretKey(e.target.value)}
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
