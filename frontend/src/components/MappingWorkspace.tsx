import { ArrowRight, Download, Link2, Save, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type {
  MappingItem,
  MappingMode,
  MappingProfile,
  OrderSheet,
  TemplateInfo,
  TemplateTarget,
  WordTableBlock,
} from '../types'

const modeLabels: Record<MappingMode, string> = {
  first_non_empty: '唯一值',
  selected_value: '指定值',
  join_unique: '合并去重',
  sum: '求和',
  manual: '手工输入',
  detail: '逐行明细',
}

interface MappingWorkspaceProps {
  orderSheet: OrderSheet
  template: TemplateInfo
  templateSheet?: string
  items: MappingItem[]
  onChange: (items: MappingItem[]) => void
  onContinue: () => void
  onBack: () => void
  onMessage: (message: string) => void
}

export function MappingWorkspace({
  orderSheet,
  template,
  templateSheet,
  items,
  onChange,
  onContinue,
  onBack,
  onMessage,
}: MappingWorkspaceProps) {
  const [selectedTarget, setSelectedTarget] = useState<TemplateTarget | null>(template.targets[0] ?? null)
  const [sourceColumn, setSourceColumn] = useState(orderSheet.headers[0] ?? '')
  const [mode, setMode] = useState<MappingMode>('first_non_empty')
  const [manualValue, setManualValue] = useState('')
  const [selectedValue, setSelectedValue] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const mappingByTarget = useMemo(() => new Map(items.map((item) => [item.target_id, item])), [items])

  const saveMapping = () => {
    if (!selectedTarget) return
    const next: MappingItem = {
      target_id: selectedTarget.id,
      mode,
      ...(mode === 'manual' ? { manual_value: manualValue } : { source_column: sourceColumn }),
      ...(mode === 'selected_value' ? { selected_value: selectedValue } : {}),
    }
    onChange([...items.filter((item) => item.target_id !== selectedTarget.id), next])
    onMessage(`已映射：${selectedTarget.label}`)
  }

  const selectTarget = (target: TemplateTarget) => {
    setSelectedTarget(target)
    const current = mappingByTarget.get(target.id)
    if (current) {
      setMode(current.mode)
      setSourceColumn(current.source_column ?? orderSheet.headers[0] ?? '')
      setManualValue(current.manual_value ?? '')
      setSelectedValue(current.selected_value ?? '')
    }
  }

  const exportProfile = () => {
    const profile: MappingProfile = {
      version: 1,
      template_fingerprint: template.fingerprint,
      template_sheet: templateSheet,
      order_sheet: orderSheet.name,
      items,
    }
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = '合同映射方案.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importProfile = async (file?: File) => {
    if (!file) return
    try {
      const profile = JSON.parse(await file.text()) as MappingProfile
      if (profile.version !== 1 || !Array.isArray(profile.items)) throw new Error('映射文件格式无效')
      if (profile.template_fingerprint !== template.fingerprint) {
        throw new Error('模板已经变化，不能直接套用该映射方案')
      }
      onChange(profile.items)
      onMessage(`已导入 ${profile.items.length} 条映射`)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '映射文件读取失败')
    }
  }

  return (
    <section className="mapping-section">
      <div className="section-heading mapping-heading">
        <div>
          <span className="section-index">03</span>
          <h2>建立字段映射</h2>
          <p>先点击模板中的目标位置，再选择订单字段和填充规则。</p>
        </div>
        <div className="mapping-tools">
          <input
            ref={importRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importProfile(event.target.files?.[0])}
          />
          <button className="button ghost" type="button" onClick={() => importRef.current?.click()}>
            <Upload size={16} /> 导入方案
          </button>
          <button className="button ghost" type="button" disabled={!items.length} onClick={exportProfile}>
            <Download size={16} /> 导出方案
          </button>
        </div>
      </div>

      <div className="mapping-layout">
        <aside className="mapping-column source-column">
          <div className="column-heading">
            <span>订单字段</span>
            <strong>{orderSheet.headers.length}</strong>
          </div>
          <div className="field-list">
            {orderSheet.headers.map((header) => (
              <button
                className={`source-field ${sourceColumn === header ? 'selected' : ''}`}
                type="button"
                key={header}
                onClick={() => setSourceColumn(header)}
              >
                <span>{header}</span>
                <small>{String(orderSheet.preview[0]?.[header] ?? '暂无示例值')}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="mapping-column template-column">
          <div className="column-heading">
            <span>合同模板</span>
            <small>{template.kind === 'docx' ? 'Word 结构预览' : templateSheet}</small>
          </div>
          <div className={`template-canvas ${template.kind}`}>
            {template.kind === 'docx' ? (
              <WordPreview
                blocks={template.blocks ?? []}
                selectedId={selectedTarget?.id}
                mapped={mappingByTarget}
                onSelect={selectTarget}
              />
            ) : (
              <ExcelPreview
                grid={template.grid ?? []}
                selectedId={selectedTarget?.id}
                mapped={mappingByTarget}
                onSelect={selectTarget}
              />
            )}
          </div>
        </main>

        <aside className="mapping-column rule-column">
          <div className="column-heading">
            <span>填充规则</span>
            <Link2 size={17} />
          </div>
          <div className="rule-editor">
            <label>
              模板位置
              <input value={selectedTarget?.label ?? '请先选择模板位置'} readOnly />
            </label>
            <label>
              填充方式
              <select value={mode} onChange={(event) => setMode(event.target.value as MappingMode)}>
                {Object.entries(modeLabels).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </label>
            {mode !== 'manual' ? (
              <label>
                订单字段
                <select value={sourceColumn} onChange={(event) => setSourceColumn(event.target.value)}>
                  {orderSheet.headers.map((header) => <option key={header}>{header}</option>)}
                </select>
              </label>
            ) : (
              <label>
                手工内容
                <textarea value={manualValue} onChange={(event) => setManualValue(event.target.value)} />
              </label>
            )}
            {mode === 'selected_value' ? (
              <label>
                指定值
                <input value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} />
              </label>
            ) : null}
            <p className="rule-help">{ruleHelp(mode)}</p>
            <button className="button primary wide" type="button" disabled={!selectedTarget} onClick={saveMapping}>
              <Save size={16} /> 保存这条映射
            </button>
          </div>
          <div className="mapping-summary">
            <div><span>已配置映射</span><strong>{items.length}</strong></div>
            {items.map((item) => (
              <div className="mapping-row" key={item.target_id}>
                <div>
                  <strong>{template.targets.find((target) => target.id === item.target_id)?.label}</strong>
                  <small>{modeLabels[item.mode]} · {item.source_column ?? item.manual_value}</small>
                </div>
                <button
                  className="icon-button"
                  aria-label="删除映射"
                  type="button"
                  onClick={() => onChange(items.filter((entry) => entry.target_id !== item.target_id))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="footer-actions">
        <button className="button secondary" type="button" onClick={onBack}>返回上一步</button>
        <button className="button primary" type="button" disabled={!items.length} onClick={onContinue}>
          检查映射 <ArrowRight size={17} />
        </button>
      </div>
    </section>
  )
}

function WordPreview({
  blocks,
  selectedId,
  mapped,
  onSelect,
}: {
  blocks: Array<TemplateTarget | WordTableBlock>
  selectedId?: string
  mapped: Map<string, MappingItem>
  onSelect: (target: TemplateTarget) => void
}) {
  return (
    <div className="word-page">
      {blocks.map((block, index) => block.type === 'table' ? (
        <table key={`table-${block.table}`}>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${block.table}-${rowIndex}`}>
                {row.map((cell) => (
                  <td key={cell.id}>
                    <TargetButton target={cell} selectedId={selectedId} mapped={mapped} onSelect={onSelect} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <TargetButton key={`${block.id}-${index}`} target={block} selectedId={selectedId} mapped={mapped} onSelect={onSelect} />
      ))}
    </div>
  )
}

function ExcelPreview({
  grid,
  selectedId,
  mapped,
  onSelect,
}: {
  grid: TemplateTarget[][]
  selectedId?: string
  mapped: Map<string, MappingItem>
  onSelect: (target: TemplateTarget) => void
}) {
  return (
    <div className="excel-grid">
      {grid.map((row, index) => (
        <div className="excel-row" key={index}>
          <span className="row-number">{index + 1}</span>
          {row.map((cell) => (
            <TargetButton target={cell} selectedId={selectedId} mapped={mapped} onSelect={onSelect} key={cell.id} />
          ))}
        </div>
      ))}
    </div>
  )
}

function TargetButton({
  target,
  selectedId,
  mapped,
  onSelect,
}: {
  target: TemplateTarget
  selectedId?: string
  mapped: Map<string, MappingItem>
  onSelect: (target: TemplateTarget) => void
}) {
  return (
    <button
      className={`target-field ${selectedId === target.id ? 'selected' : ''} ${mapped.has(target.id) ? 'mapped' : ''}`}
      type="button"
      title={target.label}
      onClick={() => onSelect(target)}
    >
      {target.text || <span className="empty-cell">空白位置</span>}
    </button>
  )
}

function ruleHelp(mode: MappingMode): string {
  const messages: Record<MappingMode, string> = {
    first_non_empty: '仅当该字段在全部订单行中只有一个非空值时使用。',
    selected_value: '字段存在多个值时，明确输入要写入合同的值。',
    join_unique: '去除重复值后使用中文顿号连接。',
    sum: '只适用于数字字段，不会自动用于金额或数量。',
    manual: '直接写入固定内容，不读取订单字段。',
    detail: '将当前模板行作为明细样式，按订单数据逐行复制。',
  }
  return messages[mode]
}
