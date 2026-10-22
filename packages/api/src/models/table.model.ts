import { InvalidTableStatusError } from '@errors/DomainErrors.js'

export const TABLE_STATUSES = ['libre', 'ocupada', 'reservada'] as const

export type TableStatusType = typeof TABLE_STATUSES[number]

export interface Table {
    id: string
    restaurantId: string
    number: number
    description: string | null
    capacity: number
    status: TableStatusType
    createdAt: string
    updatedAt: string
}

export function normalizeTableStatus(value: string): TableStatusType {
    if (!value || typeof value !== 'string') {
        throw new InvalidTableStatusError(`Table status must be provided. Must be one of: ${TABLE_STATUSES.join(', ')}`)
    }

    const normalized = value.trim().toLowerCase()
    if (!TABLE_STATUSES.includes(normalized as TableStatusType)) {
        throw new InvalidTableStatusError(`Invalid table status: ${value}. Must be one of: ${TABLE_STATUSES.join(', ')}`)
    }
    return normalized as TableStatusType
}
