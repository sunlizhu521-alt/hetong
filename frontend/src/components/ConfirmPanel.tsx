import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FileText, ShieldAlert } from 'lucide-react'
import type { MappingItem, OrderSheet, TemplateInfo, ValidationResult } from '../types'

interface ConfirmPanelProps {
  orderFilename: string
  templateFilename: string
  orderSheet: OrderSheet
  template: TemplateInfo
  templateSheet?: string
  items: MappingItem[]
  validation?: ValidationResult
  validating: boolean
  outputName: string
  warningsConfirmed: boolean
  onOutputName: (value: string) => void
  onWarningsConfirmed: (value: boolean) => void
  onBack: () => void
  onGenerate: () => void
}

export function ConfirmPanel({
  orderFilename,
  templateFilename,
  orderSheet,
  template,
  templateSheet,
  items,
  validation,
  validating,
  outputName,
  warningsConfirmed,
  onOutputName,
  onWarningsConfirmed,
  onBack,
  onGenerate,
}: ConfirmPanelProps) {
  const canGenerate = Boolean(validation?.valid && outputName.trim() && (!validation.warnings.length || warningsConfirmed))
  return (
    <section className="content-section confirm-section">
      <div className="section-heading">
        <div>
          <span className="section-index">04</span>
          <h2>确认生成内容</h2>
          <p>核对文件、映射和风险提示。点击生成前，服务器不会修改模板副本。</p>
        </div>
      </div>

      <div className="confirm-grid">
        <div className="confirm-main">
          <div className="summary-band">
            <SummaryItem label="订单明细" value={orderFilename} sub={`${orderSheet.name} · ${orderSheet.row_count} 行`} />
            <SummaryItem label="合同模板" value={templateFilename} sub={templateSheet || 'Word 文档'} />
            <SummaryItem label="字段映射" value={`${items.length} 条`} sub={`${items.filter((item) => item.mode === 'detail').length} 条明细映射`} />
          </div>

          <div className="mapping-review">
            <h3>映射清单</h3>
            {items.map((item) => (
              <div className="review-row" key={item.target_id}>
                <FileText size={17} />
                <div>
                  <strong>{template.targets.find((target) => target.id === item.target_id)?.label}</strong>
                  <span>{item.source_column ?? item.manual_value ?? '未设置'}</span>
                </div>
                <code>{item.mode}</code>
              </div>
            ))}
          </div>
        </div>

        <aside className="confirm-sidebar">
          <label className="output-name-field">
            合同文件名称
            <input
              value={outputName}
              maxLength={100}
              placeholder="例如：华东区9月采购合同"
              onChange={(event) => onOutputName(event.target.value)}
            />
            <small>系统会自动补充 DOCX、XLSX 和 PDF 扩展名。</small>
          </label>

          {validating ? <div className="status-box">正在检查全部映射…</div> : null}
          {validation?.errors.map((error) => (
            <div className="issue-box error" key={error}><ShieldAlert size={18} /><span>{error}</span></div>
          ))}
          {validation?.warnings.map((warning) => (
            <div className="issue-box warning" key={warning}><AlertTriangle size={18} /><span>{warning}</span></div>
          ))}
          {validation?.valid ? (
            <div className="issue-box success"><CheckCircle2 size={18} /><span>字段映射检查通过</span></div>
          ) : null}

          {validation?.warnings.length ? (
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={warningsConfirmed}
                onChange={(event) => onWarningsConfirmed(event.target.checked)}
              />
              <span>我已查看并确认以上模板风险提示</span>
            </label>
          ) : null}
        </aside>
      </div>

      <div className="footer-actions">
        <button className="button secondary" type="button" onClick={onBack}><ArrowLeft size={17} />返回修改</button>
        <button className="button primary" type="button" disabled={!canGenerate} onClick={onGenerate}>
          确认并生成合同 <ArrowRight size={17} />
        </button>
      </div>
    </section>
  )
}

function SummaryItem({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  )
}
