'use client';
// packages/features/crud/src/components/form/fields/internal/TiptapEditor.tsx

/**
 * @fileoverview Tiptap Editor Wrapper
 * @description WYSIWYG editor using Tiptap (optional peer dependency)
 *
 * Gracefully degrades if Tiptap is not installed.
 * To enable: npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder
 *
 * Required: @tiptap/react, @tiptap/pm, @tiptap/starter-kit
 * Optional: @tiptap/extension-placeholder (for placeholder text)
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useState } from 'react';

import { Stack } from '@donotdev/components';

import type { RichTextComponentProps } from '../types';
import type { ChangeEvent, ComponentType } from 'react';

// Optional peer dependency - graceful degradation if not installed
// Use 'any' to avoid type conflicts when Tiptap is dynamically imported
type Editor = any;

/** Tiptap modules resolved after dynamic import */
interface TiptapModules {
  useEditor: any;
  EditorContent: ComponentType<any>;
  StarterKit: any;
  Placeholder: any;
}

/**
 * Inner editor component — rendered only AFTER Tiptap is loaded.
 * This ensures useEditor (a React hook) is called at the top level of a
 * component, satisfying the Rules of Hooks.
 */
const TiptapEditorInner: ComponentType<
  RichTextComponentProps & { modules: TiptapModules }
> = ({
  label,
  value = '',
  onChange,
  error,
  helperText,
  required,
  disabled,
  placeholder,
  className,
  modules,
}) => {
  const {
    useEditor,
    EditorContent,
    StarterKit,
    Placeholder: PlaceholderExt,
  } = modules;

  // useEditor is now called at the top level of this component (not inside useMemo)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      PlaceholderExt.configure({
        placeholder: placeholder || 'Start typing...',
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }: { editor: Editor }) => {
      const html = editor.getHTML();
      // Create synthetic event for onChange compatibility
      const syntheticEvent = {
        target: { value: html },
      } as ChangeEvent<HTMLTextAreaElement>;
      onChange(syntheticEvent);
    },
  });

  // Update editor content when value prop changes (external updates)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  return (
    <Stack gap="tight">
      <label
        style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 500,
          color: error ? 'var(--destructive-foreground)' : 'var(--foreground)',
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--destructive)' }}> *</span>}
      </label>
      <div
        className={className}
        data-variant={error ? 'destructive' : undefined}
        style={{
          border: 'var(--border-hairline) solid',
          borderColor: error ? 'var(--destructive)' : 'var(--line-2)',
          borderRadius: 'var(--radius-interactive)',
          padding: 'var(--gap-md)',
          minHeight: '200px',
          backgroundColor: disabled ? 'var(--muted)' : 'transparent',
          opacity: disabled ? 'var(--opacity-muted)' : undefined,
        }}
      >
        <EditorContent editor={editor} />
      </div>
      {helperText && (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: error
              ? 'var(--destructive-foreground)'
              : 'var(--muted-foreground)',
          }}
        >
          {helperText}
        </p>
      )}
      <style>{`
        .ProseMirror {
          outline: none;
          min-height: 150px;
        }
        .ProseMirror p {
          margin: 0.5em 0;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--muted-foreground);
          pointer-events: none;
          height: 0;
        }
        .ProseMirror h1 {
          font-size: var(--font-size-2xl);
          font-weight: 600;
          margin: 0.5em 0;
        }
        .ProseMirror h2 {
          font-size: var(--font-size-xl);
          font-weight: 600;
          margin: 0.5em 0;
        }
        .ProseMirror h3 {
          font-size: var(--font-size-lg);
          font-weight: 600;
          margin: 0.5em 0;
        }
        .ProseMirror ul, .ProseMirror ol {
          padding-left: 1.5em;
        }
        .ProseMirror strong {
          font-weight: 600;
        }
        .ProseMirror em {
          font-style: italic;
        }
        .ProseMirror code {
          background: var(--muted);
          padding: 0.2em 0.4em;
          border-radius: var(--radius-sm);
          font-family: monospace;
        }
        .ProseMirror blockquote {
          border-left: 3px solid var(--border);
          padding-left: 1em;
          margin: 0.5em 0;
          color: var(--muted-foreground);
        }
      `}</style>
    </Stack>
  );
};

/**
 * TiptapEditor - WYSIWYG editor component
 * Uses dynamic imports to gracefully handle missing Tiptap packages.
 * Delegates to TiptapEditorInner once modules are loaded so that
 * useEditor (a React hook) is called at the top level of a component.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */
const TiptapEditor: ComponentType<RichTextComponentProps> = (props) => {
  const [tiptapModules, setTiptapModules] = useState<TiptapModules | null>(
    null
  );
  const [tiptapFailed, setTiptapFailed] = useState(false);

  // Dynamically load Tiptap packages (optional peer dependency)
  useEffect(() => {
    if (tiptapModules || tiptapFailed) return;

    const loadTiptap = async () => {
      try {
        const [
          { useEditor, EditorContent },
          StarterKitModule,
          PlaceholderModule,
        ] = await Promise.all([
          import('@tiptap/react'),
          import('@tiptap/starter-kit'),
          import('@tiptap/extension-placeholder'),
        ]);

        setTiptapModules({
          useEditor,
          EditorContent,
          StarterKit: StarterKitModule.default,
          Placeholder: PlaceholderModule.default,
        });
      } catch (error) {
        // Tiptap not installed or failed to load
        if (
          error instanceof Error &&
          (error.message.includes("Cannot find module '@tiptap") ||
            error.message.includes(
              'Failed to fetch dynamically imported module'
            ))
        ) {
          console.info(
            '[TiptapEditor] Tiptap not available. Rich text editing disabled. To enable: npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder'
          );
        } else {
          console.warn('[TiptapEditor] Failed to load Tiptap:', error);
        }
        setTiptapFailed(true);
      }
    };

    loadTiptap();
  }, [tiptapModules, tiptapFailed]);

  if (tiptapFailed || !tiptapModules) {
    return null;
  }

  return <TiptapEditorInner {...props} modules={tiptapModules} />;
};

export default TiptapEditor;
