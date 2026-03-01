'use client';

import { useState } from 'react';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_FILES = 50;

type Destination = 'kb' | 'inbox';

export default function UploadPage() {
  const [destination, setDestination] = useState<Destination>('kb');
  const [files, setFiles] = useState<FileList | null>(null);
  const [project, setProject] = useState('');
  const [userId, setUserId] = useState('local');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [useFolder, setUseFolder] = useState(false);

  function validateFiles(fileList: FileList | null): string | null {
    if (!fileList || fileList.length === 0) return null;
    if (fileList.length > MAX_FILES) {
      return `Too many files (${fileList.length}). Maximum ${MAX_FILES}.`;
    }
    for (let i = 0; i < fileList.length; i++) {
      if (fileList[i].size > MAX_FILE_SIZE_BYTES) {
        return `The file "${fileList[i].name}" exceeds 2 MB (${(fileList[i].size / 1024 / 1024).toFixed(2)} MB).`;
      }
    }
    return null;
  }

  function onFilesChange(fileList: FileList | null) {
    setFiles(fileList);
    setValidationWarning(validateFiles(fileList) ?? null);
  }

  const baseUrl = GATEWAY_URL ? `${GATEWAY_URL.replace(/\/$/, '')}` : '';
  const inboxUploadUrl = baseUrl ? `${baseUrl}/inbox/upload` : '/api/inbox/upload';
  const kbUploadUrl = baseUrl ? `${baseUrl}/kb/upload` : '/api/kb/upload';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one file.' });
      return;
    }
    const warn = validateFiles(files);
    if (warn) {
      setMessage({ type: 'error', text: warn });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('file', files[i]);
      }
      if (destination === 'kb') {
        formData.append('userId', userId || 'local');
        formData.append('project', project);
        if (source) formData.append('source', source);
        const res = await fetch(kbUploadUrl, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) {
          setMessage({ type: 'error', text: data.error || `Error ${res.status}` });
          return;
        }
        setMessage({
          type: 'success',
          text: `${data.written ?? 0} file(s) sent to KB. The supervisor will index them in the next cycle.`,
        });
      } else {
        if (project) formData.append('project', project);
        const res = await fetch(inboxUploadUrl, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) {
          setMessage({ type: 'error', text: data.error || `Error ${res.status}` });
          return;
        }
        setMessage({
          type: 'success',
          text: `${data.written ?? 0} file(s) sent. The supervisor will index them in the next cycle.`,
        });
      }
      setFiles(null);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error uploading' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1 className="pageTitle">Upload</h1>
      <p className="pageSubtitle">Send files to the index (inbox) or to the KB (persistent).</p>

      <div className="panel">
        <div className="panelInner">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Destination</label>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value as Destination)}
            style={{ minWidth: 220 }}
          >
            <option value="kb">KB (Knowledge Base, persistent)</option>
            <option value="inbox">Inbox (index and delete)</option>
          </select>
        </div>

        {destination === 'kb' && (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>User (optional)</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="local"
                style={{ maxWidth: 360 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Project (recommended)</label>
              <input
                type="text"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="project name"
                style={{ maxWidth: 360 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Source (optional)</label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="ia_conversation or webapp_upload"
                style={{ maxWidth: 520 }}
              />
            </div>
          </>
        )}

        {destination === 'inbox' && (
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>Project / folder in inbox (optional)</label>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="subfolder name"
              style={{ maxWidth: 360 }}
            />
          </div>
        )}

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Files</label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={useFolder} onChange={(e) => setUseFolder(e.target.checked)} />
              Upload entire folder
            </label>
          </div>
          {!useFolder && (
            <input
              type="file"
              multiple
              accept={destination === 'kb' ? '.md' : undefined}
              onChange={(e) => onFilesChange(e.target.files)}
              style={{ marginTop: 8 }}
            />
          )}
          {useFolder && (
            <input
              type="file"
              multiple
              {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) => onFilesChange(e.target.files)}
              style={{ marginTop: 8 }}
            />
          )}
          {files && files.length > 0 && (
            <p className="muted2" style={{ marginTop: 6, fontSize: 14 }}>{files.length} file(s) selected</p>
          )}
          {validationWarning && (
            <p className="dangerText" style={{ marginTop: 8, fontSize: 14 }}>{validationWarning}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !!validationWarning}
          style={{ alignSelf: 'flex-start' }}
        >
          {loading ? 'Uploading...' : 'Upload'}
        </button>
          </form>

      {message && (
        <p
          style={{
            marginTop: 24,
            padding: 12,
            borderRadius: 8,
            backgroundColor: message.type === 'success' ? 'rgba(94, 234, 212, 0.14)' : 'rgba(255, 107, 107, 0.14)',
            border: '1px solid var(--border)',
            color: message.type === 'success' ? 'var(--text)' : 'var(--danger)',
          }}
        >
          {message.text}
        </p>
      )}
        </div>
      </div>
    </main>
  );
}
