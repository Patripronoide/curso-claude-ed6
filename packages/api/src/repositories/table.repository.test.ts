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

    describe('findAvailable', () => {
        beforeAll(async () => {
            await repo.save(buildTable({ id: 'a1', number: 101, capacity: 6 }))
            await repo.save(buildTable({ id: 'a2', number: 102, capacity: 4 }))
            await repo.save(buildTable({ id: 'a3', number: 100, capacity: 4 }))
            await repo.save(buildTable({ id: 'a4', number: 103, capacity: 2 }))
            await repo.save(buildTable({ id: 'a5', number: 104, capacity: 8, status: 'ocupada' }))
            await repo.save(buildTable({ id: 'a6', number: 105, capacity: 8, status: 'reservada' }))
            await repo.save(buildTable({ id: 'a7', number: 101, capacity: 8, restaurantId: 'r2' }))
        })

        it('devuelve solo mesas libres del restaurante con capacidad suficiente, por capacidad y número', async () => {
            const tables = await repo.findAvailable('r1', 3)
            expect(tables.map(t => t.id)).toEqual(['a3', 'a2', 'a1'])
        })

        it('incluye mesas con capacidad igual al número de personas', async () => {
            const tables = await repo.findAvailable('r1', 6)
            expect(tables.map(t => t.id)).toEqual(['a1'])
        })

        it('devuelve [] si no hay mesas para tantas personas', async () => {
            expect(await repo.findAvailable('r1', 50)).toEqual([])
        })
    })

    describe('occupyIfFree', () => {
        beforeAll(async () => {
            await repo.save(buildTable({ id: 'o1', number: 200 }))
            await repo.save(buildTable({ id: 'o2', number: 201, status: 'reservada' }))
        })

        it('ocupa una mesa libre y actualiza updatedAt', async () => {
            expect(await repo.occupyIfFree('o1', 'r1')).toBe(true)
            const found = await repo.findById('o1')
            expect(found?.status).toBe('ocupada')
            expect(found?.updatedAt).not.toBe(now)
        })

        it('devuelve false la segunda vez (ya ocupada)', async () => {
            expect(await repo.occupyIfFree('o1', 'r1')).toBe(false)
        })

        it('devuelve false con una mesa reservada', async () => {
            expect(await repo.occupyIfFree('o2', 'r1')).toBe(false)
            expect((await repo.findById('o2'))?.status).toBe('reservada')
        })

        it('devuelve false si la mesa es de otro restaurante', async () => {
            await repo.save(buildTable({ id: 'o3', number: 202 }))
            expect(await repo.occupyIfFree('o3', 'r2')).toBe(false)
            expect((await repo.findById('o3'))?.status).toBe('libre')
        })
    })

    describe('hasOrders', () => {
        beforeAll(async () => {
            await repo.save(buildTable({ id: 'h1', number: 300 }))
            await repo.save(buildTable({ id: 'h2', number: 301 }))
            await db.run(
                'INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at) VALUES (?, ?, ?, ?, ?)',
                ['order-h1', 'r1', 'h1', null, now]
            )
        })

        it('devuelve true si la mesa tiene pedidos', async () => {
            expect(await repo.hasOrders('h1')).toBe(true)
        })

        it('devuelve false si la mesa no tiene pedidos', async () => {
            expect(await repo.hasOrders('h2')).toBe(false)
        })
    })
})
