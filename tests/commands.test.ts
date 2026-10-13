import { describe, it, expect } from 'vitest'
import { matchCommands, type Command } from '../src/ui/commands'

const c = (label: string, hint?: string): Command => ({ label, hint, run: () => {} })
const labels = (q: string, list: Command[]) => matchCommands(q, list).map(x => x.label)

const LIST = [
  c('Modo: Normal', 'Entrada'), c('Modo: Mantener', 'Entrada'), c('Modo: Arpegio', 'Entrada'),
  c('Mostrar panel: Piano', 'Paneles'), c('Instrumento: Piano de cola', 'Piano'),
  c('Instrumento: Arpa', 'Cuerdas'), c('Tonalidad: Sol mayor'), c('Disposición: Clase', 'Disposiciones'),
]

describe('matchCommands', () => {
  it('finds by the start of a word, in any of them', () => {
    expect(labels('arp', LIST)).toEqual(['Modo: Arpegio', 'Instrumento: Arpa'])
  })

  it('needs every word typed', () => {
    expect(labels('pan pia', LIST)).toEqual(['Mostrar panel: Piano'])
  })

  it('ignores case and accents', () => {
    expect(labels('DISPOSICION', LIST)).toEqual(['Disposición: Clase'])
  })

  it('puts a name that starts with the word first', () => {
    expect(labels('piano', LIST)).toEqual(['Mostrar panel: Piano', 'Instrumento: Piano de cola'])
    expect(labels('cola', LIST)).toEqual(['Instrumento: Piano de cola'])
  })

  it('finds a singular name from a plural typed', () => {
    const list = [c('Circle of fifths: Seventh chords'), c('Tonalidad: Do menor')]
    expect(labels('sevenths', list)).toEqual(['Circle of fifths: Seventh chords'])
    expect(labels('menores', list)).toEqual(['Tonalidad: Do menor'])
  })

  it('reads the hint too', () => {
    expect(labels('entrada', LIST)).toHaveLength(3)
  })

  it('finds nothing for an empty or unknown query', () => {
    expect(labels('', LIST)).toEqual([])
    expect(labels('xyz', LIST)).toEqual([])
  })
})
