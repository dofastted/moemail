const INLINE_CODE_STYLE = "background:#f3f4f6;border-radius:4px;padding:0.1em 0.3em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.92em"
const LINK_STYLE = "color:#2563eb;text-decoration:underline"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function sanitizeHref(value: string) {
  const href = value.trim()
  const lower = href.toLowerCase()
  if (lower.startsWith("https://") || lower.startsWith("http://") || lower.startsWith("mailto:")) {
    return escapeHtml(href).replace(/`/g, "&#96;")
  }
  return ""
}

function renderInline(value: string) {
  const fragments: string[] = []
  const stash = (html: string) => {
    fragments.push(html)
    return `@@MOEMAIL_MD_${fragments.length - 1}@@`
  }

  let rendered = escapeHtml(value)

  rendered = rendered.replace(/`([^`]+)`/g, (_, code: string) => (
    stash(`<code style="${INLINE_CODE_STYLE}">${code}</code>`)
  ))

  rendered = rendered.replace(/\[([^\]]+)]\(([^\s)]+)\)/g, (_, label: string, rawHref: string) => {
    const href = sanitizeHref(rawHref)
    if (!href) return `${label} (${rawHref})`
    return stash(`<a href="${href}" style="${LINK_STYLE}" target="_blank" rel="noopener noreferrer">${label}</a>`)
  })

  rendered = rendered
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")

  return fragments.reduce(
    (html, fragment, index) => html.replace(`@@MOEMAIL_MD_${index}@@`, fragment),
    rendered
  )
}

export function renderMarkdown(content: string) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  const output: string[] = []
  const paragraph: string[] = []
  const blockquote: string[] = []
  let list: { tag: "ul" | "ol"; items: string[] } | null = null
  let codeBlock: string[] | null = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    output.push(`<p style="margin:0 0 12px">${paragraph.map(renderInline).join("<br>")}</p>`)
    paragraph.length = 0
  }

  const flushBlockquote = () => {
    if (!blockquote.length) return
    output.push(`<blockquote style="margin:0 0 12px;padding-left:12px;border-left:3px solid #d1d5db;color:#4b5563">${blockquote.map(renderInline).join("<br>")}</blockquote>`)
    blockquote.length = 0
  }

  const flushList = () => {
    if (!list) return
    output.push(`<${list.tag} style="margin:0 0 12px 20px;padding:0">${list.items.map(item => `<li style="margin:4px 0">${item}</li>`).join("")}</${list.tag}>`)
    list = null
  }

  const flushOpenBlocks = () => {
    flushParagraph()
    flushBlockquote()
    flushList()
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (codeBlock) {
      if (trimmed.startsWith("```")) {
        output.push(`<pre style="margin:0 0 12px;padding:12px;border-radius:8px;background:#111827;color:#f9fafb;overflow:auto"><code>${escapeHtml(codeBlock.join("\n"))}</code></pre>`)
        codeBlock = null
      } else {
        codeBlock.push(line)
      }
      continue
    }

    if (trimmed.startsWith("```")) {
      flushOpenBlocks()
      codeBlock = []
      continue
    }

    if (!trimmed) {
      flushOpenBlocks()
      continue
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      flushOpenBlocks()
      const level = headingMatch[1].length
      const fontSize = Math.max(22 - level * 2, 14)
      output.push(`<h${level} style="margin:0 0 12px;font-size:${fontSize}px;line-height:1.3;font-weight:700">${renderInline(headingMatch[2])}</h${level}>`)
      continue
    }

    const unorderedMatch = /^[-*+]\s+(.+)$/.exec(trimmed)
    if (unorderedMatch) {
      flushParagraph()
      flushBlockquote()
      if (list?.tag !== "ul") flushList()
      list ??= { tag: "ul", items: [] }
      list.items.push(renderInline(unorderedMatch[1]))
      continue
    }

    const orderedMatch = /^\d+[.)]\s+(.+)$/.exec(trimmed)
    if (orderedMatch) {
      flushParagraph()
      flushBlockquote()
      if (list?.tag !== "ol") flushList()
      list ??= { tag: "ol", items: [] }
      list.items.push(renderInline(orderedMatch[1]))
      continue
    }

    const quoteMatch = /^>\s?(.*)$/.exec(line)
    if (quoteMatch) {
      flushParagraph()
      flushList()
      blockquote.push(quoteMatch[1])
      continue
    }

    flushBlockquote()
    flushList()
    paragraph.push(line)
  }

  if (codeBlock) {
    output.push(`<pre style="margin:0 0 12px;padding:12px;border-radius:8px;background:#111827;color:#f9fafb;overflow:auto"><code>${escapeHtml(codeBlock.join("\n"))}</code></pre>`)
  }

  flushOpenBlocks()
  return output.join("")
}

export function renderMarkdownEmail(content: string) {
  return `<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#111827">${renderMarkdown(content)}</div>`
}
