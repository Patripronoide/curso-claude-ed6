import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SqliteOrderRepository } from './order.repository.js'
import { Database } from '@config/database.js'
import type { Order } from '@models/order.model.js'

describe('SqliteOrderRepository - tableNumber (Integration)', () => {
    let db: Database
    let repo: SqliteOrderRepository
    const now = new Date().toISOString()

    const buildOrder = (id: string, tableId: string | null, restaurantId = 'r1'): Order => ({
        id,
        restaurantId,
        tableId,
        tableNumber: null,
        clientId: 'client-1',
        createdAt: new Date(),
        items: [{ id: `${id}-item`, dishId: 'd1', quantity: 1, notes: null, status: 'pendiente' }]
    })

    beforeAll(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        repo = new SqliteOrderRepository(db)

        for (const id of ['r1', 'r2']) {
            await db.run(
                'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, 'Rest', 'Calle', 'a@b.com', '600000000', 'A', 'B', now, now]
            )
        }
        await db.run(
            'INSERT INTO dishes (id, name, description, price, category, available, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ['d1', 'Pizza', null, 10, 'principal', 1, 'r1', now, now]
        )
        await db.run(
            'INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['t1', 'r1', 12, null, 4, 'ocupada', now, now]
        )
        await db.run(
            'INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['t-r2', 'r2', 99, null, 4, 'ocupada', now, now]
        )

        await repo.create(buildOrder('o-mesa', 't1'))
        await repo.create(buildOrder('o-sin-mesa', null))
        await repo.create(buildOrder('o-legacy', '5'))
        await repo.create(buildOrder('o-mesa-ajena', 't-r2'))
    })

    afterAll(async () => {
        await db.close()
    })

    it('findById devuelve el número de la mesa o null', async () => {
        expect((await repo.findById('o-mesa'))?.tableNumber).toBe(12)
        expect((await repo.findById('o-sin-mesa'))?.tableNumber).toBeNull()
        expect((await repo.findById('o-legacy'))?.tableNumber).toBeNull()
    })

    it('solo resuelve el número si la mesa es del mismo restaurante del pedido', async () => {
        expect((await repo.findById('o-mesa-ajena'))?.tableNumber).toBeNull()
    })

    it('findByClientId incluye tableNumber', async () => {
        const orders = await repo.findByClientId('client-1')
        const byId = Object.fromEntries(orders.map(o => [o.id, o.tableNumber]))
        expect(byId).toEqual({ 'o-mesa': 12, 'o-sin-mesa': null, 'o-legacy': null, 'o-mesa-ajena': null })
    })

    it('findActiveByRestaurant incluye tableNumber', async () => {
        const orders = await repo.findActiveByRestaurant('r1')
        const byId = Object.fromEntries(orders.map(o => [o.id, o.tableNumber]))
        expect(byId).toEqual({ 'o-mesa': 12, 'o-sin-mesa': null, 'o-legacy': null, 'o-mesa-ajena': null })
    })
})
