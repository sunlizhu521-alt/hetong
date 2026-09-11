import { describe, expect, it } from 'vitest'
import { isMappingProfile, mappingProfileKey } from './profile'

describe('mapping profile', () => {
  it('uses the exact template fingerprint as the storage key', () => {
    expect(mappingProfileKey('abc123')).toBe('hetong:mapping:abc123')
  })

  it('rejects malformed profile data', () => {
    expect(isMappingProfile({ version: 1, template_fingerprint: 'abc', order_sheet: '订单', items: [] })).toBe(true)
    expect(isMappingProfile({ version: 2, items: [] })).toBe(false)
  })
})
