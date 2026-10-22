import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { errorHandler } from './errorHandler.js'
import {
    TableNotFoundError,
    DuplicatedTableNumberError,
    TableNotAvailableError,
    TableCapacityExceededError,
    TableHasOrdersError,
    InvalidTableStatusError,
    TableDescriptionTooLongError
} from '@errors/DomainErrors.js'

function run(err: unknown) {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
    }
    errorHandler(err, {} as Request, res as unknown as Response, (() => {}) as NextFunction)
    return {
        status: res.status.mock.calls[0]?.[0],
        body: res.json.mock.calls[0]?.[0]
    }
}

describe('errorHandler', () => {
    it('responde 404 con TableNotFoundError', () => {
        const { status, body } = run(new TableNotFoundError())
        expect(status).toBe(404)
        expect(body).toEqual({ error: 'TableNotFoundError', message: 'Table not found' })
    })

    it('responde 409 con los errores de conflicto de mesas', () => {
        const conflicts = [
            new DuplicatedTableNumberError(20),
            new TableNotAvailableError(),
            new TableCapacityExceededError(4, 6),
            new TableHasOrdersError()
        ]
        for (const err of conflicts) {
            const { status, body } = run(err)
            expect(status).toBe(409)
            expect(body.error).toBe(err.name)
        }
    })

    it('responde 400 con el resto de errores de dominio', () => {
        expect(run(new InvalidTableStatusError()).status).toBe(400)
        expect(run(new TableDescriptionTooLongError()).status).toBe(400)
    })

    it('responde 500 con errores no tipados', () => {
        const { status, body } = run(new Error('boom'))
        expect(status).toBe(500)
        expect(body).toEqual({ error: 'InternalServerError', message: 'Something went wrong' })
    })
})
