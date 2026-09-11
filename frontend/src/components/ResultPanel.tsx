import { CheckCircle2, Download, FileText, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { downloadProtected, fetchProtectedBlob } from '../api'
import type { JobInfo, SessionInfo } from '../types'

interface ResultPanelProps {
  session: SessionInfo
  job: JobInfo
  onRestart: () => void
  onMessage: (message: string) => void
}

export function ResultPanel({ session, job, onRestart, onMessage }: ResultPanelProps) {
  const [previewUrls, setPreviewUrls] = useState<string[]>([])

  useEffect(() => {
    if (job.status !== 'completed') return
    let active = true
    const created: string[] = []
    void Promise.all(
      job.preview_pages.map(async (url) => {
        const blob = await fetchProtectedBlob(session, url)
        const objectUrl = URL.createObjectURL(blob)
        created.push(objectUrl)
        return objectUrl
      }),
    ).then((urls) => {
      if (active) setPreviewUrls(urls)
    }).catch((error: unknown) => onMessage(error instanceof Error ? error.message : '预览加载失败'))
    return () => {
      active = false
      created.forEach(URL.revokeObjectURL)
    }
  }, [job.preview_pages, job.status, onMessage, session])

  if (job.status !== 'completed') {
    return (
      <section className="content-section waiting-section">
        <LoaderCircle className="spin" size={42} />
        <h2>{job.status === 'failed' ? '生成失败' : '正在生成合同'}</h2>
        <p>{job.message}</p>
        {job.status === 'failed' ? <button className="button secondary" onClick={onRestart}>返回重新检查</button> : null}
      </section>
    )
  }

  return (
    <section className="content-section result-section">
      <div className="result-heading">
        <div className="success-mark"><CheckCircle2 /></div>
        <div>
          <span className="section-index">05</span>
          <h2>合同已经生成</h2>
          <p>下方预览与下载的 PDF 是同一个服务器生成文件。</p>
        </div>
        <button className="button ghost" type="button" onClick={onRestart}><RefreshCw size={16} />生成另一份</button>
      </div>

      <div className="result-layout">
        <div className="pdf-preview">
          {previewUrls.length ? previewUrls.map((url, index) => (
            <figure key={url}>
              <img src={url} alt={`合同预览第 ${index + 1} 页`} />
              <figcaption>第 {index + 1} 页</figcaption>
            </figure>
          )) : <div className="preview-loading"><LoaderCircle className="spin" />正在载入页面预览…</div>}
        </div>
        <aside className="download-panel">
          <h3>下载合同</h3>
          <p>文件将在任务创建30分钟后从服务器自动删除。</p>
          {Object.entries(job.files).map(([kind, url]) => (
            <button
              className={`download-button ${kind === 'pdf' ? 'primary-download' : ''}`}
              type="button"
              key={kind}
              onClick={() => void downloadProtected(session, url).catch((error: unknown) => onMessage(error instanceof Error ? error.message : '下载失败'))}
            >
              <FileText size={21} />
              <span><strong>{kind.toUpperCase()} 文件</strong><small>{kind === 'pdf' ? '用于打印和归档' : '可继续编辑'}</small></span>
              <Download size={18} />
            </button>
          ))}
        </aside>
      </div>
    </section>
  )
}
