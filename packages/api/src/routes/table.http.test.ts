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
