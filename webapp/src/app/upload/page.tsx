'use client';

import { useState } from 'react';
import Link from 'next/link';

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
      return `Demasiados archivos (${fileList.length}). Máximo ${MAX_FILES}.`;
    }
    for (let i = 0; i < fileList.length; i++) {
      if (fileList[i].size > MAX_FILE_SIZE_BYTES) {
        return `El archivo "${fileList[i].name}" supera 2 MB (${(fileList[i].size / 1024 / 1024).toFixed(2)} MB).`;
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
      setMessage({ type: 'error', text: 'Elige al menos un archivo.' });
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
          text: `${data.written ?? 0} archivos enviados al KB. El supervisor los indexará en el próximo ciclo.`,
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
          text: `${data.written ?? 0} archivos enviados. El supervisor los indexará en el próximo ciclo.`,
        });
      }
      setFiles(null);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error al subir' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Subir al Knowledge Hub</h1>
      <p>Enviar archivos al índice (inbox) o al KB (Knowledge Base, persistente).</p>
      <p style={{ marginBottom: 24 }}>
        <Link href="/" style={{ color: '#0066cc' }}>← Volver a búsqueda</Link>
        {' · '}
        <Link href="/files" style={{ color: '#0066cc' }}>Explorador de archivos</Link>
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Destino</label>
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value as Destination)}
            style={{ padding: 8, fontSize: 16, minWidth: 200 }}
          >
            <option value="kb">KB (Knowledge Base, persistente)</option>
            <option value="inbox">Inbox (indexar y borrar)</option>
          </select>
        </div>

        {destination === 'kb' && (
          <>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Usuario (opcional)</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="local"
                style={{ padding: 8, fontSize: 16, width: '100%', maxWidth: 300 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Proyecto (recomendado)</label>
              <input
                type="text"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="nombre del proyecto"
                style={{ padding: 8, fontSize: 16, width: '100%', maxWidth: 300 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Origen (opcional)</label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="ia_conversation o webapp_upload"
                style={{ padding: 8, fontSize: 16, width: '100%', maxWidth: 300 }}
              />
            </div>
          </>
        )}

        {destination === 'inbox' && (
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>Proyecto / carpeta en inbox (opcional)</label>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="nombre de subcarpeta"
              style={{ padding: 8, fontSize: 16, width: '100%', maxWidth: 300 }}
            />
          </div>
        )}

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Archivos</label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={useFolder} onChange={(e) => setUseFolder(e.target.checked)} />
              Subir carpeta completa
            </label>
          </div>
          {!useFolder && (
            <input
              type="file"
              multiple
              accept={destination === 'kb' ? '.md' : undefined}
              onChange={(e) => onFilesChange(e.target.files)}
              style={{ padding: 8, marginTop: 8 }}
            />
          )}
          {useFolder && (
            <input
              type="file"
              multiple
              {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) => onFilesChange(e.target.files)}
              style={{ padding: 8, marginTop: 8 }}
            />
          )}
          {files && files.length > 0 && (
            <p style={{ marginTop: 4, fontSize: 14, color: '#666' }}>{files.length} archivo(s) seleccionado(s)</p>
          )}
          {validationWarning && (
            <p style={{ marginTop: 8, fontSize: 14, color: '#c00' }}>{validationWarning}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !!validationWarning}
          style={{ padding: '10px 20px', fontSize: 16, alignSelf: 'flex-start' }}
        >
          {loading ? 'Subiendo...' : 'Subir'}
        </button>
      </form>

      {message && (
        <p
          style={{
            marginTop: 24,
            padding: 12,
            borderRadius: 8,
            backgroundColor: message.type === 'success' ? '#e6f7e6' : '#ffe6e6',
            color: message.type === 'success' ? '#0a0' : '#c00',
          }}
        >
          {message.text}
        </p>
      )}
    </main>
  );
}
