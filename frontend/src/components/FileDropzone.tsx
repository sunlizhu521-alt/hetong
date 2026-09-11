import { FileCheck2, FileUp, LoaderCircle, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import type { FileKind, UploadInfo } from '../types'

interface FileDropzoneProps {
  kind: FileKind
  accept: string
  title: string
  description: string
  info?: UploadInfo
  busy: boolean
  onSelect: (file: File) => Promise<void>
}

export function FileDropzone({ kind, accept, title, description, info, busy, onSelect }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const select = async (files: FileList | null) => {
    const file = files?.[0]
    if (file) await onSelect(file)
  }

  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''} ${info ? 'has-file' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        void select(event.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        aria-label={title}
        type="file"
        accept={accept}
        disabled={busy}
        onChange={(event) => void select(event.target.files)}
      />
      <div className="dropzone-icon">
        {busy ? <LoaderCircle className="spin" /> : info ? <FileCheck2 /> : <UploadCloud />}
      </div>
      {info ? (
        <>
          <h3>{info.filename}</h3>
          <p>{(info.size / 1024 / 1024).toFixed(2)} MB · 已完成安全校验</p>
          <button className="button secondary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            <FileUp size={16} /> 重新选择
          </button>
        </>
      ) : (
        <>
          <h3>{title}</h3>
          <p>{description}</p>
          <button className="button primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            <FileUp size={16} /> 选择文件
          </button>
        </>
      )}
      <span className="dropzone-kind">{kind === 'order' ? '订单文件' : '只读模板副本'}</span>
    </div>
  )
}
