import type { MappingProfile } from './types'

export function mappingProfileKey(fingerprint: string): string {
  return `hetong:mapping:${fingerprint}`
}

export function isMappingProfile(value: unknown): value is MappingProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<MappingProfile>
  return profile.version === 1
    && typeof profile.template_fingerprint === 'string'
    && typeof profile.order_sheet === 'string'
    && Array.isArray(profile.items)
}
