import { describe, it, expect, beforeEach } from 'vitest'
import { OrderService } from './order.service.js'
import { MockOrderRepository } from '@repositories/mocks/MockOrderRepository.js'
import { MockTableRepository } from '@repositories/mocks/MockTableRepository.js'
import type { Order } from '@models/order.model.js'
import type { Table } from '@models/table.model.js'
import {
    OrderNotFoundError,
    InvalidOrderStatusError,
    TableNotFoundError,
    TableNotOccupiedError,
    RestaurantIdRequiredError
} from '@errors/DomainErrors.js'

describe('OrderService.updateItemStatus', () => {
    let repo: MockOrderRepository
    let service: OrderService
    let testOrder: Order

    beforeEach(async () => {
        repo = new MockOrderRepository()
        service = new OrderService(repo, new MockTableRepository())

        testOrder = {
            id: 'order-1',
            restaurantId: 'rest-1',
            tableId: null,
            clientId: null,
            createdAt: new Date(),
            items: [
                { id: 'item-1', dishId: 'dish-1', quantity: 1, notes: null, status: 'pendiente' }
            ]
        }
        await repo.create(testOrder)
    })

    it('should update the status of an item successfully', async () => {
        await service.updateItemStatus('order-1', 'item-1', 'preparando')
        const updatedItem = testOrder.items[0]!
        expect(updatedItem.status).toBe('preparando')
    })

    it('should throw an error if the order does not exist', async () => {
        await expect(service.updateItemStatus('order-bad', 'item-1', 'preparando'))
            .rejects.toThrow(OrderNotFoundError)
    })

    it('should throw an error if the item does not exist inside the order', async () => {
        await expect(service.updateItemStatus('order-1', 'item-bad', 'preparando'))
            .rejects.toThrow(OrderNotFoundError)
    })

    it('should throw DomainError if status is invalid', async () => {
        await expect(service.updateItemStatus('order-1', 'item-1', 'invalid-status'))
            .rejects.toThrow(InvalidOrderStatusError)
    })
})

describe('OrderService.create - validación de la mesa', () => {
    let repo: MockOrderRepository
    let tableRepo: MockTableRepository
    let service: OrderService
    const now = new Date().toISOString()

    const table = (id: string, overrides: Partial<Table> = {}): Table => ({
        id,
        restaurantId: 'rest-1',
        number: 5,
        description: null,
        capacity: 4,
        status: 'ocupada',
        createdAt: now,
        updatedAt: now,
        ...overrides
    })

    const request = (tableId: string | null, restaurantId = 'rest-1') => ({
        restaurantId,
        tableId,
        clientId: 'client-1',
        items: [{ dishId: 'dish-1', quantity: 2, notes: null }]
    })

    beforeEach(async () => {
        repo = new MockOrderRepository()
        tableRepo = new MockTableRepository()
        service = new OrderService(repo, tableRepo)
        await tableRepo.save(table('t-ocupada'))
        await tableRepo.save(table('t-libre', { number: 6, status: 'libre' }))
        await tableRepo.save(table('t-reservada', { number: 7, status: 'reservada' }))
        await tableRepo.save(table('t-otro', { restaurantId: 'rest-2' }))
    })

    it('crea el pedido con una mesa ocupada del restaurante', async () => {
        const order = await service.create(request('t-ocupada'))
        expect(order.tableId).toBe('t-ocupada')
        expect(order.items).toHaveLength(2)
        expect(repo.orders).toHaveLength(1)
    })

    it('crea el pedido sin mesa', async () => {
        const order = await service.create(request(null))
        expect(order.tableId).toBeNull()
        expect(repo.orders).toHaveLength(1)
    })

    it('lanza TableNotOccupiedError con una mesa libre o reservada y no guarda el pedido', async () => {
        await expect(service.create(request('t-libre'))).rejects.toThrow(TableNotOccupiedError)
        await expect(service.create(request('t-reservada'))).rejects.toThrow(TableNotOccupiedError)
        expect(repo.orders).toHaveLength(0)
    })

    it('lanza TableNotFoundError con una mesa de otro restaurante o inexistente', async () => {
        await expect(service.create(request('t-otro'))).rejects.toThrow(TableNotFoundError)
        await expect(service.create(request('no-existe'))).rejects.toThrow(TableNotFoundError)
        expect(repo.orders).toHaveLength(0)
    })

    it('valida restaurantId antes que la mesa', async () => {
        await expect(service.create(request('no-existe', ''))).rejects.toThrow(RestaurantIdRequiredError)
    })
})
