import { useState } from 'react';
import { Check, Copy, FileText, GitBranch, Gauge, Pencil, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';
import { Logo } from './Logo';

export function MessageBubble({ message, streaming, onRetry, onEdit, onBranch }: {
  message: ChatMessage;
  streaming?: boolean;
  onRetry?: () => void;
  onEdit?: () => void;
  onBranch?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  if (message.role === 'user') {
    return (
      <article id={`message-${message.id}`} className="message message--user">
        <div className="user-message-wrap">
          <div className={`user-bubble ${message.attachments?.length ? 'has-attachments' : ''}`}>
            {message.attachments && message.attachments.length > 0 && <div className="message-attachments">
              {message.attachments.map((attachment) => attachment.kind === 'image' && attachment.dataUrl
                ? <img key={attachment.id} src={attachment.dataUrl} alt={attachment.name} title={attachment.name} />
                : <div className="message-file" key={attachment.id}><FileText size={17} /><span><b>{attachment.name}</b><small>Attached file</small></span></div>)}
            </div>}
            <span className="user-message-text">{message.content}</span>
          </div>
          {(onEdit || onBranch) && <div className="user-message-actions">
            {onEdit && <button onClick={onEdit} title="Edit and regenerate"><Pencil size={13} />Edit</button>}
            {onBranch && <button onClick={onBranch} title="Start a new branch here"><GitBranch size={13} />Branch</button>}
          </div>}
        </div>
      </article>
    );
  }

  return (
    <article id={`message-${message.id}`} className="message message--assistant">
      <div className="assistant-avatar"><Logo small /></div>
      <div className="assistant-body">
        {message.content ? (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            {streaming && <span className="stream-caret" />}
          </div>
        ) : (
          <div className="thinking"><i /><i /><i /><span>Thinking locally</span></div>
        )}
        {!streaming && message.content && (
          <div className="message-actions">
            <button onClick={copy} title="Copy response">
              {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}
            </button>
            {onRetry && <button onClick={onRetry} title="Try again"><RotateCcw size={14} /> Retry</button>}
            {message.metrics && <span className="response-metrics" title={`Estimated ${message.metrics.estimatedTokens} generated tokens · ${message.metrics.timeToFirstTokenMs / 1000}s to first token`}><Gauge size={13} />~{message.metrics.tokensPerSecond.toFixed(1)} tok/s · {(message.metrics.durationMs / 1000).toFixed(1)}s</span>}
          </div>
        )}
      </div>
    </article>
  );
}
