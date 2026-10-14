import type { Root as MdastRoot, RootContent } from 'mdast'

export interface Frontmatter {
  raw: string | null
  title: string | null
}

export interface FrontmatterOptions {
  into: Frontmatter
}

interface YamlNode {
  type: 'yaml'
  value: string
}

function isYamlNode(node: RootContent | undefined): node is RootContent & YamlNode {
  return node !== undefined && (node as { type: string }).type === 'yaml'
}

/**
 * Pulls the YAML frontmatter block off the top of the document so it is not
 * rendered, and extracts `title` for the tab label. Only that one key is read,
 * which avoids pulling in a YAML parser for a feature this small.
 */
export function remarkFrontmatterData(options: FrontmatterOptions) {
  return function transform(tree: MdastRoot): void {
    const first = tree.children[0]
    if (!isYamlNode(first)) return
    options.into.raw = first.value
    const match = /^title\s*:\s*(.+)$/m.exec(first.value)
    if (match?.[1]) {
      options.into.title = match[1].trim().replace(/^["']|["']$/g, '') || null
    }
    tree.children.shift()
  }
}
