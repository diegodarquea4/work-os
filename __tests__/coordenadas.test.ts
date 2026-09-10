import { describe, it, expect } from 'vitest'
import { parseCoordenada, parseDecimal, coordenadaValida, pareceInvertida, formatoCoordenada } from '@/lib/coordenadas'

/**
 * lib/coordenadas.ts — lo que un delegado pega en el popover de Ubicación o
 * escribe en la planilla. Dolor: formatos chilenos (coma decimal), URLs de
 * Google Maps y el error clásico de lat/lng invertidas, que la caja de Chile
 * debe rechazar (mismo CHECK que la BD, mig 104).
 */

describe('coordenadaValida / pareceInvertida', () => {
  it('Santiago, Rapa Nui y la Base Frei (Antártica) entran en la caja', () => {
    expect(coordenadaValida(-33.4489, -70.6693)).toBe(true)
    expect(coordenadaValida(-27.1127, -109.3497)).toBe(true)
    expect(coordenadaValida(-62.2008, -58.9622)).toBe(true)
  })
  it('lat/lng invertidas quedan fuera y se detectan como invertidas', () => {
    expect(coordenadaValida(-70.6693, -33.4489)).toBe(false)
    expect(pareceInvertida(-70.6693, -33.4489)).toBe(true)
  })
  it('el hemisferio norte y un punto en el Atlántico quedan fuera', () => {
    expect(coordenadaValida(40.4, -3.7)).toBe(false)
    expect(coordenadaValida(-33.4, -40.0)).toBe(false)
    expect(pareceInvertida(-33.4, -40.0)).toBe(false)
  })
})

describe('parseDecimal', () => {
  it('acepta punto y coma decimal, rechaza basura', () => {
    expect(parseDecimal('-33.4489')).toBe(-33.4489)
    expect(parseDecimal('-33,4489')).toBe(-33.4489)
    expect(parseDecimal(' -70 ')).toBe(-70)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal('-33.44.89')).toBeNull()
  })
})

describe('parseCoordenada', () => {
  it('"lat, lng" con punto decimal', () => {
    expect(parseCoordenada('-33.4489, -70.6693')).toEqual({ lat: -33.4489, lng: -70.6693 })
    expect(parseCoordenada('-33.4489,-70.6693')).toEqual({ lat: -33.4489, lng: -70.6693 })
    expect(parseCoordenada('-33.4489 -70.6693')).toEqual({ lat: -33.4489, lng: -70.6693 })
    expect(parseCoordenada('-33.4489; -70.6693')).toEqual({ lat: -33.4489, lng: -70.6693 })
  })
  it('coma decimal (formato chileno)', () => {
    expect(parseCoordenada('-33,4489 -70,6693')).toEqual({ lat: -33.4489, lng: -70.6693 })
    expect(parseCoordenada('-33,4489; -70,6693')).toEqual({ lat: -33.4489, lng: -70.6693 })
    expect(parseCoordenada('-33,4489, -70,6693')).toEqual({ lat: -33.4489, lng: -70.6693 })
  })
  it('URL de Google Maps (@lat,lng y ?q=lat,lng)', () => {
    expect(parseCoordenada('https://www.google.com/maps/place/Plaza+de+Armas/@-33.4378,-70.6505,17z/data=!3m1')).toEqual({ lat: -33.4378, lng: -70.6505 })
    expect(parseCoordenada('https://maps.google.com/?q=-39.8142,-73.2459')).toEqual({ lat: -39.8142, lng: -73.2459 })
  })
  it('invertidas, un solo número o texto → null', () => {
    expect(parseCoordenada('-70.6693, -33.4489')).toBeNull()
    expect(parseCoordenada('-33.4489')).toBeNull()
    expect(parseCoordenada('Valdivia')).toBeNull()
    expect(parseCoordenada('')).toBeNull()
  })
})

describe('formatoCoordenada', () => {
  it('4 decimales con punto', () => {
    expect(formatoCoordenada(-33.44891234, -70.6693)).toBe('-33.4489, -70.6693')
  })
})
