import { Component, inject, computed, OnInit, OnDestroy } from '@angular/core';
import { AuthStore } from '@resttek/web-shared';
import { OrderStore } from '../../store/order.store';
import { TableStore } from '../../../tables/store/table.store';
import { Table, TableStatus, TABLE_STATUSES } from '../../../tables/models/table.model';

@Component({
  selector: 'app-salon',
  standalone: true,
  templateUrl: './salon.component.html',
  styleUrl: './salon.component.css'
})
export class SalonComponent implements OnInit, OnDestroy {
  private readonly authStore = inject(AuthStore);
  readonly orderStore = inject(OrderStore);
  readonly tableStore = inject(TableStore);

  readonly statuses = TABLE_STATUSES;

  /** El cocinero solo consulta las mesas: la API le devolvería 403 al cambiar el estado. */
  readonly canChangeStatus = computed(() => {
    const role = this.authStore.userRole();
    return role === 'camarero' || role === 'manager';
  });

  ngOnInit(): void {
    const restaurantId = this.authStore.user()?.restaurantId;
    if (restaurantId) {
      this.orderStore.startPolling(restaurantId);
      this.tableStore.startPolling(restaurantId);
    }
  }

  ngOnDestroy(): void {
    this.orderStore.stopPolling();
    this.tableStore.stopPolling();
  }

  /** Pedidos activos de la mesa (asociados solo por `tableId`). */
  ordersOf(table: Table) {
    return this.orderStore.ordersByTable().get(table.id) ?? [];
  }

  changeStatus(table: Table, event: Event): void {
    const restaurantId = this.authStore.user()?.restaurantId;
    const status = (event.target as HTMLSelectElement).value as TableStatus;
    if (!restaurantId || status === table.status) return;
    this.tableStore.changeStatus(restaurantId, table.id, status);
  }

  get readyOrders() {
    return this.orderStore.orders().map(order => ({
      ...order,
      items: order.items.filter(item => item.status === 'listo')
    })).filter(order => order.items.length > 0);
  }

  deliver(orderId: string, itemId: string): void {
    this.orderStore.updateItemStatus(orderId, itemId, 'entregado');
  }

  getStatusClass(status: string): string {
    return `badge badge-${status}`;
  }
}
