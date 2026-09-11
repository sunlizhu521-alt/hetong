export type FileKind = 'order' | 'template'

export interface SessionInfo {
  id: string
  token: string
  expires_at: string
}

export interface UploadInfo {
  filename: string
  sha256: string
  size: number
  extension: string
}

export interface OrderSheet {
  name: string
  headers: string[]
  row_count: number
  header_row: number
  preview: Record<string, unknown>[]
}

export interface TemplateTarget {
  id: string
  label: string
  text: string
  type: 'paragraph' | 'table_cell' | 'cell'
  table?: number
  row?: number
  column?: number
  coordinate?: string
}

export interface TemplateInfo {
  kind: 'docx' | 'xlsx' | 'xls'
  fingerprint: string
  sheets: string[]
  selected_sheet?: string
  targets: TemplateTarget[]
  blocks?: Array<TemplateTarget | WordTableBlock>
  grid?: TemplateTarget[][]
  warnings: string[]
  blocking_errors: string[]
  fonts?: string[]
}

export interface WordTableBlock {
  type: 'table'
  table: number
  rows: TemplateTarget[][]
}

export interface Inspection {
  order: { sheets: OrderSheet[] }
  template: TemplateInfo
  expires_at: string
}

export type MappingMode =
  | 'first_non_empty'
  | 'selected_value'
  | 'join_unique'
  | 'sum'
  | 'manual'
  | 'detail'

export interface MappingItem {
  target_id: string
  source_column?: string
  mode: MappingMode
  manual_value?: string
  selected_value?: string
}

export interface MappingPayload {
  order_sheet: string
  template_sheet?: string
  items: MappingItem[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  conflicts: Record<string, string[]>
}

export interface JobInfo {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  message?: string
  files: Record<string, string>
  preview_pages: string[]
  warnings: string[]
}

export interface MappingProfile {
  version: 1
  template_fingerprint: string
  template_sheet?: string
  order_sheet: string
  items: MappingItem[]
}
