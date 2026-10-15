import { useState, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { Button, ColumnMenu, EmptyState, Input, Select } from './ui'
import { cn } from '../lib/utils'

export function DataTable<T>({
  data,
  columns,
  label,
  onSelect,
  selectedId,
  getRowId,
  className,
}: {
  data: T[]
  columns: ColumnDef<T>[]
  label: string
  onSelect?: (row: T) => void
  selectedId?: string
  getRowId: (row: T) => string
  className?: string
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [visibility, setVisibility] = useState<VisibilityState>({})
  const [search, setSearch] = useState('')
  // TanStack Table intentionally exposes mutable table methods.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    sortDescFirst: false,
    getRowId,
    state: { sorting, columnVisibility: visibility, globalFilter: search },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })
  const rows = table.getRowModel().rows
  const total = table.getFilteredRowModel().rows.length
  function navigate(event: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (event.target !== event.currentTarget) return
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const siblings = Array.from(
        event.currentTarget.parentElement?.querySelectorAll<HTMLTableRowElement>('tr[data-row]') ??
          []
      )
      const index = siblings.indexOf(event.currentTarget)
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? siblings.length - 1
            : index + (event.key === 'ArrowDown' ? 1 : -1)
      siblings[Math.max(0, Math.min(siblings.length - 1, next))]?.focus()
    }
    if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      onSelect(row)
    }
  }
  return (
    <div className="data-table">
      <div className="table-toolbar">
        <div className="search-control">
          <Search size={16} aria-hidden="true" />
          <Input
            aria-label={`Search ${label.toLowerCase()}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search records…"
          />
        </div>
        <ColumnMenu
          columns={table
            .getAllLeafColumns()
            .filter((column) => column.getCanHide())
            .map((column) => ({
              id: column.id,
              label:
                typeof column.columnDef.header === 'string'
                  ? column.columnDef.header
                  : column.id.replaceAll('_', ' '),
              visible: column.getIsVisible(),
              toggle: (visible) => column.toggleVisibility(visible),
            }))}
        />
      </div>
      <p className="sr-only" id={`${label.replaceAll(' ', '-')}-help`}>
        Use arrow keys to move between rows, Home and End to reach the first and last row
        {onSelect ? ', and Enter to inspect a record.' : '.'}
      </p>
      <div className="table-scroll" role="region" aria-label={`${label} table`} tabIndex={0}>
        <table className={cn(className)} aria-describedby={`${label.replaceAll(' ', '-')}-help`}>
          <caption className="sr-only">{label}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const numeric = (
                    header.column.columnDef.meta as { numeric?: boolean } | undefined
                  )?.numeric
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={numeric ? 'numeric' : ''}
                      aria-sort={
                        header.column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : header.column.getIsSorted() === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <Button
                          variant="ghost"
                          className="sort-button"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' ? (
                            <ArrowUp />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ArrowDown />
                          ) : (
                            <ArrowUpDown />
                          )}
                        </Button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-row
                tabIndex={0}
                aria-current={selectedId === row.id ? 'true' : undefined}
                className={selectedId === row.id ? 'selected' : ''}
                onKeyDown={(event) => navigate(event, row.original)}
                onClick={
                  onSelect
                    ? (event) => {
                        if (!(event.target as HTMLElement).closest('button,a,input'))
                          onSelect(row.original)
                      }
                    : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={
                      (cell.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric
                        ? 'numeric'
                        : ''
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <EmptyState
          title="No matching records"
          description="Try another search or broaden your filters."
        />
      )}
      <div className="table-footer">
        <span role="status">
          {total} record{total !== 1 ? 's' : ''} · Page {table.getState().pagination.pageIndex + 1}{' '}
          of {Math.max(1, table.getPageCount())}
        </span>
        <div className="inline-controls">
          <Select
            label="Rows per page"
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
            options={[5, 10, 25].map((value) => ({
              value: String(value),
              label: `${value} / page`,
            }))}
          />
          <Button
            size="icon"
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft />
          </Button>
          <Button
            size="icon"
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
