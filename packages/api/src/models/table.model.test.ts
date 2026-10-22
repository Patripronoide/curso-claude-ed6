import { describe, it, expect } from 'vitest'
import { normalizeTableStatus, TABLE_STATUSES } from './table.model.js'
import { InvalidTableStatusError } from '@errors/DomainErrors.js'

describe('normalizeTableStatus', () => {
    it('acepta los tres estados válidos', () => {
        for (const status of ['libre', 'ocupada', 'reservada']) {
            expect(normalizeTableStatus(status)).toBe(status)
        }
        expect(TABLE_STATUSES).toEqual(['libre', 'ocupada', 'reservada'])
    })

    it('normaliza mayúsculas y espacios alrededor', () => {
        expect(normalizeTableStatus(' LIBRE ')).toBe('libre')
        expect(normalizeTableStatus('Ocupada')).toBe('ocupada')
    })

    it('lanza InvalidTableStatusError con un estado inválido', () => {
        expect(() => normalizeTableStatus('rota')).toThrow(InvalidTableStatusError)
        expect(() => normalizeTableStatus('rota')).toThrow(
            'Invalid table status: rota. Must be one of: libre, ocupada, reservada'
        )
    })

    it('lanza InvalidTableStatusError si el estado está vacío o no es una cadena', () => {
        expect(() => normalizeTableStatus('')).toThrow(InvalidTableStatusError)
        expect(() => normalizeTableStatus(undefined as unknown as string)).toThrow(InvalidTableStatusError)
        expect(() => normalizeTableStatus(3 as unknown as string)).toThrow(InvalidTableStatusError)
    })
})
