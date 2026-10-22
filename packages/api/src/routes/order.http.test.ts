import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import jwt from 'jsonwebtoken'
import app from '../app.js'
import { dbConfig } from '@config/database.js'

// Pruebas de integración HTTP de POST /orders relacionadas con las mesas.
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-resttek-key'
const R = 'rest-1'
const now = new Date().toISOString()
const clientToken = jwt.sign({ id: 'client-1', role: 'cliente' }, JWT_SECRET)

let server: Server
let baseUrl: string

async function postOrder(body: unknown) {
    const res = await fetch(`${baseUrl}/api/v1/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken}` },
        body: JSON.stringify(body)
    })
    return { status: res.status, body: await res.json() }
}

async function insertTable(id: string, number: number, status: string) {
    await dbConfig.run(
        'INSERT INTO restaurant_tables (id, restaurant_id, number, description, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, R, number, null, 4, status, now, now]
    )
}

beforeAll(async () => {
    await dbConfig.initialize()
    await dbConfig.run(
        'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [R, 'Rest', 'Calle', 'a@b.com', '600000000', 'A', 'B', now, now]
    )
    await dbConfig.run(
        'INSERT INTO dishes (id, name, description, price, category, available, restaurant_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['dish-1', 'Pizza', null, 10, 'principal', 1, R, now, now]
    )
    await insertTable('t-ocupada', 1, 'ocupada')
    await insertTable('t-libre', 2, 'libre')
    server = app.listen(0)
    await new Promise<void>(resolve => server.once('listening', () => resolve()))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await dbConfig.close()
})

const items = [{ dishId: 'dish-1', quantity: 2, notes: null }]

describe('POST /orders - mesas y formato de errores', () => {
    it('crea un pedido con una mesa ocupada (201)', async () => {
        const res = await postOrder({ restaurantId: R, tableId: 't-ocupada', items })
        expect(res.status).toBe(201)
        expect(res.body).toMatchObject({ restaurantId: R, tableId: 't-ocupada', clientId: 'client-1' })
        expect(res.body.items).toHaveLength(2)
    })

    it('crea un pedido sin mesa (201)', async () => {
        const res = await postOrder({ restaurantId: R, tableId: null, items })
        expect(res.status).toBe(201)
        expect(res.body.tableId).toBeNull()
    })

    it('responde 400 TableNotOccupiedError con una mesa libre', async () => {
        const res = await postOrder({ restaurantId: R, tableId: 't-libre', items })
        expect(res.status).toBe(400)
        expect(res.body).toEqual({ error: 'TableNotOccupiedError', message: 'Table is not occupied' })
    })

    it('responde 400 TableNotFoundError con una mesa inexistente', async () => {
        const res = await postOrder({ restaurantId: R, tableId: 'no-existe', items })
        expect(res.status).toBe(400)
        expect(res.body).toEqual({ error: 'TableNotFoundError', message: 'Table not found' })
    })

    it('responde 400 RestaurantIdRequiredError sin restaurantId', async () => {
        const res = await postOrder({ tableId: null, items })
        expect(res.status).toBe(400)
        expect(res.body).toEqual({ error: 'RestaurantIdRequiredError', message: 'Restaurant ID is required' })
    })

    it('responde 500 InternalServerError con excepciones no tipadas (items ausente)', async () => {
        const res = await postOrder({ restaurantId: R, tableId: null })
        expect(res.status).toBe(500)
        expect(res.body).toEqual({ error: 'InternalServerError', message: 'Something went wrong' })
    })
})
