'use client';

import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
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
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, []);

  const selectionTheme = useMemo(
    () =>
      EditorView.theme({
        '&.cm-focused .cm-selectionLayer .cm-selectionBackground, & .cm-selectionLayer .cm-selectionBackground, & .cm-selectionBackground': {
          backgroundColor: `${isDark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.22)'} !important`,
        },
        '& .cm-content ::selection': {
          backgroundColor: `${isDark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.22)'} !important`,
        },
        '& .cm-line::selection, & .cm-line > span::selection, & .cm-content::selection': {
          backgroundColor: `${isDark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.22)'} !important`,
        },
      }),
    [isDark]
  );

  const extensions = useMemo(
    () => [...extensionsForPath(path || ''), ...(readOnly ? [EditorState.readOnly.of(true)] : []), selectionTheme],
    [path, readOnly, selectionTheme]
  );
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
        theme={isDark ? oneDark : undefined}
        editable
        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, highlightSelectionMatches: true }}
        className='text-sm [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto [&_.cm-editor]:bg-background [&_.cm-scroller]:bg-background [&_.cm-content]:bg-background [&_.cm-gutters]:bg-background dark:[&_.cm-editor]:bg-slate-900 dark:[&_.cm-scroller]:bg-slate-900 dark:[&_.cm-content]:bg-slate-900 dark:[&_.cm-gutters]:bg-slate-900'
        style={heightStyle}
      />
    </div>
  );
}
