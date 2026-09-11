import { AlertTriangle, ArrowLeft, ArrowRight, FileSpreadsheet, FileText, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createSession, generateContract, getJob, inspectFiles, uploadFile, validateMapping } from './api'
import { ConfirmPanel } from './components/ConfirmPanel'
import { FileDropzone } from './components/FileDropzone'
import { MappingWorkspace } from './components/MappingWorkspace'
import { ResultPanel } from './components/ResultPanel'
import { StepRail } from './components/StepRail'
import { isMappingProfile, mappingProfileKey } from './profile'
import type {
  FileKind,
  Inspection,
  JobInfo,
  MappingItem,
  MappingProfile,
  OrderSheet,
  SessionInfo,
  UploadInfo,
  ValidationResult,
} from './types'

function App() {
  const [step, setStep] = useState(1)
  const [session, setSession] = useState<SessionInfo>()
  const [order, setOrder] = useState<UploadInfo>()
  const [template, setTemplate] = useState<UploadInfo>()
  const [inspection, setInspection] = useState<Inspection>()
  const [orderSheetName, setOrderSheetName] = useState('')
  const [templateSheetName, setTemplateSheetName] = useState('')
  const [mappings, setMappings] = useState<MappingItem[]>([])
  const [validation, setValidation] = useState<ValidationResult>()
  const [outputName, setOutputName] = useState('')
  const [warningsConfirmed, setWarningsConfirmed] = useState(false)
  const [job, setJob] = useState<JobInfo>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const currentOrderSheet = useMemo<OrderSheet | undefined>(
    () => inspection?.order.sheets.find((sheet) => sheet.name === orderSheetName),
    [inspection, orderSheetName],
  )

  const ensureSession = useCallback(async () => {
    if (session) return session
    const created = await createSession()
    setSession(created)
    return created
  }, [session])

  const handleUpload = async (kind: FileKind, file: File) => {
    setBusy(true)
    setMessage('')
    try {
      const activeSession = await ensureSession()
      const info = await uploadFile(activeSession, kind, file)
      if (kind === 'order') {
        setOrder(info)
        setInspection(undefined)
        setMappings([])
      } else {
        setTemplate(info)
        setInspection(undefined)
        setMappings([])
      }
      setMessage(`${info.filename} 上传完成`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }

  const inspect = async (selectedTemplateSheet?: string) => {
    if (!session || !order || !template) return
    setBusy(true)
    setMessage('')
    try {
      const result = await inspectFiles(session, orderSheetName || undefined, selectedTemplateSheet || undefined)
      setInspection(result)
      const selectedOrder = orderSheetName || result.order.sheets[0]?.name || ''
      const selectedTemplate = selectedTemplateSheet || result.template.selected_sheet || result.template.sheets[0] || ''
      setOrderSheetName(selectedOrder)
      setTemplateSheetName(selectedTemplate)
      const saved = localStorage.getItem(mappingProfileKey(result.template.fingerprint))
      if (saved) {
        try {
          const profile: unknown = JSON.parse(saved)
          if (isMappingProfile(profile) && profile.template_fingerprint === result.template.fingerprint) {
            setMappings(profile.items)
            setMessage(`已载入本机保存的 ${profile.items.length} 条映射`)
          }
        } catch {
          localStorage.removeItem(mappingProfileKey(result.template.fingerprint))
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '文件解析失败')
    } finally {
      setBusy(false)
    }
  }

  const enterConfirmation = async () => {
    if (!session || !inspection || !currentOrderSheet) return
    setBusy(true)
    setValidation(undefined)
    try {
      const payload = {
        order_sheet: currentOrderSheet.name,
        template_sheet: templateSheetName || undefined,
        items: mappings,
      }
      const result = await validateMapping(session, payload)
      setValidation(result)
      const profile: MappingProfile = {
        version: 1,
        template_fingerprint: inspection.template.fingerprint,
        template_sheet: templateSheetName || undefined,
        order_sheet: currentOrderSheet.name,
        items: mappings,
      }
      localStorage.setItem(mappingProfileKey(inspection.template.fingerprint), JSON.stringify(profile))
      setStep(4)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '映射检查失败')
    } finally {
      setBusy(false)
    }
  }

  const startGeneration = async () => {
    if (!session || !currentOrderSheet) return
    setBusy(true)
    try {
      const created = await generateContract(session, {
        order_sheet: currentOrderSheet.name,
        template_sheet: templateSheetName || undefined,
        items: mappings,
        output_name: outputName,
        warnings_confirmed: warningsConfirmed,
      })
      setJob(created)
      setStep(5)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '生成请求失败')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!session || !job || !['queued', 'running'].includes(job.status)) return
    const timer = window.setInterval(() => {
      void getJob(session, job.id)
        .then(setJob)
        .catch((error: unknown) => setMessage(error instanceof Error ? error.message : '生成状态读取失败'))
    }, 1500)
    return () => window.clearInterval(timer)
  }, [job, session])

  const reset = () => {
    setStep(1)
    setSession(undefined)
    setOrder(undefined)
    setTemplate(undefined)
    setInspection(undefined)
    setOrderSheetName('')
    setTemplateSheetName('')
    setMappings([])
    setValidation(undefined)
    setOutputName('')
    setWarningsConfirmed(false)
    setJob(undefined)
    setMessage('')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><FileText size={21} /><span>合同生成</span></div>
        <div className="header-meta"><ShieldCheck size={16} /><span>原模板只读 · 文件30分钟后删除</span></div>
      </header>

      <div className="http-warning">
        <AlertTriangle size={17} />
        <span>当前为公网 HTTP 访问，请勿在不可信网络上传敏感合同。</span>
      </div>

      <StepRail current={step} />

      <main className="main-content">
        {message ? <div className="toast" role="status">{message}<button onClick={() => setMessage('')}>关闭</button></div> : null}

        {step === 1 ? (
          <section className="content-section upload-section">
            <SectionHeading index="01" title="上传订单明细" description="系统只读取表头和订单数据，不会修改上传文件。" />
            <FileDropzone
              kind="order"
              accept=".xlsx,.xls"
              title="拖入需要打印的订单明细"
              description="支持 XLSX、XLS，文件最大20MB"
              info={order}
              busy={busy}
              onSelect={(file) => handleUpload('order', file)}
            />
            <div className="footer-actions end">
              <button className="button primary" type="button" disabled={!order || busy} onClick={() => setStep(2)}>
                下一步：上传合同模板 <ArrowRight size={17} />
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="content-section upload-section">
            <SectionHeading index="02" title="上传合同模板" description="原模板保持不变，系统只在临时副本中填充内容。" />
            <FileDropzone
              kind="template"
              accept=".docx,.xlsx,.xls"
              title="拖入合同模板"
              description="支持 DOCX、XLSX、XLS，文件最大30MB"
              info={template}
              busy={busy}
              onSelect={(file) => handleUpload('template', file)}
            />
            {inspection ? (
              <div className="sheet-selectors">
                <label>订单数据 Sheet
                  <select value={orderSheetName} onChange={(event) => setOrderSheetName(event.target.value)}>
                    {inspection.order.sheets.map((sheet) => <option key={sheet.name}>{sheet.name}</option>)}
                  </select>
                </label>
                {inspection.template.sheets.length ? (
                  <label>合同模板 Sheet
                    <select
                      value={templateSheetName}
                      onChange={(event) => {
                        setTemplateSheetName(event.target.value)
                        void inspect(event.target.value)
                      }}
                    >
                      {inspection.template.sheets.map((sheet) => <option key={sheet}>{sheet}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
            <div className="footer-actions">
              <button className="button secondary" type="button" onClick={() => setStep(1)}><ArrowLeft size={17} />返回</button>
              {!inspection ? (
                <button className="button primary" type="button" disabled={!template || busy} onClick={() => void inspect()}>
                  解析两个文件 <ArrowRight size={17} />
                </button>
              ) : (
                <button className="button primary" type="button" disabled={busy || !!inspection.template.blocking_errors.length} onClick={() => setStep(3)}>
                  开始字段映射 <ArrowRight size={17} />
                </button>
              )}
            </div>
            {inspection?.template.blocking_errors.map((error) => <div className="issue-box error" key={error}>{error}</div>)}
          </section>
        ) : null}

        {step === 3 && inspection && currentOrderSheet ? (
          <MappingWorkspace
            orderSheet={currentOrderSheet}
            template={inspection.template}
            templateSheet={templateSheetName || undefined}
            items={mappings}
            onChange={setMappings}
            onBack={() => setStep(2)}
            onContinue={() => void enterConfirmation()}
            onMessage={setMessage}
          />
        ) : null}

        {step === 4 && order && template && inspection && currentOrderSheet ? (
          <ConfirmPanel
            orderFilename={order.filename}
            templateFilename={template.filename}
            orderSheet={currentOrderSheet}
            template={inspection.template}
            templateSheet={templateSheetName || undefined}
            items={mappings}
            validation={validation}
            validating={busy}
            outputName={outputName}
            warningsConfirmed={warningsConfirmed}
            onOutputName={setOutputName}
            onWarningsConfirmed={setWarningsConfirmed}
            onBack={() => setStep(3)}
            onGenerate={() => void startGeneration()}
          />
        ) : null}

        {step === 5 && session && job ? (
          <ResultPanel session={session} job={job} onRestart={reset} onMessage={setMessage} />
        ) : null}
      </main>

      <footer className="site-footer">
        <span>合同生成</span>
        <span>上传文件仅用于本次生成，服务器不保留历史合同。</span>
      </footer>
    </div>
  )
}

function SectionHeading({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <div className="section-heading">
      <div>
        <span className="section-index">{index}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {index === '01' ? <FileSpreadsheet className="heading-icon" /> : <FileText className="heading-icon" />}
    </div>
  )
}

export default App
