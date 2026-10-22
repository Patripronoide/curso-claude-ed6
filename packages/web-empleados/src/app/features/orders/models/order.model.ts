export type OrderStatus = 'pendiente' | 'preparando' | 'listo' | 'entregado'

export interface OrderItem {
  id: string
  dishId: string
  quantity: number
  notes: string | null
  status: OrderStatus
  dishName?: string
  dishPrice?: number
  dishCategory?: string
}

export interface Order {
  id: string
  restaurantId: string
  tableId: string | null
  /** Número de la mesa, solo para mostrar; null = pedido sin mesa. Asociar siempre por tableId. */
  tableNumber: number | null
  clientId: string | null
  createdAt: string
  items: OrderItem[]
}

export interface UpdateOrderItemStatusDto {
  status: OrderStatus
}
