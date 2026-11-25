/**
 * Journal Viewer
 * Read-only view for journal entries
 */

import { useState } from 'react';
import { Edit2, Eye, EyeOff, Lock, Users, Globe, Tag, Copy, Download } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import api from '@/services/api';
import Button from '@/components/ui/Button';
import { format } from 'date-fns';
import type { JournalEntry, JournalVisibility, JournalImage } from '@/types';

interface JournalViewerProps {
  entry: JournalEntry;
  canEdit: boolean;
  onEdit?: () => void;
}

const VISIBILITY_ICONS: Record<JournalVisibility, React.ReactNode> = {
  PUBLIC: <Globe className="w-3.5 h-3.5" />,
  DM_ONLY: <Lock className="w-3.5 h-3.5" />,
  PLAYER_SPECIFIC: <Users className="w-3.5 h-3.5" />,
};

const VISIBILITY_LABELS: Record<JournalVisibility, string> = {
  PUBLIC: 'Public',
  DM_ONLY: 'DM Only',
  PLAYER_SPECIFIC: 'Specific Players',
};

const VISIBILITY_COLORS: Record<JournalVisibility, string> = {
  PUBLIC: 'bg-moss-green/10 text-moss-green',
  DM_ONLY: 'bg-blue-600/10 text-blue-600',
  PLAYER_SPECIFIC: 'bg-purple-600/10 text-purple-600',
};

export default function JournalViewer({ entry, canEdit, onEdit }: JournalViewerProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showContent, setShowContent] = useState(true);

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(entry.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = entry.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${entry.title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
    h1, h2, h3 { color: #1f2937; }
    pre { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
    code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 0.25rem; }
    blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; margin: 1rem 0; color: #6b7280; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #d1d5db; padding: 0.5rem; }
    th { background: #f3f4f6; }
    img { max-width: 100%; height: auto; }
    .task-list-item { list-style: none; }
    .task-list-item input[type="checkbox"] { margin-right: 0.5rem; }
  </style>
</head>
<body>
  <h1>${entry.title}</h1>
  <p style="color: #6b7280; font-size: 0.875rem;">${entry.visibility} · Updated ${format(new Date(entry.updatedAt), 'PPp')}</p>
  <hr>
  ${entry.content}
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entry.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="prose prose-sm max-w-none p-4 min-h-[400px]">
      {/* Header with metadata */}
      <div className="mb-6 pb-4 border-b border-warm-amber/20">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {VISIBILITY_ICONS[entry.visibility]}
            <span className={`px-2 py-1 rounded text-xs font-medium ${VISIBILITY_COLORS[entry.visibility]}`}>
              {VISIBILITY_LABELS[entry.visibility]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCopyHtml}>
              {copied ? <Eye className="w-3.5 h-3.5 text-moss-green" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
            </Button>
            {canEdit && onEdit && (
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-gray">
          <span>Created: {format(new Date(entry.createdAt), 'PPp')}</span>
          {entry.updatedAt !== entry.createdAt && (
            <>
              <span>·</span>
              <span>Updated: {format(new Date(entry.updatedAt), 'PPp')}</span>
            </>
          )}
          {entry.createdBy && (
            <>
              <span>·</span>
              <span>By: {entry.createdBy.displayName}</span>
            </>
          )}
        </div>

        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {entry.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded text-[10px] bg-parchment/50 text-stone-gray border border-warm-amber/20">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: entry.content }} />

      {/* Images */}
      {entry.images && entry.images.length > 0 && (
        <div className="mt-8 pt-6 border-t border-warm-amber/20">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Images</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entry.images.map((image: JournalImage) => (
              <div key={image.id} className="rounded-cozy border border-warm-amber/20 overflow-hidden bg-parchment/30">
                {image.asset?.filePath && (
                  <img
                    src={`/api/assets/${image.asset.id}`}
                    alt={image.caption || 'Journal image'}
                    className="w-full h-48 object-cover"
                    loading="lazy"
                  />
                )}
                {(image.caption || image.asset?.originalName) && (
                  <div className="p-3">
                    {image.caption && (
                      <p className="text-sm text-brand-ink font-medium">{image.caption}</p>
                    )}
                    {image.asset?.originalName && (
                      <p className="text-[11px] text-stone-gray">{image.asset.originalName}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Icon components
const Globe = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
);

const Lock = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const Users = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const Copy = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m0 0H8m0 0h4m0 0l3 3m3-3l-3 3" />
  </svg>
);

const Download = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const Edit2 = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const Eye = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOff = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L3 3m18 18L3 3" />
  </svg>
);