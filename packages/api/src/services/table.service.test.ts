import { describe, it, expect, beforeEach } from 'vitest'
import { TableService } from './table.service.js'
import { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import { MockRestaurantRepository } from '@repositories/mocks/MockRestaurantRepository.js'
import {
    TableNumberInvalidError,
    InvalidCapacityError,
    TableDescriptionTooLongError,
    InvalidTableStatusError,
    RestaurantNotFoundError,
    DuplicatedTableNumberError,
    TableNotFoundError,
    TableHasOrdersError,
    InvalidPeopleError,
    TableNotAvailableError,
    TableCapacityExceededError
} from '@errors/DomainErrors.js'

const now = new Date().toISOString()

describe('TableService', () => {
    let repo: MockTableRepository
    let restaurantRepo: MockRestaurantRepository
    let service: TableService

    const validInput = { number: 20, description: 'Terraza', capacity: 4 }

    beforeEach(async () => {
        repo = new MockTableRepository()
        restaurantRepo = new MockRestaurantRepository()
        for (const id of ['r1', 'r2']) {
            await restaurantRepo.save({
                id,
                name: 'Rest',
                address: 'Calle',
                email: 'a@b.com',
                phone: '600000000',
                ownerFirstName: 'A',
                ownerLastName: 'B',
                logoUrl: null,
                createdAt: now,
                updatedAt: now
            })
        }
        service = new TableService(repo, restaurantRepo)
    })

    describe('create', () => {
        it('crea una mesa libre por defecto y la guarda', async () => {
            const table = await service.create('r1', validInput)

            expect(table).toMatchObject({ restaurantId: 'r1', number: 20, description: 'Terraza', capacity: 4, status: 'libre' })
            expect(table.id).toBeDefined()
            expect(table.createdAt).toBe(table.updatedAt)
            expect(await repo.findById(table.id)).toEqual(table)
        })

        it('respeta el estado indicado y lo normaliza', async () => {
            const table = await service.create('r1', { ...validInput, status: ' RESERVADA ' })
            expect(table.status).toBe('reservada')
        })

        it('guarda como null una descripción ausente, vacía o solo con espacios y recorta la descripción', async () => {
            expect((await service.create('r1', { number: 1, capacity: 2 })).description).toBeNull()
            expect((await service.create('r1', { number: 2, capacity: 2, description: '   ' })).description).toBeNull()
            expect((await service.create('r1', { number: 3, capacity: 2, description: null })).description).toBeNull()
            expect((await service.create('r1', { number: 4, capacity: 2, description: '  Ventana ' })).description).toBe('Ventana')
        })

        it.each([0, -1, 10000, 2.5, '5', undefined, null])('lanza TableNumberInvalidError con number = %s', async (number) => {
            await expect(service.create('r1', { ...validInput, number: number as any }))
                .rejects.toThrow(TableNumberInvalidError)
        })

        it('acepta los límites de number (1 y 9999)', async () => {
            await expect(service.create('r1', { ...validInput, number: 1 })).resolves.toBeDefined()
            await expect(service.create('r1', { ...validInput, number: 9999 })).resolves.toBeDefined()
        })

        it.each([0, -3, 1001, 1.5, '4', undefined, null])('lanza InvalidCapacityError con capacity = %s', async (capacity) => {
            await expect(service.create('r1', { ...validInput, capacity: capacity as any }))
                .rejects.toThrow(InvalidCapacityError)
        })

        it('acepta los límites de capacity (1 y 1000)', async () => {
            await expect(service.create('r1', { ...validInput, number: 1, capacity: 1 })).resolves.toBeDefined()
            await expect(service.create('r1', { ...validInput, number: 2, capacity: 1000 })).resolves.toBeDefined()
        })

        it('lanza TableDescriptionTooLongError si la descripción supera 255 caracteres tras trim', async () => {
            await expect(service.create('r1', { ...validInput, description: 'a'.repeat(256) }))
                .rejects.toThrow(TableDescriptionTooLongError)
            const table = await service.create('r1', { ...validInput, description: `  ${'a'.repeat(255)}  ` })
            expect(table.description).toHaveLength(255)
        })

        it('lanza InvalidTableStatusError con un estado inválido', async () => {
            await expect(service.create('r1', { ...validInput, status: 'rota' }))
                .rejects.toThrow(InvalidTableStatusError)
        })

        it('lanza RestaurantNotFoundError si el restaurante no existe', async () => {
            await expect(service.create('no-existe', validInput)).rejects.toThrow(RestaurantNotFoundError)
        })

        it('lanza DuplicatedTableNumberError si el número ya existe en el restaurante', async () => {
            await service.create('r1', validInput)
            await expect(service.create('r1', validInput)).rejects.toThrow(DuplicatedTableNumberError)
            await expect(service.create('r1', validInput)).rejects.toThrow('Table number 20 already exists in this restaurant')
        })

        it('permite el mismo número en otro restaurante', async () => {
            await service.create('r1', validInput)
            await expect(service.create('r2', validInput)).resolves.toBeDefined()
        })

        it('valida en el orden del contrato: number, capacity, description, status, restaurante, duplicado', async () => {
            await expect(service.create('no-existe', { number: 0, capacity: 0, description: 'a'.repeat(300), status: 'rota' }))
                .rejects.toThrow(TableNumberInvalidError)
            await expect(service.create('no-existe', { number: 1, capacity: 0, description: 'a'.repeat(300), status: 'rota' }))
                .rejects.toThrow(InvalidCapacityError)
            await expect(service.create('no-existe', { number: 1, capacity: 1, description: 'a'.repeat(300), status: 'rota' }))
                .rejects.toThrow(TableDescriptionTooLongError)
            await expect(service.create('no-existe', { number: 1, capacity: 1, status: 'rota' }))
                .rejects.toThrow(InvalidTableStatusError)
            await expect(service.create('no-existe', { number: 1, capacity: 1 }))
                .rejects.toThrow(RestaurantNotFoundError)
        })
    })

    describe('update', () => {
        it('reemplaza los campos y conserva id, restaurante y createdAt', async () => {
            const created = await service.create('r1', validInput)

            const updated = await service.update('r1', created.id, { number: 21, description: null, capacity: 6, status: 'ocupada' })

            expect(updated).toMatchObject({
                id: created.id,
                restaurantId: 'r1',
                number: 21,
                description: null,
                capacity: 6,
                status: 'ocupada',
                createdAt: created.createdAt
            })
            expect(await repo.findById(created.id)).toEqual(updated)
        })

        it('permite mantener su propio número', async () => {
            const created = await service.create('r1', validInput)
            await expect(service.update('r1', created.id, { ...validInput, status: 'libre' })).resolves.toBeDefined()
        })

        it('lanza DuplicatedTableNumberError si otra mesa del restaurante tiene ese número', async () => {
            await service.create('r1', { ...validInput, number: 1 })
            const other = await service.create('r1', { ...validInput, number: 2 })
            await expect(service.update('r1', other.id, { ...validInput, number: 1, status: 'libre' }))
                .rejects.toThrow(DuplicatedTableNumberError)
        })

        it('lanza TableNotFoundError si la mesa no existe o es de otro restaurante (antes que las validaciones)', async () => {
            const created = await service.create('r1', validInput)
            await expect(service.update('r1', 'no-existe', { number: 0, capacity: 0, status: 'rota' }))
                .rejects.toThrow(TableNotFoundError)
            await expect(service.update('r2', created.id, { ...validInput, status: 'libre' }))
                .rejects.toThrow(TableNotFoundError)
        })

        it('exige un estado válido', async () => {
            const created = await service.create('r1', validInput)
            await expect(service.update('r1', created.id, { number: 20, capacity: 4 }))
                .rejects.toThrow(InvalidTableStatusError)
            await expect(service.update('r1', created.id, { number: 20, capacity: 4, status: 'rota' }))
                .rejects.toThrow(InvalidTableStatusError)
        })

        it('aplica las validaciones de number, capacity y description', async () => {
            const created = await service.create('r1', validInput)
            await expect(service.update('r1', created.id, { number: 0, capacity: 4, status: 'libre' }))
                .rejects.toThrow(TableNumberInvalidError)
            await expect(service.update('r1', created.id, { number: 1, capacity: 1001, status: 'libre' }))
                .rejects.toThrow(InvalidCapacityError)
            await expect(service.update('r1', created.id, { number: 1, capacity: 4, description: 'a'.repeat(256), status: 'libre' }))
                .rejects.toThrow(TableDescriptionTooLongError)
        })
    })

    describe('findById', () => {
        it('devuelve la mesa del restaurante', async () => {
            const created = await service.create('r1', validInput)
            expect(await service.findById('r1', created.id)).toEqual(created)
        })

        it('lanza TableNotFoundError si no existe o es de otro restaurante', async () => {
            const created = await service.create('r1', validInput)
            await expect(service.findById('r1', 'no-existe')).rejects.toThrow(TableNotFoundError)
            await expect(service.findById('r2', created.id)).rejects.toThrow(TableNotFoundError)
        })
    })

    describe('findByRestaurantId', () => {
        it('lista las mesas ordenadas por número', async () => {
            await service.create('r1', { ...validInput, number: 3 })
            await service.create('r1', { ...validInput, number: 1 })
            await service.create('r2', { ...validInput, number: 2 })

            const tables = await service.findByRestaurantId('r1')
            expect(tables.map(t => t.number)).toEqual([1, 3])
        })

        it('filtra por estado normalizado', async () => {
            await service.create('r1', { ...validInput, number: 1, status: 'ocupada' })
            await service.create('r1', { ...validInput, number: 2 })

            const tables = await service.findByRestaurantId('r1', 'OCUPADA')
            expect(tables.map(t => t.number)).toEqual([1])
        })

        it('lanza InvalidTableStatusError con un filtro inválido', async () => {
            await expect(service.findByRestaurantId('r1', 'rota')).rejects.toThrow(InvalidTableStatusError)
        })

        it('devuelve [] para un restaurante inexistente', async () => {
            expect(await service.findByRestaurantId('no-existe')).toEqual([])
        })
    })

    describe('delete', () => {
        it('elimina una mesa sin pedidos', async () => {
            const created = await service.create('r1', validInput)
            await service.delete('r1', created.id)
            expect(await repo.findById(created.id)).toBeNull()
        })

        it('lanza TableNotFoundError si no existe o es de otro restaurante', async () => {
            const created = await service.create('r1', validInput)
            await expect(service.delete('r1', 'no-existe')).rejects.toThrow(TableNotFoundError)
            await expect(service.delete('r2', created.id)).rejects.toThrow(TableNotFoundError)
            expect(await repo.findById(created.id)).not.toBeNull()
        })

        it('lanza TableHasOrdersError si la mesa tiene pedidos y no la borra', async () => {
            const created = await service.create('r1', validInput)
            repo.tablesWithOrders.add(created.id)
            await expect(service.delete('r1', created.id)).rejects.toThrow(TableHasOrdersError)
            expect(await repo.findById(created.id)).not.toBeNull()
        })
    })

    describe('changeStatus', () => {
        it('cambia el estado normalizado y actualiza updatedAt', async () => {
            const created = await service.create('r1', { ...validInput, status: 'ocupada' })
            await new Promise(resolve => setTimeout(resolve, 2))

            const updated = await service.changeStatus('r1', created.id, ' Libre ')

            expect(updated.status).toBe('libre')
            expect(updated.updatedAt).not.toBe(created.updatedAt)
            expect(updated.createdAt).toBe(created.createdAt)
            expect((await repo.findById(created.id))?.status).toBe('libre')
        })

        it('es idempotente al poner el mismo estado', async () => {
            const created = await service.create('r1', validInput)
            const updated = await service.changeStatus('r1', created.id, 'libre')
            expect(updated.status).toBe('libre')
        })

        it('lanza TableNotFoundError antes de validar el estado', async () => {
            await expect(service.changeStatus('r1', 'no-existe', 'rota')).rejects.toThrow(TableNotFoundError)
        })

        it('lanza InvalidTableStatusError con un estado inválido o ausente', async () => {
            const created = await service.create('r1', validInput)
            await expect(service.changeStatus('r1', created.id, 'rota')).rejects.toThrow(InvalidTableStatusError)
            await expect(service.changeStatus('r1', created.id, undefined as unknown as string))
                .rejects.toThrow(InvalidTableStatusError)
        })
    })

    describe('listAvailable', () => {
        it('devuelve las mesas libres con capacidad suficiente ordenadas por capacidad y número', async () => {
            await service.create('r1', { number: 4, capacity: 6 })
            await service.create('r1', { number: 7, capacity: 4 })
            await service.create('r1', { number: 5, capacity: 4 })
            await service.create('r1', { number: 1, capacity: 2 })
            await service.create('r1', { number: 2, capacity: 8, status: 'ocupada' })
            await service.create('r1', { number: 3, capacity: 8, status: 'reservada' })

            const tables = await service.listAvailable('r1', 3)
            expect(tables.map(t => t.number)).toEqual([5, 7, 4])
        })

        it('devuelve [] con un restaurante inexistente', async () => {
            expect(await service.listAvailable('no-existe', 2)).toEqual([])
        })

        it.each([0, -1, 1.5, NaN, '3', undefined, null])('lanza InvalidPeopleError con people = %s', async (people) => {
            await expect(service.listAvailable('r1', people as any)).rejects.toThrow(InvalidPeopleError)
        })
    })

    describe('occupy', () => {
        it('ocupa una mesa libre y la devuelve ocupada', async () => {
            const created = await service.create('r1', validInput)

            const occupied = await service.occupy('r1', created.id, 4)

            expect(occupied).toMatchObject({ id: created.id, status: 'ocupada' })
            expect((await repo.findById(created.id))?.status).toBe('ocupada')
        })

        it('lanza TableNotAvailableError si la mesa ya está ocupada o reservada', async () => {
            const created = await service.create('r1', validInput)
            await service.occupy('r1', created.id, 2)
            await expect(service.occupy('r1', created.id, 2)).rejects.toThrow(TableNotAvailableError)

            const reserved = await service.create('r1', { ...validInput, number: 21, status: 'reservada' })
            await expect(service.occupy('r1', reserved.id, 2)).rejects.toThrow(TableNotAvailableError)
        })

        it('lanza TableCapacityExceededError si no caben y no ocupa la mesa', async () => {
            const created = await service.create('r1', validInput)
            await expect(service.occupy('r1', created.id, 5)).rejects.toThrow(TableCapacityExceededError)
            await expect(service.occupy('r1', created.id, 5))
                .rejects.toThrow('Table capacity (4) is lower than the number of people (5)')
            expect((await repo.findById(created.id))?.status).toBe('libre')
        })

        it('da prioridad a TableCapacityExceededError sobre TableNotAvailableError', async () => {
            const created = await service.create('r1', { ...validInput, status: 'ocupada' })
            await expect(service.occupy('r1', created.id, 99)).rejects.toThrow(TableCapacityExceededError)
        })

        it('lanza TableNotFoundError si no existe o es de otro restaurante', async () => {
            const created = await service.create('r1', validInput)
            await expect(service.occupy('r1', 'no-existe', 2)).rejects.toThrow(TableNotFoundError)
            await expect(service.occupy('r2', created.id, 2)).rejects.toThrow(TableNotFoundError)
        })

        it('valida people antes que la existencia de la mesa', async () => {
            await expect(service.occupy('r1', 'no-existe', 0)).rejects.toThrow(InvalidPeopleError)
        })
    })
})
