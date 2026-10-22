import type { TableRepository } from '@repositories/table.repository.js'
import type { Table, TableStatusType } from '@models/table.model.js'

export class MockTableRepository implements TableRepository {
    private tables: Map<string, Table> = new Map()
    // Ids de mesa que el doble considera con pedidos asociados.
    tablesWithOrders: Set<string> = new Set()

    async findById(id: string): Promise<Table | null> {
        const table = this.tables.get(id)
        return table ? { ...table } : null
    }

    async findByRestaurantId(restaurantId: string, status?: TableStatusType): Promise<Table[]> {
        return Array.from(this.tables.values())
            .filter(t => t.restaurantId === restaurantId && (!status || t.status === status))
            .sort((a, b) => a.number - b.number)
            .map(t => ({ ...t }))
    }

    async save(table: Table): Promise<void> {
        this.tables.set(table.id, { ...table })
    }

    async delete(id: string): Promise<void> {
        this.tables.delete(id)
    }

    async findAvailable(restaurantId: string, people: number): Promise<Table[]> {
        return Array.from(this.tables.values())
            .filter(t => t.restaurantId === restaurantId && t.status === 'libre' && t.capacity >= people)
            .sort((a, b) => a.capacity - b.capacity || a.number - b.number)
            .map(t => ({ ...t }))
    }

    async occupyIfFree(id: string, restaurantId: string): Promise<boolean> {
        const table = this.tables.get(id)
        if (!table || table.restaurantId !== restaurantId || table.status !== 'libre') {
            return false
        }
        this.tables.set(id, { ...table, status: 'ocupada', updatedAt: new Date().toISOString() })
        return true
    }

    async hasOrders(id: string): Promise<boolean> {
        return this.tablesWithOrders.has(id)
    }
}
