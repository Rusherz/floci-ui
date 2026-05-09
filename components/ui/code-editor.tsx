'use client';

import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';

import { cn } from '@/lib/utils';

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  path?: string;
  readOnly?: boolean;
  className?: string;
  height?: string;
  minHeight?: string;
  maxHeight?: string;
};

function extensionsForPath(path: string) {
  if (/\.(json)$/i.test(path)) return [json()];
  if (/\.(md|markdown)$/i.test(path)) return [markdown()];
  if (/\.(py)$/i.test(path)) return [python()];
  if (/\.(yml|yaml)$/i.test(path)) return [yaml()];
  if (/\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(path)) return [javascript({ jsx: true, typescript: true })];
  return [javascript({ jsx: true, typescript: true })];
}

export function CodeEditor({ value, onChange, path, readOnly, className, height, minHeight, maxHeight }: CodeEditorProps) {
  const extensions = useMemo(() => extensionsForPath(path || ''), [path]);
  const heightStyle = {
    height: height || 'auto',
    minHeight: minHeight || 'auto',
    maxHeight: maxHeight || 'none',
  };

  return (
    <div className={cn('overflow-hidden rounded-md border', className)}>
      <CodeMirror
        value={value}
        onChange={onChange}
        height={height}
        extensions={extensions}
        theme={oneDark}
        editable={!readOnly}
        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
        className='text-sm [&_.cm-editor]:h-full [&_.cm-editor]:bg-slate-900 [&_.cm-scroller]:overflow-auto [&_.cm-scroller]:bg-slate-900 [&_.cm-content]:bg-slate-900 [&_.cm-gutters]:bg-slate-900'
        style={heightStyle}
      />
    </div>
  );
}
