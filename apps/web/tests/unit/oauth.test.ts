import { describe, expect, it } from 'vitest'
import {
  isAllowedAuthorizeUrl,
  packState,
  parseMode,
  parseProvider,
  safeErrorParam,
  unpackState,
} from '@/lib/oauth'
import { statesEqual } from '@/lib/oauth-server'

describe('parseProvider', () => {
  it('пропускает только известные провайдеры', () => {
    expect(parseProvider('google')).toBe('google')
    expect(parseProvider('yandex')).toBe('yandex')
  })

  it('отбрасывает всё остальное, включая попытки обхода пути', () => {
    for (const bad of ['', 'Google', 'facebook', '../../v1/admin', 'google/../yandex', 'google%20']) {
      expect(parseProvider(bad)).toBeNull()
    }
  })
})

describe('parseMode', () => {
  it('по умолчанию login — незнакомое значение не должно давать привилегий', () => {
    expect(parseMode(null)).toBe('login')
    expect(parseMode(undefined)).toBe('login')
    expect(parseMode('login')).toBe('login')
    expect(parseMode('LINK')).toBe('login')
    expect(parseMode('нечто')).toBe('login')
  })

  it('распознаёт link', () => {
    expect(parseMode('link')).toBe('link')
  })
})

describe('pack/unpackState', () => {
  it('переживает round-trip с JWT-подобным state', () => {
    const state = 'eyJhbGciOiJIUzI1NiJ9.eyJ0eXAiOiJvYXV0aF9zdGF0ZSJ9.c2ln-bmF0dXJl_x'
    expect(unpackState(packState('link', state))).toEqual({ mode: 'link', state })
    expect(unpackState(packState('login', state))).toEqual({ mode: 'login', state })
  })

  it('отвергает мусор и подделанный режим', () => {
    expect(unpackState(undefined)).toBeNull()
    expect(unpackState('')).toBeNull()
    expect(unpackState('nostate')).toBeNull()
    expect(unpackState(':abc')).toBeNull()
    expect(unpackState('login:')).toBeNull()
    expect(unpackState('admin:abc')).toBeNull()
  })

  it('первое двоеточие разделяет, остальное остаётся частью state', () => {
    expect(unpackState('login:a:b:c')).toEqual({ mode: 'login', state: 'a:b:c' })
  })
})

describe('statesEqual', () => {
  it('true только на полном совпадении непустых строк', () => {
    expect(statesEqual('abc123', 'abc123')).toBe(true)
    expect(statesEqual('abc123', 'abc124')).toBe(false)
    expect(statesEqual('abc123', 'abc1234')).toBe(false)
  })

  it('пустой state никогда не совпадает — иначе отсутствие cookie проходило бы проверку', () => {
    expect(statesEqual('', '')).toBe(false)
    expect(statesEqual('', 'abc')).toBe(false)
    expect(statesEqual('abc', '')).toBe(false)
  })
})

describe('isAllowedAuthorizeUrl', () => {
  it('пропускает только https-адреса нужного провайдера', () => {
    expect(isAllowedAuthorizeUrl('google', 'https://accounts.google.com/o/oauth2/v2/auth?a=1')).toBe(
      true,
    )
    expect(isAllowedAuthorizeUrl('yandex', 'https://oauth.yandex.ru/authorize?a=1')).toBe(true)
  })

  it('блокирует чужие хосты, http и подмену через поддомен/логин в URL', () => {
    const bad = [
      'https://evil.com/o/oauth2/v2/auth',
      'http://accounts.google.com/o/oauth2/v2/auth',
      'https://accounts.google.com.evil.com/auth',
      'https://evil.com#accounts.google.com',
      'https://accounts.google.com@evil.com/auth',
      'javascript:alert(1)',
      'not a url',
      '',
    ]
    for (const url of bad) expect(isAllowedAuthorizeUrl('google', url)).toBe(false)
  })

  it('URL одного провайдера не годится другому', () => {
    expect(isAllowedAuthorizeUrl('yandex', 'https://accounts.google.com/o/oauth2/v2/auth')).toBe(
      false,
    )
  })
})

describe('safeErrorParam', () => {
  it('вырезает переводы строк (защита от инъекции в заголовок Location)', () => {
    expect(safeErrorParam('строка\r\nSet-Cookie: a=b')).toBe('строка Set-Cookie: a=b')
    expect(safeErrorParam('a\nb\rc')).toBe('a b c')
  })

  it('обрезает слишком длинный текст', () => {
    expect(safeErrorParam('я'.repeat(500))).toHaveLength(200)
  })
})
