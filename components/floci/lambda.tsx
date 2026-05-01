'use client';

import { type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';

import { BoundedTextarea } from '@/components/floci/bounded-textarea';
import { CreateResourceDialog } from '@/components/floci/create-resource-dialog';
import { ServicePanelColumn } from '@/components/floci/service-panel-column';
import { ScrollableCodeBlock } from '@/components/floci/scrollable-code-block';
import { ServiceShell } from '@/components/floci/service-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createApiClient } from '@/lib/floci/api';
import { createApiConfig } from '@/lib/floci/config';
import type { LambdaFunctionSummary } from '@/lib/floci/types';
import { cn } from '@/lib/utils';

type EditorEntry = {
  path: string;
  isText: boolean;
  text: string;
  data: Uint8Array;
};

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function isTextPath(path: string): boolean {
  return /\.(js|ts|tsx|json|py|txt|md|yml|yaml|sh)$/i.test(path);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function isWordBoundary(value: string): boolean {
  return !/[A-Za-z0-9_$]/.test(value);
}

function highlightCode(code: string, path: string): string {
  const isJson = /\.json$/i.test(path);
  const jsKeywords = new Set([
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'async',
    'await',
    'export',
    'import',
    'class',
    'new',
    'try',
    'catch',
    'throw',
  ]);
  const out: string[] = [];
  let i = 0;

  while (i < code.length) {
    const ch = code[i];

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let escaped = false;
      while (j < code.length) {
        const cj = code[j];
        if (!escaped && cj === quote) {
          j += 1;
          break;
        }
        if (escaped) {
          escaped = false;
        } else if (cj === '\\') {
          escaped = true;
        }
        j += 1;
      }
      out.push(`<span class="text-emerald-300">${escapeHtml(code.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < code.length && /[0-9._]/.test(code[j])) j += 1;
      out.push(`<span class="text-sky-300">${escapeHtml(code.slice(i, j))}</span>`);
      i = j;
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < code.length && /[A-Za-z0-9_$]/.test(code[j])) j += 1;
      const word = code.slice(i, j);
      const prev = i > 0 ? code[i - 1] : ' ';
      const next = j < code.length ? code[j] : ' ';
      const boundary = isWordBoundary(prev) && isWordBoundary(next);

      if (boundary && (word === 'true' || word === 'false' || word === 'null')) {
        out.push(`<span class="text-amber-300">${word}</span>`);
      } else if (!isJson && boundary && jsKeywords.has(word)) {
        out.push(`<span class="text-violet-300">${word}</span>`);
      } else {
        out.push(escapeHtml(word));
      }
      i = j;
      continue;
    }

    out.push(escapeHtml(ch));
    i += 1;
  }

  return out.join('');
}

export default function LambdaPage() {
  const api = useMemo(() => createApiClient(createApiConfig()), []);

  const [functions, setFunctions] = useState<LambdaFunctionSummary[]>([]);
  const [selectedFunctionName, setSelectedFunctionName] = useState('');
  const [search, setSearch] = useState('');
  const [payload, setPayload] = useState('{\n  "ping": true\n}');
  const [invokeOutput, setInvokeOutput] = useState<unknown>(null);
  const [invokeLogs, setInvokeLogs] = useState('');
  const [status, setStatus] = useState<{ type: 'info' | 'error' | null; message: string }>({ type: null, message: '' });
  const [loading, setLoading] = useState(false);
  const [invoking, setInvoking] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [runtime, setRuntime] = useState('nodejs18.x');
  const [handler, setHandler] = useState('index.handler');
  const [roleArn, setRoleArn] = useState('arn:aws:iam::000000000000:role/lambda-role');
  const [createZipFile, setCreateZipFile] = useState<File | null>(null);

  const [mode, setMode] = useState<'invoke' | 'edit'>('invoke');
  const [entries, setEntries] = useState<EditorEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [editorValue, setEditorValue] = useState('');
  const [editorError, setEditorError] = useState('');
  const [savingCode, setSavingCode] = useState(false);
  const [loadingCode, setLoadingCode] = useState(false);
  const editorPreviewRef = useRef<HTMLPreElement | null>(null);

  const loadFunctions = useCallback(async () => {
    setLoading(true);
    try {
      const nextFunctions = await api.listLambdaFunctions();
      setFunctions(nextFunctions);
      setSelectedFunctionName((current) => {
        if (current && nextFunctions.some((fn) => fn.name === current)) {
          return current;
        }
        return nextFunctions[0]?.name || '';
      });
      setStatus({ type: 'info', message: `Loaded ${nextFunctions.length} function(s).` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load Lambda functions' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadFunctions();
  }, [loadFunctions]);

  const filteredFunctions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return functions;
    return functions.filter((fn) => fn.name.toLowerCase().includes(query));
  }, [functions, search]);

  const selectedFunction = functions.find((fn) => fn.name === selectedFunctionName) || null;

  const invokeSelected = useCallback(async () => {
    if (!selectedFunctionName) {
      setStatus({ type: 'error', message: 'Select a function first.' });
      return;
    }

    try {
      JSON.parse(payload);
    } catch {
      setStatus({ type: 'error', message: 'Payload must be valid JSON.' });
      return;
    }

    setInvoking(true);
    try {
      const result = await api.invokeLambda(selectedFunctionName, payload);
      let logsText = result.logs || '';

      if (!logsText) {
        try {
          const logGroupName = `/aws/lambda/${selectedFunctionName}`;
          for (let attempt = 0; attempt < 4 && !logsText; attempt += 1) {
            if (attempt > 0) {
              await new Promise((resolve) => window.setTimeout(resolve, 250));
            }

            const fallbackEvents = await api.filterLogEvents(logGroupName, '');
            const sorted = [...fallbackEvents].sort((a, b) => b.timestamp - a.timestamp).slice(0, 40);
            const matched = result.requestId
              ? sorted.filter((event) => event.message.includes(result.requestId))
              : sorted;
            const finalEvents = matched.length ? matched : sorted.slice(0, 10);

            if (finalEvents.length) {
              logsText = finalEvents
                .map((event) => `[${new Date(event.timestamp).toISOString()}] ${event.message}`)
                .join('\n');
            }
          }
        } catch {
          // Keep invoke successful even if log fallback is unavailable.
        }
      }

      setInvokeOutput({
        statusCode: result.statusCode,
        functionError: result.functionError,
        result: result.result,
      });
      setInvokeLogs(logsText || 'No logs returned.');
      setStatus({ type: result.functionError ? 'error' : 'info', message: result.functionError ? `Invocation returned function error: ${result.functionError}` : 'Invocation completed successfully.' });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to invoke function' });
    } finally {
      setInvoking(false);
    }
  }, [api, payload, selectedFunctionName]);

  const loadZipToEditor = useCallback(async (buffer: ArrayBuffer) => {
    const zip = await JSZip.loadAsync(buffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const nextEntries: EditorEntry[] = [];

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const data = await entry.async('uint8array');
      const textMode = isTextPath(path);
      nextEntries.push({
        path,
        isText: textMode,
        text: textMode ? decoder.decode(data) : '',
        data,
      });
    }

    nextEntries.sort((a, b) => a.path.localeCompare(b.path));
    setEntries(nextEntries);

    const firstText = nextEntries.find((entry) => entry.isText) || nextEntries[0] || null;
    if (firstText) {
      setSelectedPath(firstText.path);
      setEditorValue(firstText.isText ? firstText.text : '// Binary file selected.');
    } else {
      setSelectedPath('');
      setEditorValue('');
    }
  }, []);

  const handleEditorZipUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      await loadZipToEditor(await file.arrayBuffer());
      setEditorError('');
      setStatus({ type: 'info', message: `Loaded ${file.name} into editor.` });
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Failed to parse zip file');
    }
  }, [loadZipToEditor]);

  const loadDeployedCode = useCallback(async () => {
    if (!selectedFunctionName) return;
    setLoadingCode(true);
    setEditorError('');
    try {
      try {
        const zipBytes = await api.getLambdaFunctionCodeZip(selectedFunctionName);
        const copied = new Uint8Array(zipBytes);
        await loadZipToEditor(copied.buffer as ArrayBuffer);
        setStatus({ type: 'info', message: `Loaded deployed code for ${selectedFunctionName}.` });
      } catch {
        const sourceEntries = await api.getLambdaFunctionSourceFiles(selectedFunctionName);
        const nextEntries: EditorEntry[] = sourceEntries.map((entry) => ({
          path: entry.path,
          isText: true,
          text: entry.text,
          data: new TextEncoder().encode(entry.text),
        }));
        setEntries(nextEntries);
        const first = nextEntries[0];
        setSelectedPath(first?.path || '');
        setEditorValue(first?.text || '');
        setStatus({ type: 'info', message: `Loaded local source for ${selectedFunctionName}.` });
      }
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Failed to load deployed code');
    } finally {
      setLoadingCode(false);
    }
  }, [api, loadZipToEditor, selectedFunctionName]);

  const selectEntry = useCallback((path: string) => {
    const entry = entries.find((item) => item.path === path);
    if (!entry) return;
    setSelectedPath(path);
    setEditorValue(entry.isText ? entry.text : '// Binary file selected.');
  }, [entries]);

  const applyEditorValueToEntry = useCallback(() => {
    if (!selectedPath) return;
    setEntries((current) =>
      current.map((entry) => {
        if (entry.path !== selectedPath || !entry.isText) return entry;
        return { ...entry, text: editorValue };
      })
    );
  }, [editorValue, selectedPath]);

  const saveFunctionCode = useCallback(async () => {
    if (!selectedFunctionName) {
      setEditorError('Select a function first.');
      return;
    }

    setSavingCode(true);
    setEditorError('');
    try {
      const zip = new JSZip();
      for (const entry of entries) {
        if (entry.isText) {
          zip.file(entry.path, entry.path === selectedPath ? editorValue : entry.text);
        } else {
          zip.file(entry.path, entry.data);
        }
      }

      const bytes = await zip.generateAsync({ type: 'uint8array' });
      await api.updateLambdaFunctionCode(selectedFunctionName, toBase64(bytes));
      setStatus({ type: 'info', message: `Updated code for ${selectedFunctionName}.` });
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Failed to update function code');
    } finally {
      setSavingCode(false);
    }
  }, [api, editorValue, entries, selectedFunctionName, selectedPath]);

  const createFunction = useCallback(
    async (nameRaw: string) => {
      const name = nameRaw.trim();
      if (!name) {
        setCreateError('Function name is required.');
        return;
      }
      if (!roleArn.trim()) {
        setCreateError('Role ARN is required.');
        return;
      }
      if (!createZipFile) {
        setCreateError('ZIP file is required.');
        return;
      }
      setCreateError('');
      setCreating(true);
      try {
        const zipBytes = new Uint8Array(await createZipFile.arrayBuffer());
        await api.createLambdaFunction(name, roleArn.trim(), toBase64(zipBytes), runtime.trim(), handler.trim());
        await loadFunctions();
        setSelectedFunctionName(name);
        setCreateOpen(false);
        setCreateZipFile(null);
        setStatus({ type: 'info', message: `Created function ${name}.` });
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Failed to create function');
      } finally {
        setCreating(false);
      }
    },
    [api, createZipFile, handler, loadFunctions, roleArn, runtime]
  );

  const highlighted = useMemo(() => {
    return highlightCode(editorValue, selectedPath || 'index.js');
  }, [editorValue, selectedPath]);

  const syncEditorPreviewScroll = useCallback((event: UIEvent<HTMLTextAreaElement>) => {
    const preview = editorPreviewRef.current;
    if (!preview) return;
    preview.scrollTop = event.currentTarget.scrollTop;
    preview.scrollLeft = event.currentTarget.scrollLeft;
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || !selectedFunctionName) return;
    void loadDeployedCode();
  }, [loadDeployedCode, mode, selectedFunctionName]);

  return (
    <ServiceShell
      activeSlug='lambda'
      title='Lambda'
      description='Function list, invoke, and code editor workflows.'
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder='Search functions...'
      onRefresh={() => void loadFunctions()}
      refreshDisabled={loading}
      status={status}
    >
      <Card className='min-h-0 min-w-0 rounded-md shadow-none xl:flex xl:h-full xl:flex-col xl:overflow-hidden'>
        <CardHeader>
          <div className='flex items-center justify-between gap-2'>
            <CardTitle className='text-base'>Functions ({filteredFunctions.length})</CardTitle>
            <Button size='sm' onClick={() => setCreateOpen(true)}>
              Create Function
            </Button>
          </div>
        </CardHeader>
        <CardContent className='xl:min-h-0 xl:flex-1'>
          {!filteredFunctions.length ? (
            <p className='text-sm text-muted-foreground'>No functions found.</p>
          ) : (
            <div className='flex max-h-[560px] flex-col gap-2 overflow-auto pr-1 xl:h-full xl:max-h-none xl:min-h-0'>
              {filteredFunctions.map((fn) => {
                const active = fn.name === selectedFunctionName;
                return (
                  <button
                    key={fn.arn || fn.name}
                    type='button'
                    onClick={() => setSelectedFunctionName(fn.name)}
                    className={cn('w-full rounded-md border px-3 py-2 text-left text-sm transition', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-accent')}
                  >
                    <div className='truncate font-medium'>{fn.name}</div>
                    <p className={cn('mt-1 truncate text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{fn.runtime}</p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ServicePanelColumn rowsClassName={mode === 'invoke' ? 'lg:grid-rows-[minmax(0,1fr)_auto_auto]' : 'lg:grid-rows-[minmax(0,1fr)]'}>
        {mode === 'invoke' ? (
          <>
            <Card className='min-h-[320px] min-w-0 rounded-md shadow-none lg:flex lg:h-full lg:flex-col lg:overflow-hidden'>
              <CardHeader>
                <div className='flex items-center justify-between gap-2'>
                  <CardTitle className='text-base'>Invoke</CardTitle>
                  <div className='flex gap-2'>
                    <Button variant='outline' size='sm' onClick={() => setMode('edit')} disabled={!selectedFunctionName}>Edit</Button>
                    <Button size='sm' onClick={() => void invokeSelected()} disabled={invoking || !selectedFunctionName}>
                      {invoking ? 'Invoking...' : 'Invoke'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='grid min-h-0 gap-3 lg:flex-1 lg:grid-rows-[auto_minmax(160px,1fr)]'>
                <div className='rounded-md border bg-muted p-3 text-xs text-muted-foreground'>
                  {selectedFunction ? `${selectedFunction.name} | ${selectedFunction.runtime} | ${selectedFunction.handler}` : 'Select a function.'}
                </div>
                <BoundedTextarea
                  value={payload}
                  onChange={(event) => setPayload(event.target.value)}
                  className='font-mono'
                  minHeightClassName='min-h-[140px]'
                  maxHeightClassName='max-h-[38vh]'
                  placeholder='JSON payload'
                />
              </CardContent>
            </Card>

            <Card className='min-h-[220px] min-w-0 rounded-md shadow-none lg:flex lg:flex-col'>
              <CardHeader>
                <CardTitle className='text-base'>Invocation Result</CardTitle>
              </CardHeader>
              <CardContent className='min-h-0 lg:flex-1'>
                <ScrollableCodeBlock content={invokeOutput ? JSON.stringify(invokeOutput, null, 2) : 'Invoke a function to view output.'} fillContainer />
              </CardContent>
            </Card>

            <Card className='min-h-[180px] min-w-0 rounded-md shadow-none lg:flex lg:flex-col'>
              <CardHeader>
                <CardTitle className='text-base'>Logs</CardTitle>
              </CardHeader>
              <CardContent className='min-h-0 lg:flex-1'>
                <ScrollableCodeBlock content={invokeLogs || 'Invoke a function to view log output.'} fillContainer />
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className='min-h-[520px] min-w-0 rounded-md shadow-none lg:flex lg:h-full lg:flex-col lg:overflow-hidden'>
            <CardHeader>
              <div className='flex items-center justify-between gap-2'>
                <CardTitle className='text-base'>Function Editor</CardTitle>
                <div className='flex gap-2'>
                  <Input
                    type='file'
                    accept='.zip,application/zip'
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      void handleEditorZipUpload(file);
                    }}
                    className='max-w-[260px]'
                  />
                  <Button variant='outline' size='sm' onClick={() => void loadDeployedCode()} disabled={loadingCode || !selectedFunctionName}>
                    {loadingCode ? 'Loading...' : 'Reload Deployed'}
                  </Button>
                  <Button variant='outline' size='sm' onClick={() => setMode('invoke')}>Back to Invoke</Button>
                  <Button size='sm' onClick={() => { applyEditorValueToEntry(); void saveFunctionCode(); }} disabled={savingCode || !selectedFunctionName || !entries.length}>
                    {savingCode ? 'Saving...' : 'Save Code'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className='grid min-h-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]'>
              <div className='min-h-0 rounded-md border p-2'>
                <p className='mb-2 text-xs font-medium text-muted-foreground'>Files</p>
                {!entries.length ? (
                  <p className='text-xs text-muted-foreground'>Upload a function ZIP to edit.</p>
                ) : (
                  <div className='max-h-[60vh] space-y-1 overflow-auto pr-1'>
                    {entries.map((entry) => (
                      <button
                        key={entry.path}
                        type='button'
                        onClick={() => selectEntry(entry.path)}
                        className={cn('w-full truncate rounded px-2 py-1 text-left text-xs', entry.path === selectedPath ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
                      >
                        {entry.path}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className='flex min-h-0 flex-col rounded-md border p-3'>
                <div className='relative min-h-0 flex-1 overflow-hidden rounded-md border bg-slate-950/70'>
                  <pre
                    aria-hidden='true'
                    ref={editorPreviewRef}
                    className='pointer-events-none h-full overflow-auto p-3 font-mono text-sm leading-6 text-slate-100'
                  >
                    <code dangerouslySetInnerHTML={{ __html: highlighted + '\n' }} />
                  </pre>
                  <Textarea
                    value={editorValue}
                    onChange={(event) => setEditorValue(event.target.value)}
                    onBlur={applyEditorValueToEntry}
                    onScroll={syncEditorPreviewScroll}
                    disabled={!selectedPath || !entries.find((entry) => entry.path === selectedPath)?.isText}
                    className='absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent p-3 font-mono text-sm leading-6 text-transparent caret-slate-100 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0'
                    spellCheck={false}
                  />
                </div>
                {editorError ? <p className='mt-2 text-xs text-destructive'>{editorError}</p> : null}
              </div>
            </CardContent>
          </Card>
        )}
      </ServicePanelColumn>

      <CreateResourceDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError('');
        }}
        title='Create Lambda Function'
        description='Create requires uploading a ZIP package containing function code.'
        label='Function Name'
        placeholder='pong'
        confirmLabel='Create Function'
        submitting={creating}
        errorMessage={createError}
        submitDisabled={!createZipFile}
        onSubmit={createFunction}
      >
        <div className='grid gap-2 rounded-md border p-3'>
          <div className='grid gap-1 sm:grid-cols-2 sm:gap-2'>
            <div className='grid gap-1'>
              <p className='text-xs text-muted-foreground'>Runtime</p>
              <Input value={runtime} onChange={(event) => setRuntime(event.target.value)} />
            </div>
            <div className='grid gap-1'>
              <p className='text-xs text-muted-foreground'>Handler</p>
              <Input value={handler} onChange={(event) => setHandler(event.target.value)} />
            </div>
          </div>
          <div className='grid gap-1'>
            <p className='text-xs text-muted-foreground'>Role ARN</p>
            <Input value={roleArn} onChange={(event) => setRoleArn(event.target.value)} />
          </div>
          <div className='grid gap-1'>
            <p className='text-xs text-muted-foreground'>Code ZIP (required)</p>
            <Input
              type='file'
              accept='.zip,application/zip'
              onChange={(event) => setCreateZipFile(event.target.files?.[0] || null)}
            />
          </div>
        </div>
      </CreateResourceDialog>
    </ServiceShell>
  );
}
