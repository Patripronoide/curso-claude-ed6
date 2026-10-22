export type TableStatus = 'libre' | 'ocupada' | 'reservada'

export const TABLE_STATUSES: readonly TableStatus[] = ['libre', 'ocupada', 'reservada']

export interface Table {
  id: string
  restaurantId: string
  number: number
  description: string | null
  capacity: number
  status: TableStatus
  createdAt: string
  updatedAt: string
}

export interface UpdateTableStatusDto {
  status: TableStatus
}
