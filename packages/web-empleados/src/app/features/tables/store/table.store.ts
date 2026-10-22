import { Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Table, TableStatus } from '../models/table.model';
import { TableService } from '../services/table.service';

/** Intervalo de refresco de las mesas (ms). */
const POLLING_MS = 30000;

@Injectable({ providedIn: 'root' })
export class TableStore {
  private readonly tableService = inject(TableService);

  private readonly _tables = signal<Table[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  readonly tables = this._tables.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  async loadTables(restaurantId: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const tables = await firstValueFrom(this.tableService.getTables(restaurantId));
      this._tables.set(tables);
    } catch (err) {
      this._error.set(this.describeError(err, 'Error al cargar las mesas'));
    } finally {
      this._loading.set(false);
    }
  }

  /** Cambia el estado de una mesa y actualiza la señal con la mesa devuelta por la API. */
  async changeStatus(restaurantId: string, id: string, status: TableStatus): Promise<void> {
    this._error.set(null);
    try {
      const updated = await firstValueFrom(
        this.tableService.updateStatus(restaurantId, id, { status })
      );
      this._tables.update(tables => tables.map(t => (t.id === id ? updated : t)));
    } catch (err) {
      this._error.set(this.describeError(err, 'Error al cambiar el estado de la mesa'));
    }
  }

  startPolling(restaurantId: string): void {
    this.stopPolling();
    this.loadTables(restaurantId);
    this.pollingInterval = setInterval(() => {
      this.loadTables(restaurantId);
    }, POLLING_MS);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Los 401/403 se distinguen por el código HTTP; el resto de errores por el campo
   * `error` del cuerpo (nunca por `message`).
   */
  private describeError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
      if (err.status === 403) return 'No tienes permisos para esta acción.';
      switch (err.error?.error) {
        case 'TableNotFoundError':
          return 'La mesa no existe.';
        case 'InvalidTableStatusError':
          return 'Estado de mesa no válido.';
      }
    }
    return fallback;
  }
}
