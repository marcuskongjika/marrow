import { defaultSchema } from 'rehype-sanitize'
import type { Options as SanitizeSchema } from 'rehype-sanitize'
import { LOCAL_FILE_SCHEME } from '../token'

/**
 * Sanitization schema for rendered markdown.
 *
 * Where this sits in the pipeline matters: `rehype-raw` parses the HTML that was
 * embedded in the markdown source, then this schema scrubs it, and only *then*
 * do our own trusted generators (KaTeX, rehype-slug, autolink headings, Shiki)
 * add markup. So user-authored HTML is always sanitized, while generated markup
 * is never mangled by the sanitizer.
 *
 * The schema still permits the shapes KaTeX, Shiki and Mermaid produce (MathML,
 * inline `style` on code spans, SVG) so that the sanitizer can be moved to the
 * end of the pipeline without silently breaking those features.
 */

const MATHML_TAGS = [
  'math',
  'semantics',
  'annotation',
  'annotation-xml',
  'mrow',
  'mi',
  'mo',
  'mn',
  'ms',
  'mtext',
  'mspace',
  'msup',
  'msub',
  'msubsup',
  'mfrac',
  'msqrt',
  'mroot',
  'munder',
  'mover',
  'munderover',
  'mmultiscripts',
  'mprescripts',
  'mtable',
  'mtr',
  'mtd',
  'mlabeledtr',
  'mstyle',
  'mpadded',
  'mphantom',
  'menclose',
  'merror',
  'maction',
  'mglyph'
]

const SVG_TAGS = [
  'svg',
  'g',
  'defs',
  'desc',
  'title',
  'symbol',
  'use',
  'marker',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textPath',
  'foreignObject',
  'clipPath',
  'mask',
  'pattern',
  'linearGradient',
  'radialGradient',
  'stop',
  'filter',
  'feGaussianBlur',
  'feOffset',
  'feBlend',
  'feColorMatrix'
]

const SVG_ATTRS = [
  'viewBox',
  'preserveAspectRatio',
  'xmlns',
  'xmlnsXlink',
  'width',
  'height',
  'x',
  'x1',
  'x2',
  'y',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'dx',
  'dy',
  'points',
  'transform',
  'fill',
  'fillOpacity',
  'fillRule',
  'stroke',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'strokeDasharray',
  'strokeOpacity',
  'opacity',
  'markerEnd',
  'markerStart',
  'markerWidth',
  'markerHeight',
  'orient',
  'refX',
  'refY',
  'offset',
  'stopColor',
  'stopOpacity',
  'textAnchor',
  'dominantBaseline',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'clipPath',
  'clipRule',
  'gradientUnits',
  'patternUnits',
  'spreadMethod'
]

const base = defaultSchema
const baseAttributes = base.attributes ?? {}
const wildcard = baseAttributes['*'] ?? []

export const marrowSanitizeSchema: SanitizeSchema = {
  ...base,
  // remark-rehype already prefixes footnote ids with `user-content-` and keeps
  // their hrefs in sync. Re-prefixing here would double it up and break every
  // footnote link, so clobber protection is disabled: a locally viewed document
  // has no surrounding page whose ids could be shadowed.
  clobberPrefix: '',
  strip: ['script', 'style', 'iframe', 'object', 'embed', 'applet', 'base', 'link', 'meta', 'form'],
  tagNames: [
    ...(base.tagNames ?? []),
    'details',
    'summary',
    'figure',
    'figcaption',
    'abbr',
    'mark',
    'picture',
    'source',
    'u',
    'wbr',
    ...MATHML_TAGS,
    ...SVG_TAGS
  ],
  protocols: {
    ...(base.protocols ?? {}),
    // `file:` survives sanitization only so that `rehypeLocalRefs` can rewrite
    // it to `marrow-file://`; the CSP has no `file:` source, so an unrewritten
    // one cannot load anything.
    href: ['http', 'https', 'mailto', 'tel', 'irc', 'ircs', 'xmpp', 'file', LOCAL_FILE_SCHEME],
    src: ['http', 'https', 'data', 'file', LOCAL_FILE_SCHEME],
    cite: ['http', 'https'],
    longDesc: ['http', 'https']
  },
  attributes: {
    ...baseAttributes,
    '*': [
      ...wildcard,
      'className',
      'id',
      'role',
      'ariaHidden',
      'ariaLabel',
      'ariaLabelledBy',
      'ariaDescribedBy',
      'dataFootnotes',
      'dataFootnoteRef',
      'dataFootnoteBackref',
      'dataFootnoteBackrefLabel',
      'dataLineNumbers',
      'dataLanguage',
      'dataTheme'
    ],
    a: [...(baseAttributes.a ?? []), 'href', 'name', 'target', 'rel', 'className'],
    img: [...(baseAttributes.img ?? []), 'src', 'alt', 'title', 'width', 'height', 'loading'],
    // Shiki marks every token with `--shiki-light` / `--shiki-dark` custom
    // properties, so inline styles are allowed on code-ish elements only.
    span: [...(baseAttributes.span ?? []), 'className', 'style'],
    code: [...(baseAttributes.code ?? []), 'className', 'style'],
    pre: [...(baseAttributes.pre ?? []), 'className', 'style', 'tabIndex'],
    div: [...(baseAttributes.div ?? []), 'className'],
    section: [...(baseAttributes.section ?? []), 'className', 'dataFootnotes'],
    input: [...(baseAttributes.input ?? []), 'checked', 'disabled', 'type'],
    math: ['xmlns', 'display', 'className'],
    annotation: ['encoding'],
    'annotation-xml': ['encoding'],
    ...Object.fromEntries(SVG_TAGS.map((tag) => [tag, [...SVG_ATTRS, 'className', 'style', 'id']]))
  }
}
