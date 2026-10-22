import { randomUUID } from 'crypto'
import type { Table, TableStatusType } from '@models/table.model.js'
import { normalizeTableStatus } from '@models/table.model.js'
import type { TableRepository } from '@repositories/table.repository.js'
import type { RestaurantRepository } from '@repositories/restaurant.repository.js'
import {
    TableNumberInvalidError,
    InvalidCapacityError,
    TableDescriptionTooLongError,
    RestaurantNotFoundError,
    DuplicatedTableNumberError,
    TableNotFoundError
} from '@errors/DomainErrors.js'

const MAX_NUMBER = 9999
const MAX_CAPACITY = 1000
const MAX_DESCRIPTION_LENGTH = 255

// Los DTO llegan del cuerpo de la petición sin tipar: el servicio valida cada campo.
export interface CreateTableDTO {
    number: number
    capacity: number
    description?: string | null | undefined
    status?: string | null | undefined
}

export interface UpdateTableDTO {
    number: number
    capacity: number
    description?: string | null | undefined
    status?: string | undefined
}

export class TableService {
    constructor(
        private readonly tableRepository: TableRepository,
        private readonly restaurantRepository: RestaurantRepository
    ) {}

    async create(restaurantId: string, dto: CreateTableDTO): Promise<Table> {
        const fields = this.validateFields(dto)
        const status: TableStatusType = dto.status === undefined || dto.status === null
            ? 'libre'
            : normalizeTableStatus(dto.status)

        const restaurant = await this.restaurantRepository.findById(restaurantId)
        if (!restaurant) {
            throw new RestaurantNotFoundError()
        }
        await this.ensureNumberIsFree(restaurantId, fields.number)

        const now = new Date().toISOString()
        const table: Table = {
            id: randomUUID(),
            restaurantId,
            ...fields,
            status,
            createdAt: now,
            updatedAt: now
        }

        await this.tableRepository.save(table)
        return table
    }

    async update(restaurantId: string, id: string, dto: UpdateTableDTO): Promise<Table> {
        const existing = await this.findById(restaurantId, id)

        const fields = this.validateFields(dto)
        const status = normalizeTableStatus(dto.status as string)
        await this.ensureNumberIsFree(restaurantId, fields.number, id)

        const updated: Table = {
            ...existing,
            ...fields,
            status,
            updatedAt: new Date().toISOString()
        }

        await this.tableRepository.save(updated)
        return updated
    }

    async findById(restaurantId: string, id: string): Promise<Table> {
        const table = await this.tableRepository.findById(id)
        if (!table || table.restaurantId !== restaurantId) {
            throw new TableNotFoundError()
        }
        return table
    }

    async findByRestaurantId(restaurantId: string, status?: string): Promise<Table[]> {
        const normalizedStatus = status === undefined ? undefined : normalizeTableStatus(status)
        return this.tableRepository.findByRestaurantId(restaurantId, normalizedStatus)
    }

    private validateFields(dto: CreateTableDTO | UpdateTableDTO): Pick<Table, 'number' | 'capacity' | 'description'> {
        if (!isIntegerInRange(dto.number, 1, MAX_NUMBER)) {
            throw new TableNumberInvalidError()
        }
        if (!isIntegerInRange(dto.capacity, 1, MAX_CAPACITY)) {
            throw new InvalidCapacityError()
        }
        return {
            number: dto.number,
            capacity: dto.capacity,
            description: normalizeDescription(dto.description)
        }
    }

    private async ensureNumberIsFree(restaurantId: string, number: number, ownId?: string): Promise<void> {
        const tables = await this.tableRepository.findByRestaurantId(restaurantId)
        if (tables.some(t => t.number === number && t.id !== ownId)) {
            throw new DuplicatedTableNumberError(number)
        }
    }
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function normalizeDescription(value: unknown): string | null {
    if (value === undefined || value === null) return null
    const trimmed = String(value).trim()
    if (trimmed === '') return null
    if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
        throw new TableDescriptionTooLongError()
    }
    return trimmed
}
