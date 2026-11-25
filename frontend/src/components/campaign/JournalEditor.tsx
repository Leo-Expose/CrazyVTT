/**
 * Journal Editor
 * TipTap-based rich text editor for journal entries
 */

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Link } from '@tiptap/extension-link';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Highlight } from '@tiptap/extension-highlight';
import { Underline } from '@tiptap/extension-underline';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Editor } from '@tiptap/core';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Highlighter,
  Underline as UnderlineIcon,
  CheckSquare,
  Minus,
  Plus,
  Type,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import Button from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import type { JournalEntry } from '@/types';

interface JournalEditorProps {
  entry: JournalEntry;
  readOnly?: boolean;
  onSave?: (content: string) => void;
}

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Placeholder.configure({ placeholder: 'Write your journal entry here...' }),
  Link.configure({ openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
  Image.configure({ inline: true, allowBase64: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight.configure({ multicolor: true }),
  Underline,
  Subscript,
  Superscript,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  Color,
];

export default function JournalEditor({ entry, readOnly = false, onSave }: JournalEditorProps) {
  const { showToast } = useToast();
  const editorRef = useRef<Editor | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTarget, setLinkTarget] = useState<{ from: number; to: number } | null>(null);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: entry.content || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      setWordCount(words);
      setCharCount(text.length);
      // Auto-save draft to localStorage
      localStorage.setItem(`journal-draft-${entry.id}`, editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-4',
        spellcheck: 'true',
      },
    },
  });

  const loadDraft = useEffectEvent((currentEditor: Editor, entryId: string) => {
    const draft = localStorage.getItem(`journal-draft-${entryId}`);
    if (draft && draft !== entry.content) {
      const useDraft = window.confirm('A draft was found. Load it?');
      if (useDraft) {
        currentEditor.commands.setContent(draft);
      } else {
        localStorage.removeItem(`journal-draft-${entryId}`);
      }
    }
  });

  useEffect(() => {
    editorRef.current = editor;
    // Load draft from localStorage on mount or when switching entries.
    if (editor) {
      loadDraft(editor, entry.id);
    }
    return () => {
      editorRef.current = null;
    };
  }, [editor, entry.id]);

  useEffect(() => {
    if (editor && entry.content !== editor.getHTML()) {
      editor.commands.setContent(entry.content, { emitUpdate: false });
    }
  }, [entry.content, editor]);

  const handleSave = useCallback(async () => {
    if (!editor || !onSave) return;
    setIsSaving(true);
    try {
      const content = editor.getHTML();
      await onSave(content);
      localStorage.removeItem(`journal-draft-${entry.id}`);
      showToast('Saved', 'success');
    } catch {
      showToast('Failed to save', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [editor, entry.id, onSave, showToast]);

  const handleAddLink = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from !== to) {
      // Text selected - add link to selection
      setLinkTarget({ from, to });
      setShowLinkDialog(true);
    } else {
      setShowLinkDialog(true);
    }
  }, [editor]);

  const confirmLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    if (linkTarget) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    }
    setShowLinkDialog(false);
    setLinkUrl('');
    setLinkTarget(null);
  }, [editor, linkUrl, linkTarget]);

  const handleAddImage = useCallback(async () => {
    setShowImageDialog(true);
  }, []);

  const confirmImage = useCallback(async () => {
    if (!editor || !imageUrl) return;
    setUploadingImage(true);
    try {
      // For now, just insert the image URL directly
      // In the future, this could upload to the asset system
      editor.chain().focus().setImage({ src: imageUrl }).run();
      setShowImageDialog(false);
      setImageUrl('');
    } catch {
      showToast('Failed to add image', 'error');
    } finally {
      setUploadingImage(false);
    }
  }, [editor, imageUrl, showToast]);

  const addTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  const addTaskList = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleTaskList().run();
  }, [editor]);

  const addHighlight = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleHighlight().run();
  }, [editor]);

  const clearFormatting = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().clearNodes().run();
  }, [editor]);

  const undo = useCallback(() => {
    editor?.commands.undo();
  }, [editor]);

  const redo = useCallback(() => {
    editor?.commands.redo();
  }, [editor]);

  if (!editor) return null;

  const bubbleItems = [
    { icon: Bold, title: 'Bold', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), shortcut: 'Mod+B' },
    { icon: Italic, title: 'Italic', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), shortcut: 'Mod+I' },
    { icon: Strikethrough, title: 'Strikethrough', action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike'), shortcut: 'Mod+Shift+X' },
    { icon: Code, title: 'Inline Code', action: () => editor.chain().focus().toggleCode().run(), active: editor.isActive('code'), shortcut: 'Mod+E' },
    { icon: UnderlineIcon, title: 'Underline', action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline'), shortcut: 'Mod+U' },
    { icon: Highlighter, title: 'Highlight', action: addHighlight, active: editor.isActive('highlight') },
    { icon: LinkIcon, title: 'Link', action: handleAddLink, active: editor.isActive('link'), shortcut: 'Mod+K' },
    { icon: ImageIcon, title: 'Image', action: handleAddImage },
    { icon: Type, title: 'Clear Formatting', action: clearFormatting },
  ];

  const blockItems = [
    { icon: Heading1, title: 'Heading 1', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive('heading', { level: 1 }), shortcut: 'Mod+Alt+1' },
    { icon: Heading2, title: 'Heading 2', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }), shortcut: 'Mod+Alt+2' },
    { icon: Heading3, title: 'Heading 3', action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive('heading', { level: 3 }), shortcut: 'Mod+Alt+3' },
    { icon: List, title: 'Bullet List', action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList') },
    { icon: ListOrdered, title: 'Numbered List', action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList') },
    { icon: CheckSquare, title: 'Task List', action: addTaskList, active: editor.isActive('taskList') },
    { icon: Quote, title: 'Blockquote', action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote') },
    { icon: Code, title: 'Code Block', action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive('codeBlock') },
    { icon: TableIcon, title: 'Insert Table', action: addTable },
    { icon: AlignLeft, title: 'Align Left', action: () => editor.chain().focus().setTextAlign('left').run(), active: editor.isActive({ textAlign: 'left' }) },
    { icon: AlignCenter, title: 'Align Center', action: () => editor.chain().focus().setTextAlign('center').run(), active: editor.isActive({ textAlign: 'center' }) },
    { icon: AlignRight, title: 'Align Right', action: () => editor.chain().focus().setTextAlign('right').run(), active: editor.isActive({ textAlign: 'right' }) },
    { icon: AlignJustify, title: 'Align Justify', action: () => editor.chain().focus().setTextAlign('justify').run(), active: editor.isActive({ textAlign: 'justify' }) },
  ];

  return (
    <div className="flex flex-col h-full bg-white border border-warm-amber/20 rounded-cozy overflow-hidden">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap gap-1 p-2 border-b border-warm-amber/20 bg-parchment/30">
          <div className="flex items-center gap-1 mr-4">
            {bubbleItems.map(({ icon: Icon, title, action, active, shortcut }) => (
              <Button
                key={title}
                variant="ghost"
                size="sm"
                className={cn('p-1.5 rounded', active && 'bg-warm-amber/20 text-brand-ink')}
                onClick={action}
                disabled={!editor.can().chain().focus().run()}
                title={`${title}${shortcut ? ` (${shortcut})` : ''}`}
              >
                <Icon className="w-4 h-4" />
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1 mr-4 border-l border-warm-amber/20 pl-4">
            {blockItems.map(({ icon: Icon, title, action, active }) => (
              <Button
                key={title}
                variant="ghost"
                size="sm"
                className={cn('p-1.5 rounded', active && 'bg-warm-amber/20 text-brand-ink')}
                onClick={action}
                disabled={!editor.can().chain().focus().run()}
                title={title}
              >
                <Icon className="w-4 h-4" />
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={undo}
              disabled={!editor.can().undo()}
              title="Undo (Mod+Z)"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={redo}
              disabled={!editor.can().redo()}
              title="Redo (Mod+Shift+Z)"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-warm-amber/20 bg-parchment/30 text-xs text-stone-gray">
        <span>{wordCount} words · {charCount} characters</span>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <Button onClick={handleSave} disabled={isSaving} size="sm" variant="secondary">
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      {/* Link Dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Add Link</h3>
            <input
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber mb-3"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowLinkDialog(false); setLinkUrl(''); setLinkTarget(null); }}>
                Cancel
              </Button>
              <Button onClick={confirmLink} disabled={!linkUrl}>
                Insert Link
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Image Dialog */}
      {showImageDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Add Image</h3>
            <p className="text-sm text-stone-gray mb-3">Enter an image URL or upload an image to the asset library first.</p>
            <input
              type="url"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.png"
              className="w-full px-3 py-2 border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-hidden focus:ring-2 focus:ring-warm-amber mb-3"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowImageDialog(false); setImageUrl(''); }}>
                Cancel
              </Button>
              <Button onClick={confirmImage} disabled={!imageUrl || uploadingImage}>
                {uploadingImage ? 'Adding…' : 'Add Image'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
