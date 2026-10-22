import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Database } from './database.js'

describe('Database - migración de restaurant_tables', () => {
    let db: Database
    const now = new Date().toISOString()

    const insertTable = (id: string, restaurantId: string, number: number) =>
        db.run(
            'INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, restaurantId, number, null, 4, 'libre', now, now]
        )

    beforeAll(async () => {
        process.env.NODE_ENV = 'test'
        db = new Database()
        await db.initialize()
        for (const id of ['r1', 'r2']) {
            await db.run(
                'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, 'Rest', 'Calle', 'a@b.com', '600000000', 'A', 'B', now, now]
            )
        }
    })

    afterAll(async () => {
        await db.close()
    })

    it('crea la tabla restaurant_tables', async () => {
        const row = await db.get<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'restaurant_tables'"
        )
        expect(row?.name).toBe('restaurant_tables')
    })

    it('el estado por defecto es libre', async () => {
        await db.run(
            'INSERT INTO restaurant_tables (id, restaurant_id, number, capacity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            ['t-default', 'r1', 99, 2, now, now]
        )
        const row = await db.get<{ status: string }>('SELECT status FROM restaurant_tables WHERE id = ?', ['t-default'])
        expect(row?.status).toBe('libre')
    })

    it('rechaza un número de mesa duplicado en el mismo restaurante', async () => {
        await insertTable('t1', 'r1', 1)
        await expect(insertTable('t2', 'r1', 1)).rejects.toThrow(/UNIQUE/)
    })

    it('admite el mismo número de mesa en otro restaurante', async () => {
        await expect(insertTable('t3', 'r2', 1)).resolves.toBeDefined()
    })

    it('exige que el restaurante exista (clave foránea)', async () => {
        await expect(insertTable('t4', 'no-existe', 1)).rejects.toThrow(/FOREIGN KEY/)
    })
})
