import type { Role } from "./permissions"
import { ROLES } from "./permissions"

export interface RoleEmailDomains {
  duke: string[]
  knight: string[]
}

export interface SiteConfigStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<unknown>
}

export const DEFAULT_EMAIL_DOMAINS = ["moemail.app"]
export const EMAIL_ROLE_DOMAINS_KEY = "EMAIL_ROLE_DOMAINS"
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

export function parseEmailDomains(value?: string | null) {
  const domains = (value || "")
    .split(",")
    .map((domain) => normalizeEmailDomain(domain))
    .filter(isValidEmailDomain)

  return uniqueDomains(domains)
}

export function uniqueDomains(domains: string[]) {
  return Array.from(new Set(domains.map((domain) => normalizeEmailDomain(domain)).filter(Boolean)))
}

export function sanitizeRoleEmailDomains(value: Partial<RoleEmailDomains> | undefined, fallbackDomains = DEFAULT_EMAIL_DOMAINS): RoleEmailDomains {
  const fallback = uniqueDomains(fallbackDomains.filter(isValidEmailDomain))
  const sanitizeRole = (domains: string[] | undefined) => {
    const source = Array.isArray(domains) ? domains : fallback
    return uniqueDomains(source.filter(isValidEmailDomain))
  }

  return {
    duke: sanitizeRole(value?.duke),
    knight: sanitizeRole(value?.knight),
  }
}

export function getAllRoleEmailDomains(roleDomains: RoleEmailDomains) {
  return uniqueDomains([...roleDomains.duke, ...roleDomains.knight])
}

export function getAllowedDomainsForRole(role: Role, roleDomains: RoleEmailDomains) {
  if (role === ROLES.EMPEROR) return getAllRoleEmailDomains(roleDomains)
  if (role === ROLES.DUKE) return roleDomains.duke
  if (role === ROLES.KNIGHT) return roleDomains.knight
  return []
}

export async function getRoleEmailDomains(siteConfig: SiteConfigStore): Promise<RoleEmailDomains> {
  const [roleDomainsJson, legacyDomainsText] = await Promise.all([
    siteConfig.get(EMAIL_ROLE_DOMAINS_KEY),
    siteConfig.get(LEGACY_EMAIL_DOMAINS_KEY),
  ])

  const fallbackDomains = parseEmailDomains(legacyDomainsText)
  const finalFallback = fallbackDomains.length > 0 ? fallbackDomains : DEFAULT_EMAIL_DOMAINS

  if (!roleDomainsJson) {
    return sanitizeRoleEmailDomains(undefined, finalFallback)
  }

  try {
    const parsed = JSON.parse(roleDomainsJson) as Partial<RoleEmailDomains>
    return sanitizeRoleEmailDomains(parsed, finalFallback)
  } catch {
    return sanitizeRoleEmailDomains(undefined, finalFallback)
  }
}

export async function saveRoleEmailDomains(siteConfig: SiteConfigStore, roleDomains: RoleEmailDomains) {
  const sanitized = sanitizeRoleEmailDomains(roleDomains, [])
  const legacyDomains = getAllRoleEmailDomains(sanitized).join(",")

  await Promise.all([
    siteConfig.put(EMAIL_ROLE_DOMAINS_KEY, JSON.stringify(sanitized)),
    siteConfig.put(LEGACY_EMAIL_DOMAINS_KEY, legacyDomains),
  ])

  return sanitized
}
