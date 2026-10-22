import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SqliteTableRepository } from './table.repository.js'
import { Database } from '@config/database.js'
import type { Table } from '@models/table.model.js'

const now = new Date().toISOString()

function buildTable(overrides: Partial<Table> & Pick<Table, 'id' | 'number'>): Table {
    return {
        restaurantId: 'r1',
        description: null,
        capacity: 4,
        status: 'libre',
        createdAt: now,
        updatedAt: now,
        ...overrides
    }
}

describe('SqliteTableRepository (Integration)', () => {
    let db: Database
    let repo: SqliteTableRepository

    beforeAll(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqliteTableRepository(db)

        for (const id of ['r1', 'r2']) {
            await db.run(
                'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, 'La Trattoria', 'Calle Mayor 10', 'info@trattoria.com', '+34 612345678', 'Carlos', 'García', now, now]
            )
        }
    })

    afterAll(async () => {
        await db.close()
    })

    describe('CRUD', () => {
        it('guarda y encuentra una mesa por id', async () => {
            await repo.save(buildTable({ id: 't1', number: 3, description: 'Terraza' }))

            const found = await repo.findById('t1')
            expect(found).toEqual(buildTable({ id: 't1', number: 3, description: 'Terraza' }))
        })

        it('devuelve null si la mesa no existe', async () => {
            expect(await repo.findById('no-existe')).toBeNull()
        })

        it('lista las mesas de un restaurante ordenadas por número', async () => {
            await repo.save(buildTable({ id: 't2', number: 1, status: 'ocupada' }))
            await repo.save(buildTable({ id: 't3', number: 2, status: 'reservada' }))
            await repo.save(buildTable({ id: 't-otro', number: 1, restaurantId: 'r2' }))

            const tables = await repo.findByRestaurantId('r1')
            expect(tables.map(t => t.id)).toEqual(['t2', 't3', 't1'])
        })

        it('filtra las mesas de un restaurante por estado', async () => {
            const tables = await repo.findByRestaurantId('r1', 'ocupada')
            expect(tables.map(t => t.id)).toEqual(['t2'])
        })

        it('devuelve [] para un restaurante sin mesas', async () => {
            expect(await repo.findByRestaurantId('no-existe')).toEqual([])
        })

        it('actualiza una mesa existente', async () => {
            const later = new Date(Date.now() + 1000).toISOString()
            await repo.save(buildTable({ id: 't1', number: 30, description: null, capacity: 6, status: 'reservada', updatedAt: later }))

            const found = await repo.findById('t1')
            expect(found).toMatchObject({ number: 30, description: null, capacity: 6, status: 'reservada', updatedAt: later, createdAt: now })
        })

        it('elimina una mesa', async () => {
            await repo.delete('t1')
            expect(await repo.findById('t1')).toBeNull()
        })
    })
})
