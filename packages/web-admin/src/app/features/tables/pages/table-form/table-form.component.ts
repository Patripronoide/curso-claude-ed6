import { Component, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { LucideAngularModule } from 'lucide-angular'
import { firstValueFrom } from 'rxjs'
import { TableStore } from '../../store/table.store'
import { TableService } from '../../services/table.service'
import { TABLE_STATUSES, type CreateTableDto, type TableStatus } from '../../models/table.model'
import { getTableErrorMessage } from '../../utils/table-error'

interface TableFormModel {
  number: number | null
  description: string
  capacity: number | null
  status: TableStatus
}

@Component({
  selector: 'app-table-form',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './table-form.component.html',
  styleUrl: './table-form.component.css'
})
export class TableFormComponent implements OnInit {
  private readonly store = inject(TableStore)
  private readonly service = inject(TableService)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)

  isEditing = false
  tableId: string | null = null
  restaurantId: string = ''
  loading = signal(false)
  error = signal<string | null>(null)

  statuses = TABLE_STATUSES

  readonly statusLabels: Record<TableStatus, string> = {
    libre: 'Libre',
    ocupada: 'Ocupada',
    reservada: 'Reservada'
  }

  form: TableFormModel = {
    number: null,
    description: '',
    capacity: null,
    status: 'libre'
  }

  get pageTitle(): string {
    return this.isEditing ? 'Editar mesa' : 'Nueva mesa'
  }

  get listUrl(): string {
    return `/restaurants/${this.restaurantId}/tables`
  }

  ngOnInit(): void {
    this.restaurantId = this.route.parent?.snapshot.params['restaurantId'] ?? ''
    const id = this.route.snapshot.paramMap.get('id')

    if (id && this.restaurantId) {
      this.isEditing = true
      this.tableId = id
      this.loadTable()
    }
  }

  private async loadTable(): Promise<void> {
    this.loading.set(true)
    try {
      const table = await firstValueFrom(this.service.getById(this.restaurantId, this.tableId!))
      this.form = {
        number: table.number,
        description: table.description ?? '',
        capacity: table.capacity,
        status: table.status
      }
    } catch (err) {
      this.error.set(getTableErrorMessage(err, 'No se pudo cargar la mesa.'))
    } finally {
      this.loading.set(false)
    }
  }

  async onSubmit(): Promise<void> {
    this.error.set(null)

    const validationError = this.validate()
    if (validationError) {
      this.error.set(validationError)
      return
    }

    const dto: CreateTableDto = {
      number: this.form.number!,
      description: this.form.description.trim() || null,
      capacity: this.form.capacity!,
      status: this.form.status
    }

    this.loading.set(true)
    try {
      if (this.isEditing && this.tableId) {
        await this.store.update(this.restaurantId, this.tableId, dto)
      } else {
        await this.store.create(this.restaurantId, dto)
      }
      this.router.navigate(['/restaurants', this.restaurantId, 'tables'])
    } catch (err) {
      this.error.set(getTableErrorMessage(err, 'Error al guardar la mesa.'))
    } finally {
      this.loading.set(false)
    }
  }

  private validate(): string | null {
    const { number, capacity } = this.form
    if (number === null || !Number.isInteger(number) || number < 1 || number > 9999) {
      return 'El número de mesa debe ser un entero entre 1 y 9999'
    }
    if (capacity === null || !Number.isInteger(capacity) || capacity < 1 || capacity > 1000) {
      return 'La capacidad debe ser un entero entre 1 y 1000'
    }
    if (this.form.description.trim().length > 255) {
      return 'La descripción no puede superar los 255 caracteres'
    }
    return null
  }
}
