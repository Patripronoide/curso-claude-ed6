import { Injectable, inject } from '@angular/core'
import { HttpClient, HttpParams } from '@angular/common/http'
import { Observable } from 'rxjs'
import { API_URL } from '@resttek/web-shared'
import { Table } from '../models/table.model'

@Injectable({ providedIn: 'root' })
export class TableService {
  private readonly http = inject(HttpClient)
  private readonly apiUrl = inject(API_URL)

  /** Mesas libres con capacidad >= people (endpoint público, sin token). */
  getAvailable(restaurantId: string, people: number): Observable<Table[]> {
    const params = new HttpParams().set('people', people)
    return this.http.get<Table[]>(
      `${this.apiUrl}/public/restaurants/${restaurantId}/tables/available`,
      { params }
    )
  }

  /** Ocupa la mesa (rol cliente) y devuelve la mesa ya ocupada. */
  occupy(restaurantId: string, id: string, people: number): Observable<Table> {
    return this.http.post<Table>(
      `${this.apiUrl}/restaurants/${restaurantId}/tables/${id}/occupy`,
      { people }
    )
  }
}
