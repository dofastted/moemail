import { ROLES, type Role } from "./permissions"

export interface EmailDomainEntry {
  domain: string
  visibleToMembers: boolean
}

export interface SiteConfigStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<unknown>
}

export interface EmailDomainConfig {
  domains: EmailDomainEntry[]
}

export const DEFAULT_EMAIL_DOMAINS = ["moemail.app"]
export const EMAIL_DOMAIN_CONFIG_KEY = "EMAIL_DOMAIN_CONFIG"
export const LEGACY_EMAIL_DOMAINS_KEY = "EMAIL_DOMAINS"

export function normalizeEmailDomain(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase()
}

export function isValidEmailDomain(value: string) {
  const normalized = normalizeEmailDomain(value)
  return Boolean(
    normalized &&
    /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/i.test(normalized)
  )
}

export function uniqueDomains(domains: string[]) {
  return Array.from(new Set(domains.map((domain) => normalizeEmailDomain(domain)).filter(Boolean)))
}

export function parseEmailDomains(value?: string | null) {
  return uniqueDomains(
    (value || "")
      .split(",")
      .map((domain) => normalizeEmailDomain(domain))
      .filter(isValidEmailDomain)
  )
}

export function normalizeEmailDomainConfig(
  value: Partial<EmailDomainConfig> | undefined,
  fallbackDomains = DEFAULT_EMAIL_DOMAINS
): EmailDomainConfig {
  const fallback = uniqueDomains(fallbackDomains.filter(isValidEmailDomain))
  const sourceEntries = value?.domains?.length
    ? value.domains
    : fallback.map((domain) => ({ domain, visibleToMembers: true }))
  const domains = sourceEntries
    .map((entry) => ({
      domain: normalizeEmailDomain(entry.domain),
      visibleToMembers: Boolean(entry.visibleToMembers ?? true),
    }))
    .filter((entry) => isValidEmailDomain(entry.domain))

  const seen = new Set<string>()
  return {
    domains: domains.filter((entry) => {
      if (seen.has(entry.domain)) return false
      seen.add(entry.domain)
      return true
    }),
  }
}

export function getVisibleDomains(domainConfig: EmailDomainConfig) {
  return domainConfig.domains.filter((entry) => entry.visibleToMembers).map((entry) => entry.domain)
}

export function getAllDomains(domainConfig: EmailDomainConfig) {
  return domainConfig.domains.map((entry) => entry.domain)
}

export function getAdminDomains(domainConfig: EmailDomainConfig) {
  return getAllDomains(domainConfig)
}

export function getMemberDomains(domainConfig: EmailDomainConfig) {
  return getVisibleDomains(domainConfig)
}

export function getAllowedDomainsForRole(role: Role, domainConfig: EmailDomainConfig) {
  if (role === ROLES.EMPEROR) return getAdminDomains(domainConfig)
  return getMemberDomains(domainConfig)
}

export async function getEmailDomainConfig(siteConfig: SiteConfigStore): Promise<EmailDomainConfig> {
  const [domainConfigJson, legacyDomainsText] = await Promise.all([
    siteConfig.get(EMAIL_DOMAIN_CONFIG_KEY),
    siteConfig.get(LEGACY_EMAIL_DOMAINS_KEY),
  ])

  const fallbackDomains = parseEmailDomains(legacyDomainsText)
  const finalFallback = fallbackDomains.length > 0 ? fallbackDomains : DEFAULT_EMAIL_DOMAINS

  if (!domainConfigJson) {
    return normalizeEmailDomainConfig(
      {
        domains: finalFallback.map((domain) => ({ domain, visibleToMembers: true })),
      },
      finalFallback
    )
  }

  try {
    const parsed = JSON.parse(domainConfigJson) as Partial<EmailDomainConfig>
    return normalizeEmailDomainConfig(parsed, finalFallback)
  } catch {
    return normalizeEmailDomainConfig(
      {
        domains: finalFallback.map((domain) => ({ domain, visibleToMembers: true })),
      },
      finalFallback
    )
  }
}

export async function saveEmailDomainConfig(siteConfig: SiteConfigStore, domainConfig: Partial<EmailDomainConfig>) {
  const sanitized = normalizeEmailDomainConfig(domainConfig, [])
  await Promise.all([
    siteConfig.put(EMAIL_DOMAIN_CONFIG_KEY, JSON.stringify(sanitized)),
    siteConfig.put(LEGACY_EMAIL_DOMAINS_KEY, getAllDomains(sanitized).join(",")),
  ])
  return sanitized
}
