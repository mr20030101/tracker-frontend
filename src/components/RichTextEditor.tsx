import { useEffect, useState } from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Check, Heading2, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Underline, Undo2, Unlink, type LucideIcon } from 'lucide-react'
import { FONTS, FONT_SIZES, loadRichTextFonts } from '../lib/richText'
import { Select } from './Select'

/**
 * A WYSIWYG editor that writes HTML, shown back through renderRichText(), which keeps only what
 * this toolbar can make. `onChange` also gets the visible text's length, which is what the
 * character limit counts (not the markup).
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (html: string, textLength: number) => void
  placeholder?: string
  'aria-label'?: string
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto'] },
      }),
      TextStyle,
      FontFamily,
      FontSize,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'rich-text min-h-40 max-h-96 overflow-y-auto px-3 py-2 text-sm outline-none',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML(), editor.getText().length),
  })

  useEffect(loadRichTextFonts, [])

  return (
    <div className="rounded-lg border border-gray-200 focus-within:border-accent">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  // Re-renders the toolbar as the selection moves, so buttons show what's active under the cursor.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      fontFamily: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? '',
      fontSize: (e.getAttributes('textStyle').fontSize as string | undefined) ?? '',
      strike: e.isActive('strike'),
      heading: e.isActive('heading', { level: 2 }),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      blockquote: e.isActive('blockquote'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  // The link's address, while the link row under the toolbar is open.
  const [linkUrl, setLinkUrl] = useState<string | null>(null)

  function toggleLinkRow() {
    if (linkUrl !== null) return setLinkUrl(null)
    setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? '')
  }

  function applyLink() {
    const url = (linkUrl ?? '').trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!url) chain.unsetLink().run()
    // A bare "example.com" becomes https://example.com rather than a broken relative link.
    else chain.setLink({ href: /^(https?:|mailto:)/i.test(url) ? url : `https://${url}` }).run()
    setLinkUrl(null)
  }

  const buttons: { label: string; icon: LucideIcon; active?: boolean; disabled?: boolean; run: () => void }[] = [
    { label: 'Bold', icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Underline', icon: Underline, active: state.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { label: 'Strikethrough', icon: Strikethrough, active: state.strike, run: () => editor.chain().focus().toggleStrike().run() },
    { label: 'Heading', icon: Heading2, active: state.heading, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Bulleted list', icon: List, active: state.bulletList, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: 'Numbered list', icon: ListOrdered, active: state.orderedList, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: 'Quote', icon: Quote, active: state.blockquote, run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: 'Link', icon: Link2, active: state.link || linkUrl !== null, run: toggleLinkRow },
    { label: 'Undo', icon: Undo2, disabled: !state.canUndo, run: () => editor.chain().focus().undo().run() },
    { label: 'Redo', icon: Redo2, disabled: !state.canRedo, run: () => editor.chain().focus().redo().run() },
  ]

  return (
    <div className="border-b border-gray-200">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 px-1.5 py-1">
        <Select
          aria-label="Font"
          value={fontValue(state.fontFamily)}
          onChange={(font) => (font ? editor.chain().focus().setFontFamily(font).run() : editor.chain().focus().unsetFontFamily().run())}
          options={FONTS.map((f) => ({ value: f.value, label: f.label }))}
          className={selectClass}
        />
        <Select
          aria-label="Size"
          value={state.fontSize}
          onChange={(size) => (size ? editor.chain().focus().setFontSize(size).run() : editor.chain().focus().unsetFontSize().run())}
          options={FONT_SIZES}
          className={selectClass}
        />
        <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
        {buttons.map(({ label, icon: Icon, active, disabled, run }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            // Keeps the editor's selection: a plain click would blur it before the command runs.
            onMouseDown={(e) => e.preventDefault()}
            onClick={run}
            className={`rounded-md p-1.5 disabled:opacity-30 ${active ? 'bg-accent-bg text-accent-foreground' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      {linkUrl !== null && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 px-2 py-1.5">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              // Enter would otherwise submit the whole announcement form.
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setLinkUrl(null)
              }
            }}
            placeholder="https://..."
            aria-label="Link address"
            className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <button type="button" onClick={applyLink} className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
            {linkUrl.trim() ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Unlink className="h-3.5 w-3.5" aria-hidden />}
            {linkUrl.trim() ? 'Apply' : 'Remove link'}
          </button>
        </div>
      )}
    </div>
  )
}

const selectClass = 'h-8 rounded-md border border-gray-200 px-2 text-xs text-gray-700 outline-none focus:border-accent'

// The browser may re-quote a font-family once it's in the document ("Playfair Display" vs
// 'Playfair Display'), so the picker matches on the first family named, not the exact string.
function fontValue(fontFamily: string): string {
  const first = (v: string) => v.split(',')[0].replace(/["']/g, '').trim().toLowerCase()
  return FONTS.find((f) => f.value && first(f.value) === first(fontFamily))?.value ?? ''
}
