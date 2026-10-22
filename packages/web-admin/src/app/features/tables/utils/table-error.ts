import { HttpErrorResponse } from '@angular/common/http'

/** Mensajes en español por nombre de error de la API (el campo `error`, nunca `message`). */
const TABLE_ERROR_MESSAGES: Record<string, string> = {
  DuplicatedTableNumberError: 'Ya existe una mesa con ese número',
  TableHasOrdersError: 'No se puede eliminar: tiene pedidos asociados',
  TableNumberInvalidError: 'El número de mesa debe ser un entero entre 1 y 9999',
  InvalidCapacityError: 'La capacidad debe ser un entero entre 1 y 1000',
  TableDescriptionTooLongError: 'La descripción no puede superar los 255 caracteres',
  InvalidTableStatusError: 'El estado de la mesa no es válido',
  TableNotFoundError: 'La mesa no existe'
}

export function getTableErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const code = err.error?.error
    if (typeof code === 'string' && TABLE_ERROR_MESSAGES[code]) {
      return TABLE_ERROR_MESSAGES[code]
    }
  }
  return fallback
}
