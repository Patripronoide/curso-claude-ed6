import { Component, inject, OnInit, signal } from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { HttpErrorResponse } from '@angular/common/http'
import { FormsModule } from '@angular/forms'
import { TableService } from '../../core/services/table.service'
import { RestaurantService } from '../../core/services/restaurant.service'
import { TableSelectionStore } from '../../core/store/table-selection.store'
import { Table } from '../../core/models/table.model'
import { Restaurant } from '../../core/models/restaurant.model'

@Component({
  selector: 'app-table-picker',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="container">
      <div class="page-header">
        <div>
          <a routerLink="/restaurants" class="back-link">← Volver a restaurantes</a>
          <h1>{{ restaurant()?.name || 'Elige tu mesa' }}</h1>
          <p>Elige tu mesa antes de ver la carta</p>
        </div>
      </div>

      <section class="card step">
        <h2>¿Cuántas personas sois?</h2>
        <form class="people-form" (ngSubmit)="search()">
          <div class="form-group">
            <label for="people">Número de personas</label>
            <input
              id="people"
              name="people"
              type="number"
              min="1"
              step="1"
              class="form-control"
              [ngModel]="people()"
              (ngModelChange)="onPeopleChange($event)"
            />
          </div>
          <button type="submit" class="btn btn-primary" [disabled]="loading()">
            Buscar mesas
          </button>
        </form>
        @if (peopleError()) {
          <div class="alert-error">{{ peopleError() }}</div>
        }
      </section>

      @if (searched()) {
        <section class="card step">
          <h2>Mesas disponibles</h2>

          @if (notice()) {
            <div class="alert-error">{{ notice() }}</div>
          }

          @if (loading()) {
            <div class="spinner"></div>
          } @else if (error()) {
            <div class="alert-error">{{ error() }}</div>
          } @else if (tables().length === 0) {
            <div class="empty-state">
              <p>No hay mesas disponibles para tantas personas</p>
            </div>
          } @else {
            <div class="table-grid" role="radiogroup" aria-label="Mesas disponibles">
              @for (table of tables(); track table.id) {
                <button
                  type="button"
                  role="radio"
                  class="table-option"
                  [class.selected]="selectedId() === table.id"
                  [attr.aria-checked]="selectedId() === table.id"
                  (click)="selectedId.set(table.id)"
                >
                  <strong>Mesa {{ table.number }}</strong>
                  @if (table.description) {
                    <span class="table-description">{{ table.description }}</span>
                  }
                  <span class="table-capacity">Capacidad: {{ table.capacity }}</span>
                </button>
              }
            </div>
          }

          <div class="actions">
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="!selectedId() || loading() || occupying()"
              (click)="continuar()"
            >
              @if (occupying()) {
                Reservando mesa...
              } @else {
                Continuar
              }
            </button>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .back-link {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 8px;
      display: inline-block;
    }
    .step {
      margin-bottom: 20px;
    }
    .step h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .people-form {
      display: flex;
      align-items: flex-end;
      gap: 12px;
    }
    .people-form .form-group {
      margin-bottom: 0;
      flex: 1;
      max-width: 240px;
    }
    .table-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }
    .table-option {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
      padding: 14px 16px;
      text-align: left;
      border-radius: var(--radius-sm);
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      transition: all var(--transition);
    }
    .table-option:hover {
      border-color: var(--green-medium);
    }
    .table-option.selected {
      border-color: var(--green-light);
      background: var(--green-glow);
    }
    .table-description,
    .table-capacity {
      font-size: 13px;
      color: var(--text-muted);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
    }
  `]
})
export class TablePickerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly tableService = inject(TableService)
  private readonly restaurantService = inject(RestaurantService)
  private readonly selectionStore = inject(TableSelectionStore)

  private restaurantId = ''

  readonly restaurant = signal<Restaurant | null>(null)
  readonly people = signal<number | null>(null)
  readonly peopleError = signal<string | null>(null)
  readonly searched = signal(false)
  readonly tables = signal<Table[]>([])
  readonly selectedId = signal<string | null>(null)
  readonly loading = signal(false)
  readonly occupying = signal(false)
  readonly error = signal<string | null>(null)
  readonly notice = signal<string | null>(null)

  ngOnInit(): void {
    this.restaurantId = this.route.snapshot.paramMap.get('id')!
    this.restaurantService.getById(this.restaurantId).subscribe({
      next: (restaurant) => this.restaurant.set(restaurant),
      error: () => {}
    })
  }

  onPeopleChange(value: number | null): void {
    this.people.set(value)
    this.peopleError.set(null)
    // Al cambiar el número de personas la lista anterior deja de ser válida
    this.searched.set(false)
    this.tables.set([])
    this.selectedId.set(null)
    this.notice.set(null)
  }

  search(): void {
    const people = this.people()
    if (people === null || !Number.isInteger(people) || people < 1) {
      this.peopleError.set('Indica un número entero de personas igual o mayor que 1')
      return
    }
    this.peopleError.set(null)
    this.notice.set(null)
    this.loadTables(people)
  }

  /** Carga las mesas libres para `people` personas y limpia la selección. */
  protected loadTables(people: number): void {
    this.searched.set(true)
    this.loading.set(true)
    this.error.set(null)
    this.selectedId.set(null)
    this.tableService.getAvailable(this.restaurantId, people).subscribe({
      next: (tables) => {
        this.tables.set(tables)
        this.loading.set(false)
      },
      error: () => {
        this.tables.set([])
        this.error.set('Error al cargar las mesas disponibles')
        this.loading.set(false)
      }
    })
  }

  continuar(): void {
    const people = this.people()
    const table = this.tables().find((t) => t.id === this.selectedId())
    if (!table || people === null) return

    this.occupying.set(true)
    this.notice.set(null)
    this.tableService.occupy(this.restaurantId, table.id, people).subscribe({
      next: (occupied) => {
        this.selectionStore.select(this.restaurantId, occupied, people)
        this.occupying.set(false)
        this.router.navigate(['/restaurants', this.restaurantId])
      },
      error: (err) => {
        this.occupying.set(false)
        this.handleOccupyError(err, people)
      }
    })
  }

  /** Los errores de negocio se distinguen por `err.error.error`, nunca por `message`. */
  private handleOccupyError(err: HttpErrorResponse, people: number): void {
    // El 401 lo trata el errorInterceptor de web-shared (redirige a /login)
    if (err.status === 401) return

    if (err.status === 403) {
      this.notice.set('Solo los clientes pueden ocupar una mesa')
      return
    }

    switch (err.error?.error) {
      case 'TableNotAvailableError':
        this.loadTables(people)
        this.notice.set('Esa mesa acaba de ocuparse. Elige otra de la lista actualizada.')
        break
      case 'TableCapacityExceededError':
        this.loadTables(people)
        this.notice.set('En esa mesa no caben tantas personas. Elige una de mayor capacidad.')
        break
      case 'TableNotFoundError':
        this.loadTables(people)
        this.notice.set('Esa mesa ya no existe. Elige otra de la lista actualizada.')
        break
      case 'InvalidPeopleError':
        this.peopleError.set('Indica un número entero de personas igual o mayor que 1')
        break
      default:
        this.notice.set('No se ha podido ocupar la mesa. Inténtalo de nuevo.')
    }
  }
}
