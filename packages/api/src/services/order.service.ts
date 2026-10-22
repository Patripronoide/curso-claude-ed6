import { randomUUID } from 'crypto'
import type { Order, OrderItem } from '@models/order.model.js'
import { normalizeOrderStatus } from '@models/order.model.js'
import type { OrderRepository } from '@repositories/order.repository.js'
import type { Table } from '@models/table.model.js'
import type { TableRepository } from '@repositories/table.repository.js'
import {
    RestaurantIdRequiredError,
    OrderNotFoundError,
    TableNotFoundError,
    TableNotOccupiedError
} from '@errors/DomainErrors.js'

export interface CreateOrderRequest {
    restaurantId: string
    tableId: string | null
    clientId: string | null
    items: {
        dishId: string
        quantity: number
        notes: string | null
    }[]
}

export class OrderService {
    constructor(
        private readonly orderRepository: OrderRepository,
        private readonly tableRepository: TableRepository
    ) {}

    async create(request: CreateOrderRequest): Promise<Order> {
        if (!request.restaurantId || request.restaurantId.trim() === '') {
            throw new RestaurantIdRequiredError()
        }
        const table = request.tableId === null
            ? null
            : await this.findOccupiedTable(request.restaurantId, request.tableId)

        const items: OrderItem[] = []
        for (const item of request.items) {
            for (let i = 0; i < item.quantity; i++) {
                items.push({
                    id: randomUUID(),
                    dishId: item.dishId,
                    quantity: 1,
                    notes: item.notes,
                    status: 'pendiente'
                })
            }
        }

        const order: Order = {
            id: randomUUID(),
            restaurantId: request.restaurantId,
            tableId: request.tableId,
            tableNumber: table?.number ?? null,
            clientId: request.clientId,
            createdAt: new Date(),
            items
        }

        await this.orderRepository.create(order)

        return order
    }

    // La mesa del pedido debe ser del mismo restaurante y estar ocupada.
    private async findOccupiedTable(restaurantId: string, tableId: string): Promise<Table> {
        const table = await this.tableRepository.findById(tableId)
        if (!table || table.restaurantId !== restaurantId) {
            throw new TableNotFoundError()
        }
        if (table.status !== 'ocupada') {
            throw new TableNotOccupiedError()
        }
        return table
    }

    async listActive(restaurantId: string): Promise<Order[]> {
        return this.orderRepository.findActiveByRestaurant(restaurantId)
    }

    async getById(orderId: string): Promise<Order> {
        const order = await this.orderRepository.findById(orderId)
        if (!order) {
            throw new OrderNotFoundError()
        }
        return order
    }

    async getByClientId(clientId: string): Promise<Order[]> {
        return this.orderRepository.findByClientId(clientId)
    }

    async updateItemStatus(orderId: string, itemId: string, status: string): Promise<void> {
        const order = await this.orderRepository.findById(orderId)
        if (!order) {
            throw new OrderNotFoundError()
        }

        const item = order.items.find(i => i.id === itemId)
        if (!item) {
            throw new OrderNotFoundError() // Or ItemNotFoundError
        }

        const normalizedStatus = normalizeOrderStatus(status)
        item.status = normalizedStatus

        await this.orderRepository.updateItemStatus(orderId, itemId, normalizedStatus)
    }
}
