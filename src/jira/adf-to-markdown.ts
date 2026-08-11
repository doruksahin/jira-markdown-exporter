/** A deliberately small ADF renderer for the Jira fields exported by this tool. */
export function adfToMarkdown(value: unknown, attachmentNames: ReadonlySet<string> = new Set()): string {
  if (!value || typeof value !== 'object') return '';
  try {
    return render(value as AdfNode, attachmentNames).replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
  }
}

interface AdfNode { type?: string; text?: string; attrs?: Record<string, unknown>; content?: AdfNode[]; marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>; }

function render(node: AdfNode, attachmentNames: ReadonlySet<string>): string {
  const children = () => (node.content ?? []).map((child) => render(child, attachmentNames)).join('');
  const text = () => withMarks(node.text ?? '', node.marks ?? []);
  switch (node.type) {
    case 'doc': return children();
    case 'paragraph': return `${children()}\n\n`;
    case 'text': return text();
    case 'hardBreak': return '  \n';
    case 'heading': return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${children()}\n\n`;
    case 'bulletList': return (node.content ?? []).map((item) => `- ${renderListItem(item, attachmentNames)}\n`).join('') + '\n';
    case 'orderedList': return (node.content ?? []).map((item, index) => `${index + 1}. ${renderListItem(item, attachmentNames)}\n`).join('') + '\n';
    case 'listItem': return renderListItem(node, attachmentNames);
    case 'blockquote': return children().trim().split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';
    case 'codeBlock': return `\`\`\`${String(node.attrs?.language ?? '')}\n${children()}\n\`\`\`\n\n`;
    case 'rule': return '---\n\n';
    case 'emoji': return String(node.attrs?.text ?? node.attrs?.shortName ?? '');
    case 'mention': return String(node.attrs?.text ?? '@unknown');
    case 'mediaSingle': {
      const media = node.content?.find((child) => child.type === 'media');
      const alt = typeof media?.attrs?.alt === 'string' ? media.attrs.alt : '';
      return alt && attachmentNames.has(alt) ? `![${alt}](./attachments/${alt})\n\n` : `<!-- media: ${alt || 'unknown'} -->\n\n`;
    }
    default: return children() || node.text || '';
  }
}

function renderListItem(node: AdfNode, attachmentNames: ReadonlySet<string>): string { return (node.content ?? []).map((child) => render(child, attachmentNames)).join('').trim(); }

function withMarks(input: string, marks: readonly { type?: string; attrs?: Record<string, unknown> }[]): string {
  return marks.reduce((text, mark) => {
    if (mark.type === 'strong') return `**${text}**`;
    if (mark.type === 'em') return `*${text}*`;
    if (mark.type === 'code') return `\`${text}\``;
    if (mark.type === 'strike') return `~~${text}~~`;
    if (mark.type === 'link') return `[${text}](${String(mark.attrs?.href ?? '')})`;
    return text;
  }, input);
}
