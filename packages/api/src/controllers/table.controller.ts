import type { Request, Response, NextFunction } from 'express'
import type { TableService } from '@services/table.service.js'
import type { Table } from '@models/table.model.js'

export class TableController {
    constructor(private readonly tableService: TableService) {}

    create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.create(req.params.restaurantId as string, {
                number: req.body?.number,
                capacity: req.body?.capacity,
                description: req.body?.description,
                status: req.body?.status
            })
            res.status(201).json(this.toJSON(table))
        } catch (error) {
            next(error)
        }
    }

    getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { status } = req.query
            const tables = await this.tableService.findByRestaurantId(
                req.params.restaurantId as string,
                status === undefined ? undefined : String(status)
            )
            res.status(200).json(tables.map(t => this.toJSON(t)))
        } catch (error) {
            next(error)
        }
    }

    getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.findById(req.params.restaurantId as string, req.params.id as string)
            res.status(200).json(this.toJSON(table))
        } catch (error) {
            next(error)
        }
    }

    update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.update(req.params.restaurantId as string, req.params.id as string, {
                number: req.body?.number,
                capacity: req.body?.capacity,
                description: req.body?.description,
                status: req.body?.status
            })
            res.status(200).json(this.toJSON(table))
        } catch (error) {
            next(error)
        }
    }

    delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            await this.tableService.delete(req.params.restaurantId as string, req.params.id as string)
            res.status(204).send()
        } catch (error) {
            next(error)
        }
    }

    changeStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.changeStatus(
                req.params.restaurantId as string,
                req.params.id as string,
                req.body?.status
            )
            res.status(200).json(this.toJSON(table))
        } catch (error) {
            next(error)
        }
    }

    getAvailable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const tables = await this.tableService.listAvailable(
                req.params.restaurantId as string,
                parsePeopleQuery(req.query.people)
            )
            res.status(200).json(tables.map(t => this.toJSON(t)))
        } catch (error) {
            next(error)
        }
    }

    occupy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const table = await this.tableService.occupy(
                req.params.restaurantId as string,
                req.params.id as string,
                req.body?.people
            )
            res.status(200).json(this.toJSON(table))
        } catch (error) {
            next(error)
        }
    }

    private toJSON(table: Table) {
        return {
            id: table.id,
            restaurantId: table.restaurantId,
            number: table.number,
            description: table.description,
            capacity: table.capacity,
            status: table.status,
            createdAt: table.createdAt,
            updatedAt: table.updatedAt
        }
    }
}

// La query llega como texto: solo se aceptan dígitos ("3"); el resto (vacío, "1.5", "abc"...)
// se convierte en NaN para que el servicio responda InvalidPeopleError.
function parsePeopleQuery(value: unknown): number {
    return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
}
