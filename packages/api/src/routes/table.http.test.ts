import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import jwt from 'jsonwebtoken'
import app from '../app.js'
import { dbConfig } from '@config/database.js'

// Pruebas de integración HTTP de mesas: app real + SQLite en memoria (NODE_ENV=test).
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-resttek-key'
const R = 'rest-1'
const now = new Date().toISOString()

const tokenFor = (role: string, id = `${role}-id`) => jwt.sign({ id, role }, JWT_SECRET)
const TOKENS = {
    admin: tokenFor('admin'),
    manager: tokenFor('manager'),
    camarero: tokenFor('camarero'),
    cocinero: tokenFor('cocinero'),
    cliente: tokenFor('cliente')
}
type Role = keyof typeof TOKENS

let server: Server
let baseUrl: string

async function request(method: string, path: string, options: { role?: Role; body?: unknown } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (options.role) headers.Authorization = `Bearer ${TOKENS[options.role]}`
    const init: RequestInit = { method, headers }
    if (options.body !== undefined) init.body = JSON.stringify(options.body)
    const res = await fetch(`${baseUrl}/api/v1${path}`, init)
    const isJson = res.headers.get('content-type')?.includes('application/json')
    return { status: res.status, body: isJson ? await res.json() : undefined }
}

beforeAll(async () => {
    await dbConfig.initialize()
    for (const id of [R, 'rest-2']) {
        await dbConfig.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, 'Rest', 'Calle', 'a@b.com', '600000000', 'A', 'B', now, now]
        )
    }
    server = app.listen(0)
    await new Promise<void>(resolve => server.once('listening', () => resolve()))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await dbConfig.close()
})

describe('Mesas - montaje de rutas', () => {
    it('POST /restaurants/:restaurantId/tables crea una mesa (admin)', async () => {
        const res = await request('POST', `/restaurants/${R}/tables`, {
            role: 'admin',
            body: { number: 1, description: 'Ventana', capacity: 2 }
        })
        expect(res.status).toBe(201)
        expect(res.body).toMatchObject({ restaurantId: R, number: 1, description: 'Ventana', capacity: 2, status: 'libre' })
    })

    it('GET /public/restaurants/:restaurantId/tables/available es público', async () => {
        const res = await request('GET', `/public/restaurants/${R}/tables/available?people=2`)
        expect(res.status).toBe(200)
        expect(res.body.map((t: { number: number }) => t.number)).toEqual([1])
    })
})

async function createTable(body: Record<string, unknown>, restaurantId = R) {
    const res = await request('POST', `/restaurants/${restaurantId}/tables`, { role: 'admin', body })
    expect(res.status).toBe(201)
    return res.body as { id: string; number: number; status: string; updatedAt: string; createdAt: string }
}

describe('Mesas - CRUD de administrador', () => {
    it('crea, consulta, modifica y elimina una mesa', async () => {
        const created = await createTable({ number: 20, description: 'Terraza', capacity: 4 })
        expect(created).toMatchObject({ number: 20, description: 'Terraza', capacity: 4, status: 'libre' })
        expect(Object.keys(created).sort()).toEqual(
            ['capacity', 'createdAt', 'description', 'id', 'number', 'restaurantId', 'status', 'updatedAt']
        )

        const got = await request('GET', `/restaurants/${R}/tables/${created.id}`, { role: 'cocinero' })
        expect(got.status).toBe(200)
        expect(got.body).toEqual(created)

        const updated = await request('PUT', `/restaurants/${R}/tables/${created.id}`, {
            role: 'admin',
            body: { number: 20, description: '  ', capacity: 6, status: 'RESERVADA' }
        })
        expect(updated.status).toBe(200)
        expect(updated.body).toMatchObject({ id: created.id, number: 20, description: null, capacity: 6, status: 'reservada' })

        const deleted = await request('DELETE', `/restaurants/${R}/tables/${created.id}`, { role: 'admin' })
        expect(deleted.status).toBe(204)
        expect(deleted.body).toBeUndefined()

        const missing = await request('GET', `/restaurants/${R}/tables/${created.id}`, { role: 'admin' })
        expect(missing.status).toBe(404)
        expect(missing.body).toEqual({ error: 'TableNotFoundError', message: 'Table not found' })
    })

    it('lista las mesas ordenadas por número y filtra por estado (camarero)', async () => {
        await createTable({ number: 31, capacity: 2, status: 'ocupada' }, 'rest-2')
        await createTable({ number: 30, capacity: 2 }, 'rest-2')

        const all = await request('GET', '/restaurants/rest-2/tables', { role: 'camarero' })
        expect(all.status).toBe(200)
        expect(all.body.map((t: { number: number }) => t.number)).toEqual([30, 31])

        const occupied = await request('GET', '/restaurants/rest-2/tables?status=Ocupada', { role: 'manager' })
        expect(occupied.body.map((t: { number: number }) => t.number)).toEqual([31])

        const invalid = await request('GET', '/restaurants/rest-2/tables?status=rota', { role: 'manager' })
        expect(invalid.status).toBe(400)
        expect(invalid.body.error).toBe('InvalidTableStatusError')

        const none = await request('GET', '/restaurants/no-existe/tables', { role: 'admin' })
        expect(none.status).toBe(200)
        expect(none.body).toEqual([])
    })

    it('responde 409 DuplicatedTableNumberError con un número repetido', async () => {
        await createTable({ number: 40, capacity: 4 })
        const res = await request('POST', `/restaurants/${R}/tables`, { role: 'admin', body: { number: 40, capacity: 4 } })
        expect(res.status).toBe(409)
        expect(res.body).toEqual({ error: 'DuplicatedTableNumberError', message: 'Table number 40 already exists in this restaurant' })
    })

    it('responde 409 al modificar el número al de otra mesa', async () => {
        await createTable({ number: 41, capacity: 4 })
        const other = await createTable({ number: 42, capacity: 4 })
        const res = await request('PUT', `/restaurants/${R}/tables/${other.id}`, {
            role: 'admin',
            body: { number: 41, capacity: 4, status: 'libre' }
        })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('DuplicatedTableNumberError')
    })

    it('responde 400 con datos inválidos', async () => {
        const cases: [Record<string, unknown>, string][] = [
            [{ number: 0, capacity: 4 }, 'TableNumberInvalidError'],
            [{ number: 50, capacity: 0 }, 'InvalidCapacityError'],
            [{ number: 50, capacity: 4, description: 'a'.repeat(256) }, 'TableDescriptionTooLongError'],
            [{ number: 50, capacity: 4, status: 'rota' }, 'InvalidTableStatusError']
        ]
        for (const [body, error] of cases) {
            const res = await request('POST', `/restaurants/${R}/tables`, { role: 'admin', body })
            expect(res.status).toBe(400)
            expect(res.body.error).toBe(error)
            expect(typeof res.body.message).toBe('string')
        }
    })

    it('responde 404 RestaurantNotFoundError al crear en un restaurante inexistente', async () => {
        const res = await request('POST', '/restaurants/no-existe/tables', { role: 'admin', body: { number: 1, capacity: 4 } })
        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: 'RestaurantNotFoundError', message: 'Restaurant not found' })
    })

    it('responde 404 si la mesa es de otro restaurante', async () => {
        const table = await createTable({ number: 60, capacity: 4 })
        const res = await request('GET', `/restaurants/rest-2/tables/${table.id}`, { role: 'admin' })
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('TableNotFoundError')
    })

    it('responde 409 TableHasOrdersError al borrar una mesa con pedidos', async () => {
        const table = await createTable({ number: 61, capacity: 4 })
        await dbConfig.run(
            'INSERT INTO orders (id, restaurant_id, table_id, client_id, created_at) VALUES (?, ?, ?, ?, ?)',
            ['order-61', R, table.id, null, now]
        )
        const res = await request('DELETE', `/restaurants/${R}/tables/${table.id}`, { role: 'admin' })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('TableHasOrdersError')
    })
})

describe('Mesas - autenticación y roles', () => {
    it('responde 401 sin token', async () => {
        const res = await request('POST', `/restaurants/${R}/tables`, { body: { number: 70, capacity: 4 } })
        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: 'Unauthorized: No token provided' })
    })

    it('responde 403 si un camarero intenta crear, modificar o borrar', async () => {
        const table = await createTable({ number: 71, capacity: 4 })
        const create = await request('POST', `/restaurants/${R}/tables`, { role: 'camarero', body: { number: 72, capacity: 4 } })
        const update = await request('PUT', `/restaurants/${R}/tables/${table.id}`, { role: 'camarero', body: { number: 71, capacity: 4, status: 'libre' } })
        const remove = await request('DELETE', `/restaurants/${R}/tables/${table.id}`, { role: 'camarero' })
        for (const res of [create, update, remove]) {
            expect(res.status).toBe(403)
            expect(res.body).toEqual({ error: 'Forbidden: Insufficient permissions' })
        }
    })

    it('responde 403 si un cliente lista mesas, un cocinero cambia el estado o un camarero ocupa', async () => {
        const table = await createTable({ number: 73, capacity: 4 })
        expect((await request('GET', `/restaurants/${R}/tables`, { role: 'cliente' })).status).toBe(403)
        expect((await request('PATCH', `/restaurants/${R}/tables/${table.id}/status`, { role: 'cocinero', body: { status: 'libre' } })).status).toBe(403)
        expect((await request('POST', `/restaurants/${R}/tables/${table.id}/occupy`, { role: 'camarero', body: { people: 2 } })).status).toBe(403)
    })
})

describe('Mesas - cliente: disponibles y ocupación', () => {
    const RC = 'rest-3'

    beforeAll(async () => {
        await dbConfig.run(
            'INSERT INTO restaurants (id, name, address, email, phone, owner_first_name, owner_last_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [RC, 'Rest', 'Calle', 'a@b.com', '600000000', 'A', 'B', now, now]
        )
        await createTable({ number: 4, capacity: 6 }, RC)
        await createTable({ number: 7, capacity: 4 }, RC)
        await createTable({ number: 5, capacity: 4 }, RC)
        await createTable({ number: 1, capacity: 2 }, RC)
        await createTable({ number: 2, capacity: 8, status: 'ocupada' }, RC)
        await createTable({ number: 3, capacity: 8, status: 'reservada' }, RC)
    })

    it('GET available devuelve solo libres con capacidad suficiente, por capacidad y número', async () => {
        const res = await request('GET', `/public/restaurants/${RC}/tables/available?people=3`)
        expect(res.status).toBe(200)
        expect(res.body.map((t: { number: number }) => t.number)).toEqual([5, 7, 4])
    })

    it('GET available devuelve [] para un restaurante inexistente', async () => {
        const res = await request('GET', '/public/restaurants/no-existe/tables/available?people=2')
        expect(res.status).toBe(200)
        expect(res.body).toEqual([])
    })

    it.each(['?people=0', '', '?people=-1', '?people=1.5', '?people=abc', '?people='])(
        'GET available%s responde 400 InvalidPeopleError',
        async (query) => {
            const res = await request('GET', `/public/restaurants/${RC}/tables/available${query}`)
            expect(res.status).toBe(400)
            expect(res.body.error).toBe('InvalidPeopleError')
        }
    )

    it('ocupa una mesa libre y la segunda vez responde 409 TableNotAvailableError', async () => {
        const table = await createTable({ number: 10, capacity: 4 }, RC)

        const first = await request('POST', `/restaurants/${RC}/tables/${table.id}/occupy`, { role: 'cliente', body: { people: 3 } })
        expect(first.status).toBe(200)
        expect(first.body).toMatchObject({ id: table.id, status: 'ocupada' })

        const second = await request('POST', `/restaurants/${RC}/tables/${table.id}/occupy`, { role: 'cliente', body: { people: 3 } })
        expect(second.status).toBe(409)
        expect(second.body).toEqual({ error: 'TableNotAvailableError', message: 'Table is not available' })
    })

    it('responde 409 TableCapacityExceededError si no caben', async () => {
        const table = await createTable({ number: 11, capacity: 4 }, RC)
        const res = await request('POST', `/restaurants/${RC}/tables/${table.id}/occupy`, { role: 'cliente', body: { people: 99 } })
        expect(res.status).toBe(409)
        expect(res.body.error).toBe('TableCapacityExceededError')
    })

    it('responde 400 InvalidPeopleError sin people y 404 si la mesa no existe', async () => {
        const table = await createTable({ number: 12, capacity: 4 }, RC)
        const noPeople = await request('POST', `/restaurants/${RC}/tables/${table.id}/occupy`, { role: 'cliente', body: {} })
        expect(noPeople.status).toBe(400)
        expect(noPeople.body.error).toBe('InvalidPeopleError')

        const missing = await request('POST', `/restaurants/${RC}/tables/no-existe/occupy`, { role: 'cliente', body: { people: 2 } })
        expect(missing.status).toBe(404)
        expect(missing.body.error).toBe('TableNotFoundError')
    })

    it('solo uno de dos clientes simultáneos ocupa la misma mesa', async () => {
        const table = await createTable({ number: 13, capacity: 4 }, RC)
        const results = await Promise.all([1, 2].map(() =>
            request('POST', `/restaurants/${RC}/tables/${table.id}/occupy`, { role: 'cliente', body: { people: 2 } })
        ))
        expect(results.map(r => r.status).sort()).toEqual([200, 409])
    })
})

describe('Mesas - cambio de estado', () => {
    it('un camarero libera una mesa ocupada (200) y se actualiza updatedAt', async () => {
        const table = await createTable({ number: 80, capacity: 4, status: 'ocupada' })
        await new Promise(resolve => setTimeout(resolve, 2))
        const res = await request('PATCH', `/restaurants/${R}/tables/${table.id}/status`, { role: 'camarero', body: { status: 'libre' } })
        expect(res.status).toBe(200)
        expect(res.body).toMatchObject({ id: table.id, status: 'libre', createdAt: table.createdAt })
        expect(res.body.updatedAt).not.toBe(table.updatedAt)
    })

    it('responde 400 InvalidTableStatusError con un estado inválido o ausente', async () => {
        const table = await createTable({ number: 81, capacity: 4 })
        for (const body of [{ status: 'rota' }, {}]) {
            const res = await request('PATCH', `/restaurants/${R}/tables/${table.id}/status`, { role: 'manager', body })
            expect(res.status).toBe(400)
            expect(res.body.error).toBe('InvalidTableStatusError')
        }
    })

    it('responde 404 si la mesa no existe', async () => {
        const res = await request('PATCH', `/restaurants/${R}/tables/no-existe/status`, { role: 'admin', body: { status: 'rota' } })
        expect(res.status).toBe(404)
        expect(res.body.error).toBe('TableNotFoundError')
    })
})
