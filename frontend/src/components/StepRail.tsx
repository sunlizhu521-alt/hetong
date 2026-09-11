import { Check } from 'lucide-react'

const steps = ['订单明细', '合同模板', '字段映射', '确认生成', '预览下载']

interface StepRailProps {
  current: number
}

export function StepRail({ current }: StepRailProps) {
  return (
    <nav className="step-rail" aria-label="合同生成步骤">
      {steps.map((label, index) => {
        const number = index + 1
        const complete = number < current
        const active = number === current
        return (
          <div className={`step-item ${active ? 'active' : ''} ${complete ? 'complete' : ''}`} key={label}>
            <span className="step-number" aria-current={active ? 'step' : undefined}>
              {complete ? <Check size={16} strokeWidth={2.5} /> : number}
            </span>
            <span className="step-label">{label}</span>
          </div>
        )
      })}
    </nav>
  )
}
