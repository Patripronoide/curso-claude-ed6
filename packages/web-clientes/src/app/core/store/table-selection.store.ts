import { Injectable, signal } from '@angular/core'
import { Table } from '../models/table.model'

export interface TableSelection {
  restaurantId: string
  table: Table
  people: number
}

/** Mesa elegida por el cliente y número de personas. Solo local, sin HTTP. */
@Injectable({ providedIn: 'root' })
export class TableSelectionStore {
  private readonly _selection = signal<TableSelection | null>(null)

  readonly selection = this._selection.asReadonly()

  select(restaurantId: string, table: Table, people: number): void {
    this._selection.set({ restaurantId, table, people })
  }

  /** Mesa elegida solo si pertenece a ese restaurante. */
  forRestaurant(restaurantId: string): TableSelection | null {
    const current = this._selection()
    return current && current.restaurantId === restaurantId ? current : null
  }

  clear(): void {
    this._selection.set(null)
  }
}
