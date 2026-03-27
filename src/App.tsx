import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import MindMapEditor from './components/MindMapEditor'

type Folder = {
  id: string
  parentId: string | null
  name: string
  sort: number
}

type NoteType = 'rich_text' | 'markdown' | 'mind_map'

const LINE_HEIGHT_OPTIONS = ['1.0', '1.15', '1.5', '1.7', '2.0', '2.5', '3.0'] as const

type Note = {
  id: string
  folderId: string
  title: string
  content: string
  sort: number
  noteType: NoteType
}

type AppData = {
  folders: Folder[]
  notes: Note[]
}

type VaultFolder = {
  id: string
  parentId: string | null
  name: string
  sort: number
}

type VaultEntry = {
  id: string
  folderId: string
  title: string
  content: string
  sort: number
  entryType: string
}

type VaultData = {
  folders: VaultFolder[]
  entries: VaultEntry[]
}

type VaultDraft = {
  title: string
  content: string
}

type VaultStatus = {
  initialized: boolean
  unlocked: boolean
}

type SourceType = 'normal' | 'vault' | 'settings' | 'about'
type AppSettings = { theme: 'light' | 'ocean' | 'night'; uiFont: 'system' | 'pingfang' | 'yahei' | 'serif'; backupPath: string }
type AppAuthStatus = { initialized: boolean; unlocked: boolean }
type BackupExportResult = { filePath: string; fileName: string }

type MindNode = {
  text: string
  children?: MindNode[]
  collapsed?: boolean
  color?: string
  fontSize?: number
  x?: number
  y?: number
  side?: 'left' | 'right' | 'center'
  lineStyle?: 'curve' | 'straight' | 'bracket' | 'dashed'
}

type DragItem =
  | { kind: 'folder'; id: string }
  | { kind: 'note'; id: string }

type DropHint =
  | { kind: 'none' }
  | { kind: 'folder-into'; folderId: string }
  | { kind: 'folder-before'; folderId: string }
  | { kind: 'folder-after'; folderId: string }
  | { kind: 'note-before'; noteId: string; folderId: string }
  | { kind: 'note-after'; noteId: string; folderId: string }

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

const emptyData: AppData = { folders: [], notes: [] }
const emptyVault: VaultData = { folders: [], entries: [] }
const defaultSettings: AppSettings = { theme: 'light', uiFont: 'system', backupPath: '' }
const AUTO_LOCK_MS = 5 * 60 * 1000

export default function App() {
  const [data, setData] = useState<AppData>(emptyData)
  const [selectedNoteId, setSelectedNoteId] = useState<string>('')
  const [selectedFolderId, setSelectedFolderId] = useState<string>('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropHint, setDropHint] = useState<DropHint>({ kind: 'none' })
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number; label: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kind: 'folder' | 'note'; id: string } | null>(null)
  const [vaultContextMenu, setVaultContextMenu] = useState<{ x: number; y: number; kind: 'folder' | 'entry'; id: string } | null>(null)
  const [newFolderParent, setNewFolderParent] = useState<string | null | undefined>(undefined)
  const [newFolderName, setNewFolderName] = useState('')
  const [searchText, setSearchText] = useState('')
  const [editorMenu, setEditorMenu] = useState<{ x: number; y: number } | null>(null)
  const [newNoteFolderId, setNewNoteFolderId] = useState<string | null>(null)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteType, setNewNoteType] = useState<NoteType>('rich_text')
  const [vaultRenameFolderId, setVaultRenameFolderId] = useState<string | null>(null)
  const [vaultRenameFolderName, setVaultRenameFolderName] = useState('')
  const [mindContextMenu, setMindContextMenu] = useState<{ x: number; y: number; path: number[] } | null>(null)
  const [mindDragPath, setMindDragPath] = useState<number[] | null>(null)
  const [mindDropPath, setMindDropPath] = useState<number[] | null>(null)
  const [mindCanvasDrag, setMindCanvasDrag] = useState<{ path: number[]; dx: number; dy: number } | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [source, setSource] = useState<SourceType>('normal')
  const [appAuth, setAppAuth] = useState<AppAuthStatus>({ initialized: false, unlocked: false })
  const [authLoading, setAuthLoading] = useState(true)
  const [appAuthMode, setAppAuthMode] = useState<'init' | 'unlock' | null>(null)
  const [appPassword1, setAppPassword1] = useState('')
  const [appPassword2, setAppPassword2] = useState('')
  const [appError, setAppError] = useState('')

  const [vaultStatus, setVaultStatus] = useState<VaultStatus>({ initialized: false, unlocked: false })
  const [vaultData, setVaultData] = useState<VaultData>(emptyVault)
  const [vaultExpanded, setVaultExpanded] = useState<Record<string, boolean>>({})
  const [selectedVaultFolderId, setSelectedVaultFolderId] = useState<string>('')
  const [selectedVaultEntryId, setSelectedVaultEntryId] = useState<string>('')
  const [mindSelectionPath, setMindSelectionPath] = useState<number[]>([])
  const [vaultAuthMode, setVaultAuthMode] = useState<'init' | 'unlock' | null>(null)
  const [vaultPassword1, setVaultPassword1] = useState('')
  const [vaultPassword2, setVaultPassword2] = useState('')
  const [vaultError, setVaultError] = useState('')
  const [newVaultFolderParent, setNewVaultFolderParent] = useState<string | null | undefined>(undefined)
  const [newVaultFolderName, setNewVaultFolderName] = useState('')
  const [newVaultEntryFolderId, setNewVaultEntryFolderId] = useState<string | null>(null)
  const [newVaultEntryTitle, setNewVaultEntryTitle] = useState('')
  const [newVaultEntryType, setNewVaultEntryType] = useState<'login' | 'secure_note' | 'mnemonic' | 'private_key'>('login')
  const [vaultPasswordVisible, setVaultPasswordVisible] = useState(false)
  const [vaultBusy, setVaultBusy] = useState(false)
  const [clipboardNotice, setClipboardNotice] = useState('')
  const [vaultLastActive, setVaultLastActive] = useState(Date.now())
  const [vaultDraft, setVaultDraft] = useState<VaultDraft | null>(null)
  const [vaultConfirm, setVaultConfirm] = useState<{ message: string; action: 'saveDraft' | 'createFolder' | 'createEntry' | 'deleteEntry' | 'deleteFolder' | 'discardDraft' | 'navigateAway' | 'lock'; folderId?: string | null } | null>(null)
  const [appConfirm, setAppConfirm] = useState<{ message: string; action: 'deleteNote' | 'deleteFolder'; id: string } | null>(null)

  const dragStartRef = useRef<{ x: number; y: number; item: DragItem; label: string } | null>(null)
  const treePanelRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const editorContentRef = useRef<HTMLDivElement | null>(null)
  const savedEditorRangeRef = useRef<Range | null>(null)
  const vaultEditorRef = useRef<HTMLDivElement | null>(null)
  const tableMenuCellRef = useRef<HTMLTableCellElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [formatBrush, setFormatBrush] = useState<null | { bold: boolean; italic: boolean; underline: boolean; strike: boolean; foreColor: string; backColor: string; fontName: string; fontSize: string }>(null)
  const [selectedImageEl, setSelectedImageEl] = useState<HTMLImageElement | null>(null)
  const [tableMenu, setTableMenu] = useState<{ x: number; y: number } | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupNotice, setBackupNotice] = useState('')
  const [backupModalOpen, setBackupModalOpen] = useState(false)
  const [backupPassword, setBackupPassword] = useState('')
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [moreOpen, setMoreOpen] = useState(false)

  function handleEnterEscape(e: React.KeyboardEvent<HTMLElement>, onSubmit: () => void, onCancel?: () => void) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel?.()
    }
  }

useEffect(() => {
  try {
    const raw = localStorage.getItem('haimao-note-settings')
    if (!raw) return
    const parsed = JSON.parse(raw)
    setSettings({
      theme: parsed.theme === 'ocean' || parsed.theme === 'night' ? parsed.theme : 'light',
      uiFont: parsed.uiFont === 'pingfang' || parsed.uiFont === 'yahei' || parsed.uiFont === 'serif' ? parsed.uiFont : 'system',
      backupPath: typeof parsed.backupPath === 'string' ? parsed.backupPath : '',
    })
  } catch {}
}, [])

useEffect(() => {
  localStorage.setItem('haimao-note-settings', JSON.stringify(settings))
  document.documentElement.setAttribute('data-theme', settings.theme)
  document.documentElement.setAttribute('data-ui-font', settings.uiFont)
}, [settings])

function updateSettings<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  setSettings((prev) => ({ ...prev, [key]: value }))
}

  useEffect(() => {
    ;(async () => {
      try {
        const status = await invoke<AppAuthStatus>('app_auth_status')

        setAppAuth(status)
        setAppAuthMode(status.initialized ? (status.unlocked ? null : 'unlock') : 'init')
      } catch (e) {
        console.error('app_auth_status failed:', e)
        setAppAuth({ initialized: false, unlocked: false })
        setAppAuthMode('init')
      } finally {
        setAuthLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!appAuth.unlocked) return
    ;(async () => {
      try {
        const loaded = await invoke<AppData>('load_app_data')
        setData(loaded)
        const firstFolder = loaded.folders[0]?.id ?? ''
        setSelectedFolderId((prev) => prev || firstFolder)
      } catch {
        setData(emptyData)
      }
      try {
        const status = await invoke<VaultStatus>('vault_status')
        setVaultStatus(status)
      } catch {
        setVaultStatus({ initialized: false, unlocked: false })
      }
    })()
  }, [appAuth.unlocked])

  useEffect(() => {
    if (!vaultStatus.unlocked) return
    ;(async () => {
      try {
        const loaded = await invoke<VaultData>('load_vault_data')
        setVaultData(loaded)
        setSelectedVaultFolderId((prev) => prev || loaded.folders[0]?.id || '')
      } catch (e) {
        console.error(e)
      }
    })()
  }, [vaultStatus.unlocked])

  useEffect(() => {
    const currentEntry = vaultData.entries.find((entry) => entry.id === selectedVaultEntryId)
    if (!currentEntry) {
      setVaultDraft(null)
      return
    }
    setVaultDraft({ title: currentEntry.title, content: currentEntry.content })
  }, [selectedVaultEntryId, vaultData.entries, vaultStatus.unlocked])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      setContextMenu(null)
      setVaultContextMenu(null)
      setEditorMenu(null)
      setTableMenu(null)
      if (!target?.closest('.editor-image') && !target?.closest('.image-mini-toolbar')) {
        setSelectedImageEl(null)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !vaultStatus.unlocked) {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
      if (e.key === 'F2') {
        e.preventDefault()
        const note = data.notes.find((n) => n.id === selectedNoteId)
        if (note) beginRename('note', note.id, note.title)
        else {
          const folder = data.folders.find((f) => f.id === selectedFolderId)
          if (folder) beginRename('folder', folder.id, folder.name)
        }
      }
    }
    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [data.notes, data.folders, selectedNoteId, selectedFolderId, vaultStatus.unlocked])

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const start = dragStartRef.current
      if (!start) return
      const moved = Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y)
      if (!dragItem && moved > 6) setDragItem(start.item)
      if (!dragItem && moved <= 6) return
      setDragGhost({ x: e.clientX + 12, y: e.clientY + 12, label: start.label })
      setDropHint(computeHintFromPoint(e.clientX, e.clientY))
    }
    function onMouseUp() {
      const start = dragStartRef.current
      dragStartRef.current = null
      if (!dragItem || !start) {
        setDragGhost(null)
        setDropHint({ kind: 'none' })
        return
      }
      let next = structuredClone(data)
      next = dragItem.kind === 'note' ? moveNoteByHint(next, dragItem.id, dropHint) : moveFolderByHint(next, dragItem.id, dropHint)
      setDragItem(null)
      setDragGhost(null)
      setDropHint({ kind: 'none' })
      void persist(next)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragItem, dropHint, data])

  useEffect(() => {
    if (!vaultStatus.unlocked) return
    const markActive = () => setVaultLastActive(Date.now())
    const timer = window.setInterval(() => {
      if (Date.now() - vaultLastActive > AUTO_LOCK_MS) {
        void lockVault(true)
      }
    }, 15000)
    window.addEventListener('mousemove', markActive)
    window.addEventListener('keydown', markActive)
    window.addEventListener('mousedown', markActive)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('mousemove', markActive)
      window.removeEventListener('keydown', markActive)
      window.removeEventListener('mousedown', markActive)
    }
  }, [vaultStatus.unlocked, vaultLastActive])

  function captureEditorSelection() {
    const root = activeEditorRoot()
    const selection = window.getSelection()
    if (!root || !selection || !selection.rangeCount) return
    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return
    savedEditorRangeRef.current = range.cloneRange()
  }

  function restoreEditorSelection() {
    const root = activeEditorRoot()
    const savedRange = savedEditorRangeRef.current
    if (!root || !savedRange) return false
    root.focus()
    const selection = window.getSelection()
    if (!selection) return false
    selection.removeAllRanges()
    selection.addRange(savedRange)
    return true
  }

  function execEditorCommand(command: string, value?: string) {
    restoreEditorSelection()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(command, false, value)
    captureEditorSelection()
  }

  function normalizeFontSizeTags(px: number) {
    const root = activeEditorRoot()
    if (!root) return
    root.querySelectorAll('font[size="7"]').forEach((node) => {
      const el = node as HTMLElement
      el.style.fontSize = `${px}px`
      el.removeAttribute('size')
    })
    root.querySelectorAll('span').forEach((node) => {
      const el = node as HTMLElement
      const fontSize = (el.style.fontSize || '').trim().toLowerCase()
      if ([
        'xxx-large',
        'xx-large',
        'x-large',
        'larger',
        '-webkit-xxx-large',
        '-webkit-xx-large',
        '-webkit-x-large',
      ].includes(fontSize)) {
        el.style.fontSize = `${px}px`
      }
    })
  }

  function applyFontSize(px: number) {
    const root = activeEditorRoot()
    if (!root) return
    restoreEditorSelection()
    root.focus()
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount) return
    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return

    if (range.collapsed) {
      execEditorCommand('fontSize', '7')
      normalizeFontSizeTags(px)
      captureEditorSelection()
      void persistActiveEditor()
      return
    }

    const span = document.createElement('span')
    span.style.fontSize = `${px}px`

    try {
      const extracted = range.extractContents()
      span.appendChild(extracted)
      range.insertNode(span)

      selection.removeAllRanges()
      const newRange = document.createRange()
      newRange.selectNodeContents(span)
      selection.addRange(newRange)
      captureEditorSelection()
      void persistActiveEditor()
      return
    } catch {
      execEditorCommand('fontSize', '7')
      normalizeFontSizeTags(px)
      captureEditorSelection()
      void persistActiveEditor()
    }
  }

  function isEditorBlockElement(el: HTMLElement) {
    return /^(P|DIV|LI|BLOCKQUOTE|H1|H2|H3|H4|H5|H6|TD|TH|PRE)$/.test(el.tagName)
  }

  function findEditorBlock(node: Node | null, root: HTMLElement) {
    let current: Node | null = node
    while (current && current !== root) {
      if (current instanceof HTMLElement && isEditorBlockElement(current)) return current
      current = current.parentNode
    }
    return null
  }

  function collectBlocksInRange(root: HTMLElement, range: Range) {
    const blocks: HTMLElement[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (!(node instanceof HTMLElement)) return NodeFilter.FILTER_SKIP
        if (!isEditorBlockElement(node)) return NodeFilter.FILTER_SKIP
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
      },
    })
    while (walker.nextNode()) {
      blocks.push(walker.currentNode as HTMLElement)
    }
    return blocks
  }

  function collectAllEditorBlocks(root: HTMLElement) {
    const blocks: HTMLElement[] = []
    root.querySelectorAll('p,div,li,blockquote,h1,h2,h3,h4,h5,h6,td,th,pre').forEach((node) => {
      if (node instanceof HTMLElement) blocks.push(node)
    })
    return blocks
  }

  function applyLineHeight(value: string) {
    const root = activeEditorRoot()
    if (!root) return
    restoreEditorSelection()
    root.focus()
    const selection = window.getSelection()
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null
    const blockMap = new Map<HTMLElement, true>()
    if (range && root.contains(range.commonAncestorContainer)) {
      if (range.collapsed) {
        const currentBlock = findEditorBlock(range.startContainer, root)
        if (currentBlock) blockMap.set(currentBlock, true)
      } else {
        collectBlocksInRange(root, range).forEach((block) => blockMap.set(block, true))
      }
    }
    if (!blockMap.size) {
      collectAllEditorBlocks(root).forEach((block) => blockMap.set(block, true))
    }
    if (!blockMap.size) {
      execEditorCommand('formatBlock', 'p')
      const fallbackSelection = window.getSelection()
      const fallbackRange = fallbackSelection && fallbackSelection.rangeCount ? fallbackSelection.getRangeAt(0) : null
      if (fallbackRange && root.contains(fallbackRange.commonAncestorContainer)) {
        const currentBlock = findEditorBlock(fallbackRange.startContainer, root)
        if (currentBlock) blockMap.set(currentBlock, true)
      }
    }
    blockMap.forEach((_v, block) => {
      block.style.lineHeight = value
    })
    void persistActiveEditor()
  }

  function currentEditorSelectionText() {
    const sel = window.getSelection()
    return sel && !sel.isCollapsed ? sel.toString().trim() : ''
  }

  function captureFormatBrush() {
    if (!currentEditorSelectionText()) return
    setFormatBrush({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      foreColor: String(document.queryCommandValue('foreColor') || ''),
      backColor: String(document.queryCommandValue('hiliteColor') || document.queryCommandValue('backColor') || ''),
      fontName: String(document.queryCommandValue('fontName') || ''),
      fontSize: String(document.queryCommandValue('fontSize') || ''),
    })
  }

  function applyFormatBrushIfNeeded() {
    if (!formatBrush) return
    if (!currentEditorSelectionText()) return
    if (formatBrush.bold) execEditorCommand('bold')
    if (formatBrush.italic) execEditorCommand('italic')
    if (formatBrush.underline) execEditorCommand('underline')
    if (formatBrush.strike) execEditorCommand('strikeThrough')
    if (formatBrush.foreColor) execEditorCommand('foreColor', formatBrush.foreColor)
    if (formatBrush.backColor) execEditorCommand('hiliteColor', formatBrush.backColor)
    if (formatBrush.fontName) execEditorCommand('fontName', formatBrush.fontName)
    if (formatBrush.fontSize) execEditorCommand('fontSize', formatBrush.fontSize)
    setFormatBrush(null)
  }

  function activeEditorRoot() {
    if (source === 'vault' && selectedVaultEntry?.entryType === 'secure_note') return vaultEditorRef.current
    if (selectedNote?.noteType === 'rich_text') return editorContentRef.current
    return null
  }

  async function persistActiveEditor() {
    const root = activeEditorRoot()
    if (!root) return
    if (source === 'vault' && selectedVaultEntry?.entryType === 'secure_note') {
      updateVaultDraftPayloadField('notes', root.innerHTML)
    } else if (selectedNote?.noteType === 'rich_text') {
      await updateSelectedContent(root.innerHTML)
    }
  }

  function insertHtmlAtCursor(html: string) {
    activeEditorRoot()?.focus()
    document.execCommand('insertHTML', false, html)
  }

  function normalizeInsertedImage(img: HTMLImageElement) {
    const naturalWidth = img.naturalWidth || Number(img.getAttribute('data-natural-width') || 0) || 800
    const naturalHeight = img.naturalHeight || Number(img.getAttribute('data-natural-height') || 0) || 600
    const width = naturalWidth
    const height = naturalHeight
    img.setAttribute('data-natural-width', String(naturalWidth))
    img.setAttribute('data-natural-height', String(naturalHeight))
    img.style.width = `${width}px`
    img.style.height = `${height}px`
    img.style.maxWidth = 'none'
    img.style.display = 'block'
    img.style.margin = '8px 0'
    img.style.borderRadius = '8px'
    img.classList.add('editor-image')
  }

  function insertImageFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const src = String(reader.result || '')
      const probe = new Image()
      probe.onload = () => {
        const width = probe.naturalWidth || 800
        const height = probe.naturalHeight || 600
        insertHtmlAtCursor(`<img src="${src}" data-natural-width="${probe.naturalWidth || width}" data-natural-height="${probe.naturalHeight || height}" style="width:${width}px;height:${height}px;max-width:none;display:block;margin:8px 0;border-radius:8px;" class="editor-image" />`)
        void persistActiveEditor()
      }
      probe.src = src
    }
    reader.readAsDataURL(file)
  }

  function handleEditorPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(e.clipboardData?.items || [])
    const image = items.find((i) => i.type.startsWith('image/'))
    if (!image) return
    const file = image.getAsFile()
    if (!file) return
    e.preventDefault()
    insertImageFile(file)
  }

  function handleEditorClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      e.stopPropagation()
      setSelectedImageEl(target as HTMLImageElement)
      return
    }
    if (!target.closest('.image-mini-toolbar')) {
      setSelectedImageEl(null)
    }
  }

  function resizeSelectedImage(mode: 'original' | 25 | 50 | 75 | 100 | 'fit') {
    if (!selectedImageEl) return
    const nw = Number(selectedImageEl.getAttribute('data-natural-width') || selectedImageEl.naturalWidth || selectedImageEl.width || 0)
    const nh = Number(selectedImageEl.getAttribute('data-natural-height') || selectedImageEl.naturalHeight || selectedImageEl.height || 0)
    if (!nw || !nh) return
    let width = nw
    if (mode === 'fit') width = Math.max(200, (activeEditorRoot()?.clientWidth || nw) - 20)
    else if (mode !== 'original') width = Math.round(nw * (Number(mode) / 100))
    const height = Math.round((nh / nw) * width)
    selectedImageEl.style.width = `${width}px`
    selectedImageEl.style.height = `${height}px`
    void persistActiveEditor()
  }

  function insertBasicTable() {
    insertHtmlAtCursor(`<table class="editor-table"><tbody><tr><td>单元格</td><td>单元格</td></tr><tr><td>单元格</td><td>单元格</td></tr></tbody></table><p></p>`)
    void persistActiveEditor()
  }

  function openEditorContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    setContextMenu(null)
    const target = e.target as HTMLElement
    const cell = target.closest('td,th') as HTMLTableCellElement | null
    if (cell) {
      tableMenuCellRef.current = cell
      setTableMenu({ x: e.clientX, y: e.clientY })
      setEditorMenu(null)
      return
    }
    setTableMenu(null)
    setEditorMenu({ x: e.clientX, y: e.clientY })
  }

  function tableCellPosition() {
    const cell = tableMenuCellRef.current
    if (!cell) return { rowIndex: -1, cellIndex: -1, row: null as HTMLTableRowElement | null, table: null as HTMLTableElement | null }
    const row = cell.parentElement as HTMLTableRowElement | null
    const table = cell.closest('table') as HTMLTableElement | null
    return { rowIndex: row ? Array.from(row.children).indexOf(cell) : -1, cellIndex: row ? Array.from(row.children).indexOf(cell) : -1, row, table }
  }

  function withTableMutation(mutator: (table: HTMLTableElement, row: HTMLTableRowElement, index: number) => void) {
    const { row, table, cellIndex } = tableCellPosition()
    if (!row || !table || cellIndex < 0) return
    mutator(table, row, cellIndex)
    setTableMenu(null)
    void persistActiveEditor()
  }

  function tableInsertRow(where: 'above' | 'below') {
    withTableMutation((_table, row) => {
      const clone = row.cloneNode(true) as HTMLTableRowElement
      clone.querySelectorAll('td,th').forEach((c) => (c.textContent = ''))
      if (where === 'above') row.parentElement?.insertBefore(clone, row)
      else row.parentElement?.insertBefore(clone, row.nextSibling)
    })
  }

  function tableInsertCol(where: 'left' | 'right') {
    withTableMutation((table, _row, cellIndex) => {
      table.querySelectorAll('tr').forEach((tr) => {
        const cells = Array.from(tr.children)
        const ref = cells[cellIndex] as HTMLElement | undefined
        const td = document.createElement(ref?.tagName === 'TH' ? 'th' : 'td')
        td.textContent = ''
        if (!ref) tr.appendChild(td)
        else if (where === 'left') tr.insertBefore(td, ref)
        else tr.insertBefore(td, ref.nextSibling)
      })
    })
  }

  function tableDeleteRow() {
    withTableMutation((_table, row) => {
      row.remove()
    })
  }

  function tableDeleteCol() {
    withTableMutation((table, _row, cellIndex) => {
      table.querySelectorAll('tr').forEach((tr) => {
        const cell = tr.children[cellIndex]
        if (cell) cell.remove()
      })
    })
  }

  function tableDeleteTable() {
    const { table } = tableCellPosition()
    if (!table) return
    table.remove()
    setTableMenu(null)
    void persistActiveEditor()
  }

  function menuStyle(pos: {x:number,y:number} | null, width=180, height=240) {
    if (!pos) return undefined
    const left = Math.min(pos.x, window.innerWidth - width - 12)
    const top = Math.min(pos.y, window.innerHeight - height - 12)
    return { left, top }
  }

  const folderMap = useMemo(() => new Map(data.folders.map((f) => [f.id, f])), [data.folders])
  const noteMap = useMemo(() => new Map(data.notes.map((n) => [n.id, n])), [data.notes])
  const selectedNote = noteMap.get(selectedNoteId) ?? null
  const currentFolderId = selectedNote?.folderId ?? selectedFolderId
  const selectedFolder = folderMap.get(currentFolderId) ?? null
  const query = searchText.trim().toLowerCase()
  const selectedNoteHtml = useMemo(() => selectedNote ? highlightHtml(selectedNote.content, query, selectedNote.noteType) : '', [selectedNote, query])
  const normalizedMarkdownSource = useMemo(() => normalizeMarkdownSource(selectedNote?.content ?? ''), [selectedNote?.content])
  const markdownPreviewHtml = useMemo(() => selectedNote?.noteType === 'markdown' ? renderMarkdownToHtml(normalizedMarkdownSource || '# 这里写 Markdown') : '', [selectedNote?.noteType, normalizedMarkdownSource])
  const parsedMindRoot = useMemo(() => selectedNote?.noteType === 'mind_map' ? parseMindMapContent(selectedNote.content) : null, [selectedNote])
  const selectedMindNode = useMemo(() => parsedMindRoot ? getMindNodeAtPath(parsedMindRoot, mindSelectionPath) : null, [parsedMindRoot, mindSelectionPath])

  const vaultFolderMap = useMemo(() => new Map(vaultData.folders.map((f) => [f.id, f])), [vaultData.folders])
  const vaultEntryMap = useMemo(() => new Map(vaultData.entries.map((e) => [e.id, e])), [vaultData.entries])
  const selectedVaultEntry = vaultEntryMap.get(selectedVaultEntryId) ?? null
  const currentVaultFolderId = selectedVaultEntry?.folderId ?? selectedVaultFolderId
  const selectedVaultFolder = vaultFolderMap.get(currentVaultFolderId) ?? null
  const selectedVaultDraft = vaultDraft ?? (selectedVaultEntry ? { title: selectedVaultEntry.title, content: selectedVaultEntry.content } : null)
  const selectedVaultPayload = selectedVaultEntry ? parseVaultPayloadFromDraft(selectedVaultEntry, selectedVaultDraft) : {}
  const vaultDraftDirty = !!(selectedVaultEntry && selectedVaultDraft && (selectedVaultDraft.title !== selectedVaultEntry.title || selectedVaultDraft.content !== selectedVaultEntry.content))

  useEffect(() => {
    if (selectedNote?.noteType !== 'mind_map') {
      setMindSelectionPath([])
      return
    }
    if (!parsedMindRoot) {
      setMindSelectionPath([])
      return
    }
    const exists = getMindNodeAtPath(parsedMindRoot, mindSelectionPath)
    if (!exists) setMindSelectionPath([])
  }, [selectedNote?.id, selectedNote?.noteType, parsedMindRoot])

  const childFolders = (parentId: string | null) => data.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  const folderNotes = (folderId: string) => data.notes.filter((n) => n.folderId === folderId).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title))
  const vaultChildFolders = (parentId: string | null) => vaultData.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  const vaultFolderEntries = (folderId: string) => vaultData.entries.filter((n) => n.folderId === folderId).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title))

  const noteMatchIds = useMemo(() => {
    if (!query) return new Set<string>(data.notes.map((n) => n.id))
    return new Set(
      data.notes.filter((n) => `${n.title} ${stripHtml(n.content)}`.toLowerCase().includes(query)).map((n) => n.id),
    )
  }, [data.notes, query])

  const visibleFolderIds = useMemo(() => {
    if (!query) return new Set<string>(data.folders.map((f) => f.id))
    const ids = new Set<string>()
    for (const folder of data.folders) {
      if (folder.name.toLowerCase().includes(query)) {
        ids.add(folder.id)
        includeFolderAncestors(folder.id, folderMap, ids)
      }
    }
    for (const note of data.notes) {
      if (noteMatchIds.has(note.id)) {
        ids.add(note.folderId)
        includeFolderAncestors(note.folderId, folderMap, ids)
      }
    }
    return ids
  }, [data.folders, data.notes, folderMap, noteMatchIds, query])

  const breadcrumbFolders = useMemo(() => buildFolderPath(currentFolderId, folderMap), [currentFolderId, folderMap])
  const vaultBreadcrumbFolders = useMemo(() => buildFolderPath(currentVaultFolderId, vaultFolderMap), [currentVaultFolderId, vaultFolderMap])

  async function persist(next: AppData) {
    setData(next)
    if (!selectedFolderId && next.folders[0]) setSelectedFolderId(next.folders[0].id)
    await invoke('save_app_data', { appData: next })
  }

  async function persistVault(next: VaultData) {
    const prev = vaultData
    setVaultBusy(true)
    setVaultData(next)
    if (!selectedVaultFolderId && next.folders[0]) setSelectedVaultFolderId(next.folders[0].id)
    setVaultLastActive(Date.now())
    try {
      await invoke('save_vault_data', { vaultData: next })
      return true
    } catch (e) {
      console.error('save_vault_data failed', e)
      setVaultData(prev)
      window.alert(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setVaultBusy(false)
    }
  }

  async function reloadAppTree() {
    try {
      const loaded = await invoke<AppData>('load_app_data')
      setData(loaded)
      setExpanded({})
      setSelectedFolderId('')
      setSelectedNoteId('')
      setSource('normal')
      setContextMenu(null)
    } catch (e) {
      console.error('reloadAppTree failed', e)
    }
  }

  async function reloadVaultTree() {
    try {
      const loaded = await invoke<VaultData>('load_vault_data')
      setVaultData(loaded)
      setVaultExpanded({})
      setSelectedVaultFolderId('')
      setSelectedVaultEntryId('')
      setVaultDraft(null)
      setVaultContextMenu(null)
      setSource('vault')
    } catch (e) {
      console.error('reloadVaultTree failed', e)
    }
  }

  function beginRename(kind: 'folder' | 'note', id: string, current: string) {
    setContextMenu(null)
    setRenamingId(`${kind}:${id}`)
    setRenameValue(current)
  }

  async function commitRename() {
    if (!renamingId) return
    const [kind, id] = renamingId.split(':')
    const value = renameValue.trim()
    setRenamingId(null)
    if (!value) return
    const next = structuredClone(data)
    if (kind === 'folder') {
      const folder = next.folders.find((f) => f.id === id)
      if (folder) folder.name = value
    } else {
      const note = next.notes.find((n) => n.id === id)
      if (note) note.title = value
    }
    await persist(next)
  }

  async function createFolder(parentId: string | null) {
    const name = newFolderName.trim()
    if (!name) return
    const siblings = data.folders.filter((f) => f.parentId === parentId)
    const nextFolder: Folder = { id: uid('f'), parentId, name, sort: siblings.length }
    const next = { ...data, folders: [...data.folders, nextFolder] }
    setExpanded((prev) => ({ ...prev, [nextFolder.id]: true, ...(parentId ? { [parentId]: true } : {}) }))
    setSelectedFolderId(nextFolder.id)
    setSelectedNoteId('')
    setNewFolderName('')
    setNewFolderParent(undefined)
    await persist(next)
  }

  function openCreateNote(folderId: string | null) {
    const target = folderId ?? selectedFolderId ?? data.folders[0]?.id ?? null
    if (!target) {
      setNewFolderParent(null)
      setNewFolderName('')
      return
    }
    setNewNoteFolderId(target)
    setNewNoteTitle('')
    setNewNoteType('rich_text')
    setContextMenu(null)
  }

  async function createNote() {
    if (!newNoteFolderId) return
    const siblings = folderNotes(newNoteFolderId)
    const note: Note = {
      id: uid('n'),
      folderId: newNoteFolderId,
      title: newNoteTitle.trim() || defaultTitleByType(newNoteType),
      content: newNoteType === 'mind_map' ? JSON.stringify({ layout: 'mindMap', root: { data: { text: '中心主题' }, children: [] }, theme: { template: 'default', config: {} }, view: {} }, null, 2) : newNoteType === 'markdown' ? '' : '<p></p>',
      sort: siblings.length,
      noteType: newNoteType,
    }
    const next = { ...data, notes: [...data.notes, note] }
    setSelectedFolderId(newNoteFolderId)
    setSelectedNoteId(note.id)
    setExpanded((prev) => ({ ...prev, [newNoteFolderId]: true }))
    setNewNoteFolderId(null)
    await persist(next)
  }

  function updateMindMap(mutator: (root: MindNode) => { root: MindNode; nextPath?: number[] }) {
    if (!selectedNote || selectedNote.noteType !== 'mind_map') return
    const root = parseMindMapContent(selectedNote.content)
    const result = mutator(root)
    void updateSelectedContent(JSON.stringify({ root: result.root }, null, 2))
    setMindSelectionPath(result.nextPath ?? mindSelectionPath)
  }

  function renameSelectedMindNode(textValue: string) {
    updateMindMap((root) => {
      const node = getMindNodeAtPath(root, mindSelectionPath)
      if (node) node.text = textValue
      return { root }
    })
  }

  function addMindChild() {
    updateMindMap((root) => {
      const node = getMindNodeAtPath(root, mindSelectionPath) ?? root
      node.children = node.children ?? []
      node.children.push({ text: '新节点', children: [] })
      return { root, nextPath: [...mindSelectionPath, node.children.length - 1] }
    })
  }

  function addMindSibling() {
    if (!mindSelectionPath.length) return
    updateMindMap((root) => {
      const parentPath = mindSelectionPath.slice(0, -1)
      const parent = getMindNodeAtPath(root, parentPath)
      if (!parent) return { root }
      parent.children = parent.children ?? []
      const insertAt = (mindSelectionPath[mindSelectionPath.length - 1] ?? 0) + 1
      parent.children.splice(insertAt, 0, { text: '新节点', children: [] })
      return { root, nextPath: [...parentPath, insertAt] }
    })
  }

function deleteSelectedMindNode() {
  if (!mindSelectionPath.length) return
  updateMindMap((root) => {
    const parentPath = mindSelectionPath.slice(0, -1)
    const parent = getMindNodeAtPath(root, parentPath)
    if (!parent?.children) return { root, nextPath: [] }
    const index = mindSelectionPath[mindSelectionPath.length - 1] ?? 0
    parent.children.splice(index, 1)
    if (!parent.children.length) parent.children = []
    return { root, nextPath: parentPath }
  })
}

function setMindNodeColor(color: string) {
  updateMindMap((root) => {
    const node = getMindNodeAtPath(root, mindSelectionPath) ?? root
    node.color = color
    return { root }
  })
}

function setMindNodeFontSize(fontSize: number) {
  updateMindMap((root) => {
    const node = getMindNodeAtPath(root, mindSelectionPath) ?? root
    node.fontSize = fontSize
    return { root }
  })
}

function toggleMindCollapsed() {
  updateMindMap((root) => {
    const node = getMindNodeAtPath(root, mindSelectionPath) ?? root
    node.collapsed = !node.collapsed
    return { root }
  })
}

function toggleMindCollapsedAt(path: number[]) {
  setMindSelectionPath(path)
  updateMindMap((root) => {
    const node = getMindNodeAtPath(root, path) ?? root
    node.collapsed = !node.collapsed
    return { root, nextPath: path }
  })
}

function setMindNodeLineStyle(lineStyle: 'curve' | 'straight' | 'bracket' | 'dashed') {
  updateMindMap((root) => {
    const node = getMindNodeAtPath(root, mindSelectionPath) ?? root
    node.lineStyle = lineStyle
    return { root }
  })
}

function handleMindCanvasPointerDown(e: React.MouseEvent, path: number[], node: MindNode) {
  e.preventDefault()
  e.stopPropagation()
  setMindSelectionPath(path)
  setMindCanvasDrag({
    path,
    dx: e.clientX - (node.x ?? 0),
    dy: e.clientY - (node.y ?? 0),
  })
}

function handleMindCanvasPointerMove(e: React.MouseEvent) {
  if (!mindCanvasDrag || selectedNote?.noteType !== 'mind_map') return
  const x = Math.max(24, e.clientX - mindCanvasDrag.dx - 300)
  const y = Math.max(24, e.clientY - mindCanvasDrag.dy - 110)
  updateMindMap((root) => {
    const node = getMindNodeAtPath(root, mindCanvasDrag.path)
    if (!node) return { root }
    node.x = x
    node.y = y
    if (mindCanvasDrag.path.length > 0) {
      node.side = x < 560 ? 'left' : 'right'
    } else {
      node.side = 'center'
    }
    return { root, nextPath: mindCanvasDrag.path }
  })
}

function handleMindCanvasPointerUp() {
  if (!mindCanvasDrag) return
  setMindCanvasDrag(null)
}

function handleMindNodeContextMenu(e: React.MouseEvent, path: number[]) {
  e.preventDefault()
  setMindSelectionPath(path)
  setMindContextMenu({ x: e.clientX, y: e.clientY, path })
}

function handleMindNodeDragStart(e: React.DragEvent, path: number[]) {
  e.stopPropagation()
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('application/x-seacat-mind-path', path.join(','))
  e.dataTransfer.setData('text/plain', path.join(','))
  setMindDragPath(path)
  setMindSelectionPath(path)
  setMindDropPath(null)
}

function handleMindNodeDragEnter(targetPath: number[]) {
  if (!mindDragPath) return
  if (mindDragPath.join(',') === targetPath.join(',')) return
  setMindDropPath(targetPath)
}

function handleMindNodeDragEnd() {
  setMindDragPath(null)
  setMindDropPath(null)
}

function moveMindNode(dragPath: number[], targetPath: number[]) {
  if (!selectedNote || selectedNote.noteType !== 'mind_map') return
  if (dragPath.join(',') === targetPath.join(',')) return
  if (!dragPath.length) return
  updateMindMap((root) => {
    const sourceParentPath = dragPath.slice(0, -1)
    const sourceParent = getMindNodeAtPath(root, sourceParentPath)
    const dragIndex = dragPath[dragPath.length - 1] ?? 0
    const moving = sourceParent?.children?.[dragIndex]
    const target = getMindNodeAtPath(root, targetPath)
    if (!moving || !target || !sourceParent?.children) return { root }
    sourceParent.children.splice(dragIndex, 1)
    target.children = target.children ?? []
    target.children.push(moving)
    target.collapsed = false
    return { root, nextPath: [...targetPath, target.children.length - 1] }
  })
  setMindDragPath(null)
  setMindDropPath(null)
}

function handleMindNodeDrop(e: React.DragEvent, targetPath: number[]) {
  e.preventDefault()
  e.stopPropagation()
  const raw = e.dataTransfer.getData('application/x-seacat-mind-path') || e.dataTransfer.getData('text/plain')
  const dragPath = raw ? raw.split(',').filter(Boolean).map((v) => Number(v)) : mindDragPath
  if (!dragPath || !dragPath.length) return
  if (dragPath.some((v) => Number.isNaN(v))) return
  moveMindNode(dragPath, targetPath)
}

function promoteMindNode() {
  if (!mindSelectionPath.length) return
  updateMindMap((root) => {
    const parentPath = mindSelectionPath.slice(0, -1)
    if (!parentPath.length) return { root }
    const grandPath = parentPath.slice(0, -1)
    const parentIndex = parentPath[parentPath.length - 1] ?? 0
    const nodeIndex = mindSelectionPath[mindSelectionPath.length - 1] ?? 0
    const parentNode = getMindNodeAtPath(root, parentPath)
    const grandNode = getMindNodeAtPath(root, grandPath)
    if (!parentNode || !grandNode?.children || !parentNode.children?.[nodeIndex]) return { root }
    const moving = parentNode.children.splice(nodeIndex, 1)[0]
    grandNode.children.splice(parentIndex + 1, 0, moving)
    return { root, nextPath: [...grandPath, parentIndex + 1] }
  })
}

function handleMindMapKeyDown(e: React.KeyboardEvent) {
  if (selectedNote?.noteType !== 'mind_map') return
  if (e.key === 'Enter') {
    e.preventDefault()
    addMindSibling()
  } else if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault()
    promoteMindNode()
  } else if (e.key === 'Tab') {
    e.preventDefault()
    addMindChild()
  } else if (e.key === 'Delete' && mindSelectionPath.length) {
    e.preventDefault()
    deleteSelectedMindNode()
  }
}

async function deleteItem(kind: 'folder' | 'note', id: string) {
    setContextMenu(null)
    if (kind === 'note') {
      const note = data.notes.find((n) => n.id === id)
      setAppConfirm({ message: `确认删除笔记“${note?.title || '未命名笔记'}”吗？此操作无法撤销。`, action: 'deleteNote', id })
      return
    }
    const folder = data.folders.find((f) => f.id === id)
    const folderIds = collectDescendantFolderIds(data.folders, id)
    const childFolderCount = folderIds.length - 1
    const childNoteCount = data.notes.filter((n) => folderIds.includes(n.folderId)).length
    const extra = childFolderCount || childNoteCount ? `\n\n该分类下还有 ${childFolderCount} 个子分类、${childNoteCount} 篇笔记，会一并删除。` : ''
    setAppConfirm({ message: `确认删除分类“${folder?.name || '未命名分类'}”吗？${extra}`, action: 'deleteFolder', id })
  }

  async function confirmAppAction() {
    const current = appConfirm
    if (!current) return
    setAppConfirm(null)

    if (current.action === 'deleteNote') {
      const nextNotes = data.notes.filter((n) => n.id !== current.id)
      const next = { ...data, notes: resequenceNotes(nextNotes) }
      if (selectedNoteId === current.id) setSelectedNoteId('')
      await persist(next)
      return
    }

    const folderIds = collectDescendantFolderIds(data.folders, current.id)
    const nextFolders = data.folders.filter((f) => !folderIds.includes(f.id))
    const nextNotes = data.notes.filter((n) => !folderIds.includes(n.folderId))
    const next = { folders: resequenceFolders(nextFolders), notes: resequenceNotes(nextNotes) }
    if (folderIds.includes(selectedFolderId)) {
      setSelectedFolderId(nextFolders[0]?.id ?? '')
      setSelectedNoteId('')
    }
    if (selectedNote && folderIds.includes(selectedNote.folderId)) setSelectedNoteId('')
    await persist(next)
  }

  async function updateSelectedTitle(value: string) {
    if (!selectedNote) return
    const next = structuredClone(data)
    const note = next.notes.find((n) => n.id === selectedNote.id)
    if (note) note.title = value || '未命名笔记'
    await persist(next)
  }

  async function updateSelectedContent(content: string) {
    if (!selectedNote) return
    const next = structuredClone(data)
    const note = next.notes.find((n) => n.id === selectedNote.id)
    if (note) note.content = selectedNote.noteType === 'rich_text' ? stripSearchMarks(content) : content
    await persist(next)
  }

  async function updateSelectedType(noteType: NoteType) {
    if (!selectedNote) return
    const next = structuredClone(data)
    const note = next.notes.find((n) => n.id === selectedNote.id)
    if (note) {
      note.noteType = noteType
      if (noteType !== 'rich_text' && note.content.startsWith('<')) note.content = stripHtml(note.content)
    }
    await persist(next)
  }

  async function createVaultFolder(parentId: string | null) {
    const name = newVaultFolderName.trim()
    if (!name) return
    await doCreateVaultFolder(parentId)
  }

  async function doCreateVaultFolder(parentId: string | null) {
    const name = newVaultFolderName.trim()
    if (!name) return
    const siblings = vaultData.folders.filter((f) => f.parentId === parentId)
    const nextFolder: VaultFolder = { id: uid('vf'), parentId, name, sort: siblings.length }
    const next = { ...vaultData, folders: [...vaultData.folders, nextFolder] }
    const ok = await persistVault(next)
    if (!ok) return
    setVaultExpanded((prev) => ({ ...prev, [nextFolder.id]: true, ...(parentId ? { [parentId]: true } : {}) }))
    setSelectedVaultFolderId(nextFolder.id)
    setSelectedVaultEntryId('')
    setNewVaultFolderName('')
    setNewVaultFolderParent(undefined)
  }

  async function renameVaultFolder(folderId: string) {
    const folder = vaultFolderMap.get(folderId)
    if (!folder) return
    setVaultContextMenu(null)
    setVaultRenameFolderId(folderId)
    setVaultRenameFolderName(folder.name)
  }

  async function confirmRenameVaultFolder() {
    if (!vaultRenameFolderId) return
    const name = vaultRenameFolderName.trim()
    const folder = vaultFolderMap.get(vaultRenameFolderId)
    if (!folder || !name || name === folder.name) {
      setVaultRenameFolderId(null)
      return
    }
    const next = structuredClone(vaultData)
    const target = next.folders.find((f) => f.id === vaultRenameFolderId)
    if (!target) return
    target.name = name
    const ok = await persistVault({ ...next, folders: resequenceFolders(next.folders) })
    if (ok) {
      setVaultRenameFolderId(null)
      setVaultRenameFolderName('')
    }
  }

  function deleteVaultFolder(folderId: string) {
    const folder = vaultFolderMap.get(folderId)
    if (!folder) return
    const ids = collectDescendantFolderIds(vaultData.folders, folderId)
    const entryCount = vaultData.entries.filter((e) => ids.includes(e.folderId)).length
    setVaultContextMenu(null)
    setVaultConfirm({ message: `确认删除保险箱目录「${folder.name}」吗？将同时删除 ${ids.length} 个目录和 ${entryCount} 条条目，此操作无法撤销。`, action: 'deleteFolder', folderId })
  }

  async function doDeleteVaultFolder(folderId: string) {
    const ids = collectDescendantFolderIds(vaultData.folders, folderId)
    const nextFolders = vaultData.folders.filter((f) => !ids.includes(f.id))
    const nextEntries = vaultData.entries.filter((e) => !ids.includes(e.folderId))
    const next = { folders: resequenceFolders(nextFolders), entries: resequenceNotes(nextEntries) }
    const okSave = await persistVault(next)
    if (!okSave) return
    if (ids.includes(selectedVaultFolderId)) setSelectedVaultFolderId('')
    if (selectedVaultEntry && ids.includes(selectedVaultEntry.folderId)) setSelectedVaultEntryId('')
  }

  function openCreateVaultEntry(folderId: string | null) {
    const target = folderId ?? selectedVaultFolderId ?? vaultData.folders[0]?.id ?? null
    if (!target) {
      setNewVaultFolderParent(null)
      return
    }
    setNewVaultEntryFolderId(target)
    setNewVaultEntryTitle('')
    setNewVaultEntryType('login')
  }

  async function createVaultEntry() {
    if (!newVaultEntryFolderId) return
    await doCreateVaultEntry()
  }

  async function doCreateVaultEntry() {
    if (!newVaultEntryFolderId) return
    const siblings = vaultFolderEntries(newVaultEntryFolderId)
    const entry: VaultEntry = { id: uid('ve'), folderId: newVaultEntryFolderId, title: newVaultEntryTitle.trim() || defaultVaultTitle(newVaultEntryType), content: createVaultTemplate(newVaultEntryType), sort: siblings.length, entryType: newVaultEntryType }
    const next = { ...vaultData, entries: [...vaultData.entries, entry] }
    const ok = await persistVault(next)
    if (!ok) return
    setSelectedVaultFolderId(newVaultEntryFolderId)
    setSelectedVaultEntryId(entry.id)
    setVaultExpanded((prev) => ({ ...prev, [newVaultEntryFolderId]: true }))
    setNewVaultEntryFolderId(null)
    setNewVaultEntryType('login')
    setNewVaultEntryTitle('')
  }

  function updateVaultDraftTitle(value: string) {
    setVaultDraft((prev) => ({ title: value, content: prev?.content ?? selectedVaultEntry?.content ?? '' }))
  }

  function updateVaultDraftContent(value: string) {
    setVaultDraft((prev) => ({ title: prev?.title ?? selectedVaultEntry?.title ?? '', content: value }))
  }

  function updateVaultDraftPayloadField(field: string, value: string) {
    if (!selectedVaultEntry) return
    const payload = parseVaultPayloadFromDraft(selectedVaultEntry, selectedVaultDraft)
    payload[field] = value
    updateVaultDraftContent(JSON.stringify(payload, null, 2))
  }

  async function saveVaultDraft() {
    if (!selectedVaultEntry || !selectedVaultDraft || !vaultDraftDirty) return
    await doSaveVaultDraft()
  }

  async function doSaveVaultDraft() {
    if (!selectedVaultEntry || !selectedVaultDraft || !vaultDraftDirty) return
    const next = structuredClone(vaultData)
    const entry = next.entries.find((e) => e.id === selectedVaultEntry.id)
    if (!entry) return
    entry.title = selectedVaultDraft.title.trim() || defaultVaultTitle(selectedVaultEntry.entryType)
    entry.content = selectedVaultDraft.content
    const ok = await persistVault(next)
    if (!ok) return
    setVaultDraft({ title: entry.title, content: entry.content })
  }

  function discardVaultDraft() {
    if (!selectedVaultEntry) return
    if (vaultDraftDirty) {
      setVaultConfirm({ message: '确认放弃当前未保存的修改吗？', action: 'discardDraft' })
      return
    }
    setVaultDraft({ title: selectedVaultEntry.title, content: selectedVaultEntry.content })
  }

  function deleteVaultEntry() {
    if (!selectedVaultEntry) return
    setVaultConfirm({ message: `确认删除保险箱条目「${selectedVaultEntry.title}」吗？此操作无法撤销。`, action: 'deleteEntry' })
  }

  async function doDeleteVaultEntry() {
    if (!selectedVaultEntry) return
    const nextEntries = vaultData.entries.filter((entry) => entry.id !== selectedVaultEntry.id)
    const next = { ...vaultData, entries: resequenceNotes(nextEntries) }
    const ok = await persistVault(next)
    if (!ok) return
    setSelectedVaultEntryId('')
    setVaultDraft(null)
  }

  const pendingVaultNavigationRef = useRef<null | (() => void)>(null)

  function guardVaultNavigation(action: () => void) {
    if (vaultDraftDirty) {
      pendingVaultNavigationRef.current = action
      setVaultConfirm({ message: '当前保险箱条目有未保存修改，确认放弃后再离开吗？', action: 'navigateAway' })
      return
    }
    action()
  }

  async function confirmVaultAction() {
    const current = vaultConfirm
    if (!current) return
    setVaultConfirm(null)
    switch (current.action) {
      case 'saveDraft':
        await doSaveVaultDraft();
        break
      case 'createFolder':
        await doCreateVaultFolder(current.folderId ?? null)
        break
      case 'createEntry':
        await doCreateVaultEntry()
        break
      case 'deleteEntry':
        await doDeleteVaultEntry()
        break
      case 'deleteFolder':
        if (current.folderId) await doDeleteVaultFolder(current.folderId)
        break
      case 'discardDraft':
        if (selectedVaultEntry) setVaultDraft({ title: selectedVaultEntry.title, content: selectedVaultEntry.content })
        break
      case 'navigateAway': {
        const action = pendingVaultNavigationRef.current
        pendingVaultNavigationRef.current = null
        if (selectedVaultEntry) setVaultDraft({ title: selectedVaultEntry.title, content: selectedVaultEntry.content })
        action?.()
        break
      }
      case 'lock':
        await lockVault(true)
        break
    }
  }

  async function copySensitive(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text || '')
      setClipboardNotice(`${label}已复制，15秒后自动清空剪贴板`)
      window.setTimeout(async () => {
        try { await navigator.clipboard.writeText('') } catch {}
        setClipboardNotice('')
      }, 15000)
    } catch {
      setClipboardNotice(`复制${label}失败`)
      window.setTimeout(() => setClipboardNotice(''), 3000)
    }
  }

  async function submitAppAuth() {
    setAppError('')
    try {
      if (appAuthMode === 'init') {
        if (appPassword1.length < 4) throw new Error('主密码至少 4 位')
        if (appPassword1 !== appPassword2) throw new Error('两次输入的主密码不一致')
        await invoke('app_auth_initialize', { password: appPassword1 })
      } else {
        await invoke('app_auth_unlock', { password: appPassword1 })
      }
      const status = await invoke<AppAuthStatus>('app_auth_status')

      setAppAuth(status)
      setAppAuthMode(null)
      setAppPassword1('')
      setAppPassword2('')
    } catch (e) {
      console.error('submitAppAuth error:', e)
      setAppError(e instanceof Error ? e.message : String(e))
    }
  }

  async function submitVaultAuth() {
    try {
      setVaultError('')
      if (vaultAuthMode === 'init') {
        if (vaultPassword1 !== vaultPassword2) throw new Error('两次密码输入不一致')
        await invoke('vault_initialize', { password: vaultPassword1 })
      } else if (vaultAuthMode === 'unlock') {
        await invoke('vault_unlock', { password: vaultPassword1 })
      }
      const status = await invoke<VaultStatus>('vault_status')
      setVaultStatus(status)
      setVaultAuthMode(null)
      setVaultPassword1('')
      setVaultPassword2('')
      setVaultLastActive(Date.now())
    } catch (e) {
      setVaultError(String(e))
    }
  }

  async function exportBackup() {
    try {
      if (!backupPassword.trim()) throw new Error('请先输入备份密码')
      const outputPath = await save({
        title: '导出备份',
        defaultPath: settings.backupPath.trim() ? `${settings.backupPath.replace(/\/$/, '')}/haimao-note-backup-${Date.now()}.scbackup` : `haimao-note-backup-${Date.now()}.scbackup`,
        filters: [{ name: 'SeaCat 备份', extensions: ['scbackup'] }],
      })
      if (!outputPath) return
      setBackupBusy(true)
      const result = await invoke<BackupExportResult>('export_backup', { outputPath, password: backupPassword })
      setBackupNotice(`备份已导出：${result.filePath}`)
      window.alert(`备份导出成功：
${result.filePath}`)
      setBackupModalOpen(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setBackupNotice(`导出失败：${message}`)
      window.alert(message)
    } finally {
      setBackupBusy(false)
    }
  }

  async function importBackup() {
    try {
      const selected = await open({
        title: '选择备份文件',
        multiple: false,
        filters: [{ name: 'SeaCat 备份', extensions: ['scbackup', 'zip'] }],
      })
      if (!selected || Array.isArray(selected)) return
      if (!backupPassword.trim()) throw new Error('请先输入备份密码')
      setBackupBusy(true)
      await invoke('import_backup', { filePath: selected, password: backupPassword })
      setData(emptyData)
      setExpanded({})
      setSelectedFolderId('')
      setSelectedNoteId('')
      setVaultData(emptyVault)
      setVaultExpanded({})
      setSelectedVaultFolderId('')
      setSelectedVaultEntryId('')
      setVaultDraft(null)
      setVaultPasswordVisible(false)
      setSource('normal')
      const appStatus = await invoke<AppAuthStatus>('app_auth_status')
      setAppAuth(appStatus)
      setAppAuthMode(appStatus.initialized ? (appStatus.unlocked ? null : 'unlock') : 'init')
      const nextVaultStatus = await invoke<VaultStatus>('vault_status')
      setVaultStatus(nextVaultStatus)
      setVaultAuthMode(nextVaultStatus.initialized ? 'unlock' : 'init')
      setBackupNotice(`备份已导入：${selected}`)
      window.alert('备份导入成功。当前数据已恢复，请重新解锁后继续使用。')
      setBackupModalOpen(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setBackupNotice(`导入失败：${message}`)
      window.alert(message)
    } finally {
      setBackupBusy(false)
    }
  }

  async function lockVault(silent = false) {
    if (!silent && vaultDraftDirty && !window.confirm('当前保险箱条目有未保存修改，确认直接锁定并放弃这些修改吗？')) return
    await invoke('vault_lock')
    setVaultStatus((prev) => ({ ...prev, unlocked: false }))
    setVaultData(emptyVault)
    setSelectedVaultEntryId('')
    setSelectedVaultFolderId('')
    setVaultDraft(null)
    setSource('normal')
    if (!silent) setVaultError('')
  }

  function startPointerDrag(item: DragItem, label: string, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button, input, textarea, select')) return
    setContextMenu(null)
    dragStartRef.current = { x: e.clientX, y: e.clientY, item, label }
  }

  function computeHintFromPoint(clientX: number, clientY: number): DropHint {
    const panel = treePanelRef.current
    if (!panel) return { kind: 'none' }
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const row = el?.closest('.tree-row') as HTMLElement | null
    if (!row || !panel.contains(row)) return { kind: 'none' }
    const rect = row.getBoundingClientRect()
    const ratio = rect.height ? (clientY - rect.top) / rect.height : 0.5
    const kind = row.dataset.kind as 'folder' | 'note' | undefined
    const id = row.dataset.id
    const folderId = row.dataset.folderId
    if (!kind || !id) return { kind: 'none' }
    if (kind === 'folder') {
      if (ratio < 0.28) return { kind: 'folder-before', folderId: id }
      if (ratio > 0.72) return { kind: 'folder-after', folderId: id }
      return { kind: 'folder-into', folderId: id }
    }
    if (!folderId) return { kind: 'none' }
    return ratio < 0.5 ? { kind: 'note-before', noteId: id, folderId } : { kind: 'note-after', noteId: id, folderId }
  }

  function renderFolder(folder: Folder, depth = 0): JSX.Element | null {
    if (query && !visibleFolderIds.has(folder.id)) return null
    const isOpen = query ? true : (expanded[folder.id] ?? false)
    const notes = folderNotes(folder.id).filter((n) => !query || noteMatchIds.has(n.id))
    const folders = childFolders(folder.id)
    const renameKey = `folder:${folder.id}`
    const isRenaming = renamingId === renameKey
    const rowClass = [
      'tree-row', 'folder-row',
      selectedFolderId === folder.id && !selectedNoteId ? 'folder-selected' : '',
      dropHint.kind === 'folder-before' && dropHint.folderId === folder.id ? 'drop-before-row' : '',
      dropHint.kind === 'folder-after' && dropHint.folderId === folder.id ? 'drop-after-row' : '',
      dropHint.kind === 'folder-into' && dropHint.folderId === folder.id ? 'drop-into-folder' : '',
    ].filter(Boolean).join(' ')
    return (
      <div key={folder.id}>
        <div className={rowClass} style={{ paddingLeft: 10 + depth * 12 }} data-kind="folder" data-id={folder.id}
          onMouseDown={(e) => startPointerDrag({ kind: 'folder', id: folder.id }, folder.name, e)}
          onClick={() => { setSource('normal'); setSelectedFolderId(folder.id); setSelectedNoteId(''); setSelectedVaultEntryId('') }}
          onContextMenu={(e) => { e.preventDefault(); setSource('normal'); setSelectedFolderId(folder.id); setSelectedNoteId(''); setContextMenu({ x: e.clientX, y: e.clientY, kind: 'folder', id: folder.id }) }}
          onDoubleClick={() => beginRename('folder', folder.id, folder.name)}>
          <button type="button" className="twist" onClick={(ev) => { ev.stopPropagation(); setExpanded((p) => ({ ...p, [folder.id]: !isOpen })) }}>{isOpen ? '▾' : '▸'}</button>
          {isRenaming ? <input autoFocus className="inline-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => void commitRename()} onKeyDown={(e) => { if (e.key === 'Enter') void commitRename(); if (e.key === 'Escape') setRenamingId(null) }} /> : <span className="folder-name">{renderHighlighted(folder.name, query)}</span>}
          {(notes.length + folders.length) > 0 ? <span className="tree-count">{notes.length + folders.length}</span> : null}
        </div>
        {isOpen && <div className="tree-children">{folders.map((f) => renderFolder(f, depth + 1))}{notes.map((n) => renderNote(n, depth + 1))}</div>}
      </div>
    )
  }

  function renderNote(note: Note, depth = 0): JSX.Element | null {
    if (query && !noteMatchIds.has(note.id)) return null
    const renameKey = `note:${note.id}`
    const isRenaming = renamingId === renameKey
    const rowClass = ['tree-row', 'note-row', selectedNoteId === note.id ? 'selected' : '', dropHint.kind === 'note-before' && dropHint.noteId === note.id ? 'drop-before-row' : '', dropHint.kind === 'note-after' && dropHint.noteId === note.id ? 'drop-after-row' : ''].filter(Boolean).join(' ')
    return (
      <div key={note.id}>
        <div className={rowClass} style={{ paddingLeft: 10 + depth * 12 }} data-kind="note" data-id={note.id} data-folder-id={note.folderId}
          onMouseDown={(e) => startPointerDrag({ kind: 'note', id: note.id }, note.title || '未命名笔记', e)}
          onClick={() => { setSource('normal'); setSelectedFolderId(note.folderId); setSelectedNoteId(note.id); setSelectedVaultEntryId('') }}
          onContextMenu={(e) => { e.preventDefault(); setSource('normal'); setSelectedFolderId(note.folderId); setSelectedNoteId(note.id); setContextMenu({ x: e.clientX, y: e.clientY, kind: 'note', id: note.id }) }}
          onDoubleClick={() => beginRename('note', note.id, note.title)}>
          <span className={`note-type-dot note-type-dot--${note.noteType}`}></span>
          {isRenaming ? <input autoFocus className="inline-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => void commitRename()} onKeyDown={(e) => { if (e.key === 'Enter') void commitRename(); if (e.key === 'Escape') setRenamingId(null) }} /> : <span className="note-name">{renderHighlighted(note.title || '未命名笔记', query)}</span>}
        </div>
      </div>
    )
  }

  function renderVaultFolder(folder: VaultFolder, depth = 0): JSX.Element {
    const isOpen = vaultExpanded[folder.id] ?? false
    const entries = vaultFolderEntries(folder.id)
    const folders = vaultChildFolders(folder.id)
    return (
      <div key={folder.id}>
        <div
          className={`tree-row folder-row ${selectedVaultFolderId === folder.id && !selectedVaultEntryId ? 'folder-selected' : ''}`}
          style={{ paddingLeft: 10 + depth * 12 }}
          onClick={() => guardVaultNavigation(() => { setSource('vault'); setSelectedVaultFolderId(folder.id); setSelectedVaultEntryId(''); setVaultLastActive(Date.now()) })}
          onContextMenu={(e) => {
            e.preventDefault()
            setContextMenu(null)
            setSource('vault')
            setSelectedVaultFolderId(folder.id)
            setSelectedVaultEntryId('')
            setVaultContextMenu({ x: e.clientX, y: e.clientY, kind: 'folder', id: folder.id })
          }}
        >
          <button type="button" className="twist" onClick={(ev) => { ev.stopPropagation(); setVaultExpanded((p) => ({ ...p, [folder.id]: !isOpen })) }}>{isOpen ? '▾' : '▸'}</button>
          <span className="folder-name">{folder.name}</span>
          {(entries.length + folders.length) > 0 ? <span className="tree-count">{entries.length + folders.length}</span> : null}
        </div>
        {isOpen && <div className="tree-children">{folders.map((f) => renderVaultFolder(f, depth + 1))}{entries.map((e) => renderVaultEntry(e, depth + 1))}</div>}
      </div>
    )
  }

  function renderVaultEntry(entry: VaultEntry, depth = 0): JSX.Element {
    return (
      <div key={entry.id} className={`tree-row note-row ${selectedVaultEntryId === entry.id ? 'selected' : ''}`} style={{ paddingLeft: 10 + depth * 12 }} onClick={() => guardVaultNavigation(() => { setSource('vault'); setSelectedVaultFolderId(entry.folderId); setSelectedVaultEntryId(entry.id); setVaultLastActive(Date.now()) })} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); setSource('vault'); setSelectedVaultFolderId(entry.folderId); setSelectedVaultEntryId(entry.id); setVaultContextMenu({ x: e.clientX, y: e.clientY, kind: 'entry', id: entry.id }) }}>
        <span className="vault-lock-dot">🔐</span>
        <span className="note-name">{entry.title}</span>
        <span className="vault-entry-type-chip">{vaultEntryTypeLabel(entry.entryType)}</span>
      </div>
    )
  }

  const folderChildren = selectedFolder ? childFolders(selectedFolder.id) : childFolders(null)
  const folderChildNotes = currentFolderId ? folderNotes(currentFolderId) : []
  const visibleChildFolders = folderChildren.filter((f) => !query || visibleFolderIds.has(f.id))
  const visibleChildNotes = folderChildNotes.filter((n) => !query || noteMatchIds.has(n.id))
  const visibleVaultFolders = selectedVaultFolder ? vaultChildFolders(selectedVaultFolder.id) : vaultChildFolders(null)
  const visibleVaultEntries = currentVaultFolderId ? vaultFolderEntries(currentVaultFolderId) : []

  const showingVault = source === 'vault' && vaultStatus.unlocked

  if (authLoading) return <div className="auth-screen"><div className="auth-card"><div className="modal-title">正在载入…</div></div></div>

  if (!appAuth.unlocked) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="modal-title">{appAuthMode === 'init' ? '设置主密码' : '输入主密码'}</div>
          <input type="password" value={appPassword1} onChange={(e) => setAppPassword1(e.target.value)} onKeyDown={(e) => handleEnterEscape(e, () => { void submitAppAuth() }, appAuthMode ? () => setAppAuthMode(null) : undefined)} placeholder={appAuthMode === 'init' ? '设置主密码' : '输入主密码'} autoFocus />
          {appAuthMode === 'init' ? <input type="password" value={appPassword2} onChange={(e) => setAppPassword2(e.target.value)} onKeyDown={(e) => handleEnterEscape(e, () => { void submitAppAuth() }, appAuthMode ? () => setAppAuthMode(null) : undefined)} placeholder="再次输入主密码" /> : null}
          {appError ? <div className="vault-error">{appError}</div> : <div className="vault-subtle">解锁后才能进入主页面。保险箱仍然需要单独解锁。</div>}
          <div className="modal-actions">
            <button className="primary" onClick={() => void submitAppAuth()}>{appAuthMode === 'init' ? '创建并进入' : '解锁进入'}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-search-row">
            <input ref={searchInputRef} className="search-input" placeholder="搜索标题、正文、分类（⌘/Ctrl+F）" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            {searchText ? <button className="clear-search" onClick={() => setSearchText('')}>×</button> : null}
          </div>
          <div className="toolbar-mini">
            <button className="primary" onClick={() => { setSource('normal'); openCreateNote(selectedFolderId || selectedNote?.folderId || data.folders[0]?.id || null) }}>+笔记</button>
            <button onClick={() => { setSource('normal'); setNewFolderParent(null); setNewFolderName('') }}>+分类</button>
            <button className="icon-tool-btn" title="刷新" aria-label="刷新" onClick={() => void reloadAppTree()}>⟳</button>
            <button className="icon-tool-btn" title="备份 / 恢复" aria-label="备份 / 恢复" onClick={() => setBackupModalOpen(true)}>🗄</button>
            <div className="more-wrap">
            <button className="icon-tool-btn" onClick={(e)=>{e.stopPropagation();setMoreOpen(v=>!v)}}>›</button>
            {moreOpen ? (
              <div className="more-pop">
                <button onClick={()=>{setSource('settings');setMoreOpen(false)}}>⚙ 设置</button>
                <button onClick={()=>{setSource('about');setMoreOpen(false)}}>ⓘ 关于</button>
              </div>
            ) : null}
          </div>
          </div>
          <div className="search-meta">{query ? <>搜索结果 <strong>{noteMatchIds.size}</strong> 篇</> : <>全部 <strong>{data.notes.length}</strong> 篇笔记 · <strong>{data.folders.length}</strong> 个分类</>}</div>
        </div>
        <div className="tree-panel" ref={treePanelRef}>
          <div className="notes-tree-panel">
            {childFolders(null).map((f) => renderFolder(f))}
            {!data.folders.length && <div className="tree-empty">还没有任何分类，先创建一个。</div>}
            {query && noteMatchIds.size === 0 && <div className="tree-empty">没有找到匹配结果</div>}
          </div>

          <div className="vault-section">
            <div className="vault-header-row">
              <div className="vault-title" onDoubleClick={() => setVaultAuthMode(vaultStatus.initialized ? 'unlock' : 'init')}>{vaultStatus.unlocked ? '🔓 保险箱' : '🔒 保险箱'}</div>
              {vaultStatus.unlocked ? <button className="vault-inline-btn" onClick={() => void lockVault(false)}>退出</button> : <button className="vault-inline-btn" onClick={() => setVaultAuthMode(vaultStatus.initialized ? 'unlock' : 'init')}>{vaultStatus.initialized ? '解锁' : '设置'}</button>}
            </div>
            {!vaultStatus.unlocked ? (
              <div className="vault-sub">默认不加载、不查询。双击或点击按钮后输入密码解锁。自动锁定：{Math.round(AUTO_LOCK_MS / 60000)} 分钟。忘记密码后保险箱将无法恢复。</div>
            ) : (
              <>
                <div className="toolbar-mini vault-toolbar-mini">
                  <button className="primary" onClick={() => openCreateVaultEntry(selectedVaultFolderId || vaultData.folders[0]?.id || null)}>+ 安全笔记</button>
                  <button onClick={() => { setNewVaultFolderParent(null); setNewVaultFolderName('') }}>+ 目录</button>
                </div>
                <div className="vault-tree">
                  {vaultChildFolders(null).map((f) => renderVaultFolder(f))}
                  {!vaultData.folders.length && <div className="tree-empty">保险箱还是空的，先创建一个目录。</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      <main className="editor-panel">
        {source === 'settings' ? (
          <div className="settings-page">
            <div className="settings-header">
              <div>
                <h1>设置</h1>
                <p>海猫笔记 · SeaCat Note 的界面与路径设置</p>
              </div>
            </div>
            <div className="settings-grid">
              <section className="settings-card">
                <h3>主题</h3>
                <div className="settings-field">
                  <span>界面主题</span>
                  <select value={settings.theme} onChange={(e) => updateSettings('theme', e.target.value as AppSettings['theme'])}>
                    <option value="light">浅色</option>
                    <option value="ocean">海蓝</option>
                    <option value="night">深夜</option>
                  </select>
                </div>
              </section>
              <section className="settings-card">
                <h3>字体</h3>
                <div className="settings-field">
                  <span>界面字体</span>
                  <select value={settings.uiFont} onChange={(e) => updateSettings('uiFont', e.target.value as AppSettings['uiFont'])}>
                    <option value="system">系统默认</option>
                    <option value="pingfang">苹方</option>
                    <option value="yahei">微软雅黑</option>
                    <option value="serif">衬线字体</option>
                  </select>
                </div>
              </section>
              <section className="settings-card settings-card-wide">
                <h3>路径</h3>
                <div className="settings-field">
                  <span>默认备份导出目录</span>
                  <input
                    value={settings.backupPath}
                    onChange={(e) => updateSettings('backupPath', e.target.value)}
                    placeholder="例如：/Users/vic/Documents/HaimaoBackups"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <small>为空时将使用系统保存对话框的默认位置。</small>
                </div>
              </section>
            </div>
          </div>
        ) : source === 'about' ? (
          <div className="about-page">
            <div className="about-card">
              <div className="about-badge">海猫笔记</div>
              <h1>SeaCat Note</h1>
              <p>本地优先的知识与安全记录工具，支持富文本、Markdown、脑图和保险箱。</p>
              <div className="about-meta">
                <div><span>名称</span><strong>海猫笔记 · SeaCat Note</strong></div>
                <div><span>作者</span><strong>海猫</strong></div>
                <div><span>版本</span><strong>0.71.0</strong></div>
              </div>
            </div>
          </div>
        ) : !showingVault ? (
          <>
            <div className="breadcrumbs">
              <button onClick={() => { setSource('normal'); setSelectedFolderId(''); setSelectedNoteId('') }}>全部笔记</button>
              {breadcrumbFolders.map((folder) => (
                <span key={folder.id}><span className="crumb-sep">›</span><button onClick={() => { setSource('normal'); setSelectedFolderId(folder.id); setSelectedNoteId('') }}>{folder.name}</button></span>
              ))}
              {selectedNote ? <><span className="crumb-sep">›</span><span className="crumb-current">{selectedNote.title || '未命名笔记'}</span></> : null}
            </div>
            {!selectedNote ? (
              <div className="folder-view">
                <div className="folder-view-header"><div><h1>{selectedFolder?.name ?? '全部笔记'}</h1><p>{visibleChildFolders.length} 个子目录 · {visibleChildNotes.length} 篇笔记</p></div><div className="folder-actions"><button onClick={() => { setSource('normal'); openCreateNote(currentFolderId || data.folders[0]?.id || null) }}>新建笔记</button><button onClick={() => { setSource('normal'); setNewFolderParent(currentFolderId || null); setNewFolderName('') }}>新建子目录</button></div></div>
                <section><div className="section-title">目录</div><div className="card-grid">{visibleChildFolders.map((folder) => (<button key={folder.id} className="folder-card" onClick={() => { setSource('normal'); setSelectedFolderId(folder.id); setSelectedNoteId('') }}><div className="folder-card-icon">📁</div><div className="folder-card-name">{renderHighlighted(folder.name, query)}</div><div className="folder-card-meta">{childFolders(folder.id).length} 子目录 · {folderNotes(folder.id).length} 笔记</div></button>))}{!visibleChildFolders.length && <div className="empty-inline">当前目录下还没有子目录</div>}</div></section>
                <section><div className="section-title">笔记</div><div className="card-grid note-grid">{visibleChildNotes.map((note) => (<button key={note.id} className="note-card" onClick={() => { setSource('normal'); setSelectedFolderId(note.folderId); setSelectedNoteId(note.id) }}><div className="note-card-type">{noteTypeLabel(note.noteType)}</div><div className="note-card-title">{renderHighlighted(note.title, query)}</div><div className="note-card-summary">{renderHighlighted(stripHtml(note.content).slice(0, 120) || '空内容', query)}</div></button>))}{!visibleChildNotes.length && <div className="empty-inline">当前目录下还没有笔记</div>}</div></section>
              </div>
            ) : (
              <>
                <div className="title-bar">{editingTitle ? <input ref={titleInputRef} className="title-input-inline" defaultValue={selectedNote.title} onBlur={(e) => { setEditingTitle(false); void updateSelectedTitle(e.currentTarget.value.trim()) }} onKeyDown={(e) => { if (e.key === 'Enter') { setEditingTitle(false); void updateSelectedTitle((e.target as HTMLInputElement).value.trim()) } if (e.key === 'Escape') setEditingTitle(false) }} /> : <div className="title-text" onClick={() => setEditingTitle(true)}>{selectedNote.title}</div>}<span className="note-type-badge">{noteTypeLabel(selectedNote.noteType)}</span></div>
                {selectedNote.noteType !== 'mind_map' ? <div className="editor-toolbar">
                  <select className="toolbar-select toolbar-select-sm" defaultValue="paragraph" onChange={(e) => { const v = e.target.value; if (v === 'paragraph') execEditorCommand('formatBlock', 'p'); if (v === 'h2') execEditorCommand('formatBlock', 'h2'); if (v === 'blockquote') execEditorCommand('formatBlock', 'blockquote'); e.currentTarget.value = v }}>
                    <option value="paragraph">正文</option>
                    <option value="h2">H2</option>
                    <option value="blockquote">引用</option>
                  </select>
                  <select className="toolbar-select" defaultValue="" onChange={(e) => { if (e.target.value) execEditorCommand('fontName', e.target.value) }}>
                    <option value="">默认字体</option>
                    <option value="PingFang SC">苹方</option>
                    <option value="Microsoft YaHei">微软雅黑</option>
                    <option value="SimSun">宋体</option>
                    <option value="SimHei">黑体</option>
                    <option value="monospace">等宽</option>
                  </select>
                  <select className="toolbar-select toolbar-select-size" defaultValue="16" onChange={(e) => applyFontSize(Number(e.target.value))}>
                    {[12, 14, 16, 18, 22, 26, 30, 36].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                  <select className="toolbar-select toolbar-select-line-height" defaultValue="1.5" onChange={(e) => applyLineHeight(e.target.value)}>
                    {LINE_HEIGHT_OPTIONS.map((lineHeight) => <option key={lineHeight} value={lineHeight}>{lineHeight}</option>)}
                  </select>
                  <span className="toolbar-divider"></span>
                  <button title="加粗" onClick={() => execEditorCommand('bold')}><strong>B</strong></button>
                  <button title="斜体" onClick={() => execEditorCommand('italic')}><em>I</em></button>
                  <button title="下划线" onClick={() => execEditorCommand('underline')}><span className="toolbar-under">U</span></button>
                  <button title="删除线" onClick={() => execEditorCommand('strikeThrough')}><span className="toolbar-strike">S</span></button>
                  <input className="toolbar-color" title="文字颜色" type="color" onChange={(e) => execEditorCommand('foreColor', e.target.value)} defaultValue="#1f2937" />
                  <input className="toolbar-color" title="高亮颜色" type="color" onChange={(e) => execEditorCommand('hiliteColor', e.target.value)} defaultValue="#fff2a8" />
                  <span className="toolbar-divider"></span>
                  <button title="无序列表" onClick={() => execEditorCommand('insertUnorderedList')}>•</button>
                  <button title="有序列表" onClick={() => execEditorCommand('insertOrderedList')}>1.</button>
                  <button title="左对齐" onClick={() => execEditorCommand('justifyLeft')}>≡</button>
                  <button title="居中" onClick={() => execEditorCommand('justifyCenter')}>≣</button>
                  <button title="右对齐" onClick={() => execEditorCommand('justifyRight')}>≢</button>
                  <button title="分割线" onClick={() => execEditorCommand('insertHorizontalRule')}>—</button>
                  <button title="插入表格" onClick={() => insertBasicTable()}>▦</button>
                  <button title="选择图片" onClick={() => fileInputRef.current?.click()}>🖼</button>
                  <button className={formatBrush ? 'toolbar-active' : ''} title="格式刷（单次）" onClick={() => captureFormatBrush()}>🖌</button>
                  <button title="清除样式" onClick={() => execEditorCommand('removeFormat')}>Tx</button>
                </div> : null}
                {selectedNote.noteType !== 'mind_map' && selectedImageEl ? <div className="image-mini-toolbar"><span>图片大小</span><button onClick={() => resizeSelectedImage('original')}>原始</button><button onClick={() => resizeSelectedImage(25)}>25%</button><button onClick={() => resizeSelectedImage(50)}>50%</button><button onClick={() => resizeSelectedImage(75)}>75%</button><button onClick={() => resizeSelectedImage(100)}>100%</button><button onClick={() => resizeSelectedImage('fit')}>适应宽度</button></div> : null}
                {selectedNote.noteType !== 'mind_map' ? <div className="editor-meta"><span>{noteTypeLabel(selectedNote.noteType)}</span><span>{selectedFolder?.name ?? '未分类'}</span><span>{stripHtml(selectedNote.content).trim().length} 字</span>{query ? <span>搜索词：{searchText}</span> : null}</div> : null}
                {selectedNote.noteType === 'rich_text' ? <div ref={editorContentRef} className="editor-content" contentEditable={!query} suppressContentEditableWarning onPaste={handleEditorPaste} onClick={handleEditorClick} onKeyUp={() => captureEditorSelection()} onMouseUp={() => { captureEditorSelection(); applyFormatBrushIfNeeded() }} onContextMenu={openEditorContextMenu} onBlur={(e) => void updateSelectedContent(e.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: selectedNoteHtml || '<p></p>' }} /> : selectedNote.noteType === 'markdown' ? <div className="markdown-shell"><div className="markdown-editor-pane"><textarea className="plain-editor markdown-source-editor" value={normalizedMarkdownSource} placeholder="# 这里写 Markdown" onChange={(e) => void updateSelectedContent(e.target.value)} onContextMenu={(e) => { e.preventDefault(); setEditorMenu({ x: e.clientX, y: e.clientY }) }} /></div><div className="markdown-preview markdown-rendered">{markdownPreviewHtml ? <div dangerouslySetInnerHTML={{ __html: markdownPreviewHtml }} /> : <div className="markdown-empty">在左侧输入 Markdown，右侧实时预览。</div>}</div></div> : <MindMapEditor value={selectedNote.content} onChange={(val) => void updateSelectedContent(val)} />}
              </>
            )}
          </>
        ) : (
          <>
            <div className="breadcrumbs vault-breadcrumbs"><span className="crumb-current">保险箱</span>{vaultBreadcrumbFolders.map((folder) => (<span key={folder.id}><span className="crumb-sep">›</span><button onClick={() => guardVaultNavigation(() => { setSource('vault'); setSelectedVaultFolderId(folder.id); setSelectedVaultEntryId('') })}>{folder.name}</button></span>))}{selectedVaultEntry ? <><span className="crumb-sep">›</span><span className="crumb-current">{selectedVaultEntry.title}</span></> : null}</div>
            {!selectedVaultEntry ? (
              <div className="folder-view vault-folder-view"><div className="folder-view-header"><div><h1>{selectedVaultFolder?.name ?? '保险箱'}</h1><p>{visibleVaultFolders.length} 个子目录 · {visibleVaultEntries.length} 条记录</p></div><div className="folder-actions"><button onClick={() => openCreateVaultEntry(currentVaultFolderId || vaultData.folders[0]?.id || null)}>新建安全笔记</button><button onClick={() => { setNewVaultFolderParent(null); setNewVaultFolderName('') }}>新建目录</button><button onClick={() => void reloadVaultTree()}>刷新</button><button onClick={() => void lockVault(false)}>锁定保险箱</button></div></div>
              <section><div className="section-title">目录</div><div className="card-grid">{visibleVaultFolders.map((folder) => (<button key={folder.id} className="folder-card vault-card" onClick={() => guardVaultNavigation(() => { setSource('vault'); setSelectedVaultFolderId(folder.id); setSelectedVaultEntryId('') })}><div className="folder-card-icon">🔒</div><div className="folder-card-name">{folder.name}</div><div className="folder-card-meta">{vaultChildFolders(folder.id).length} 子目录 · {vaultFolderEntries(folder.id).length} 记录</div></button>))}{!visibleVaultFolders.length && <div className="empty-inline">当前保险箱目录下还没有子目录</div>}</div></section>
              <section><div className="section-title">保险箱条目</div><div className="card-grid note-grid">{visibleVaultEntries.map((entry) => (<button key={entry.id} className="note-card vault-card" onClick={() => guardVaultNavigation(() => { setSelectedVaultFolderId(entry.folderId); setSelectedVaultEntryId(entry.id) })}><div className="note-card-type">{vaultEntryTypeLabel(entry.entryType)}</div><div className="note-card-title">{entry.title}</div></button>))}{!visibleVaultEntries.length && <div className="empty-inline">当前目录下还没有保险箱条目</div>}</div></section></div>
            ) : (
              <>
                <div className="title-bar vault-title-bar vault-title-actions-only"><div className="vault-entry-actions"><button className="vault-inline-btn primary" disabled={!vaultDraftDirty || vaultBusy} onClick={() => void saveVaultDraft()}>{vaultBusy ? '保存中...' : '保存修改'}</button><button className="vault-inline-btn" disabled={!vaultDraftDirty || vaultBusy} onClick={discardVaultDraft}>放弃修改</button><button className="vault-inline-btn vault-danger-btn" disabled={vaultBusy} onClick={() => void deleteVaultEntry()}>删除条目</button><button className="vault-inline-btn" disabled={vaultBusy} onClick={() => void lockVault(false)}>锁定</button></div></div>
                <div className="editor-meta"><span>{vaultEntryTypeLabel(selectedVaultEntry.entryType)}</span><span>{selectedVaultFolder?.name ?? '保险箱'}</span><span>不参与全文搜索</span>{vaultDraftDirty ? <span className="vault-dirty-flag">有未保存修改</span> : <span>已保存</span>}</div>
                {selectedVaultEntry.entryType === 'secure_note' ? (
                  <>
                    <div className="editor-toolbar compact-toolbar">
                      <select className="toolbar-select toolbar-select-sm" defaultValue="paragraph" onChange={(e) => { const v = e.target.value; if (v === 'paragraph') execEditorCommand('formatBlock', 'p'); if (v === 'h2') execEditorCommand('formatBlock', 'h2'); if (v === 'blockquote') execEditorCommand('formatBlock', 'blockquote'); e.currentTarget.value = v }}>
                        <option value="paragraph">正文</option>
                        <option value="h2">H2</option>
                        <option value="blockquote">引用</option>
                      </select>
                      <select className="toolbar-select" defaultValue="" onChange={(e) => { if (e.target.value) execEditorCommand('fontName', e.target.value) }}>
                        <option value="">默认字体</option>
                        <option value="PingFang SC">苹方</option>
                        <option value="Microsoft YaHei">微软雅黑</option>
                        <option value="SimSun">宋体</option>
                        <option value="SimHei">黑体</option>
                        <option value="monospace">等宽</option>
                      </select>
                      <select className="toolbar-select toolbar-select-size" defaultValue="16" onChange={(e) => applyFontSize(Number(e.target.value))}>
                        {[12, 14, 16, 18, 22, 26, 30, 36].map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                      <select className="toolbar-select toolbar-select-line-height" defaultValue="1.5" onChange={(e) => applyLineHeight(e.target.value)}>
                        {LINE_HEIGHT_OPTIONS.map((lineHeight) => <option key={lineHeight} value={lineHeight}>{lineHeight}</option>)}
                      </select>
                      <span className="toolbar-divider"></span>
                      <button title="加粗" onClick={() => execEditorCommand('bold')}><strong>B</strong></button>
                      <button title="斜体" onClick={() => execEditorCommand('italic')}><em>I</em></button>
                      <button title="下划线" onClick={() => execEditorCommand('underline')}><span className="toolbar-under">U</span></button>
                      <button title="删除线" onClick={() => execEditorCommand('strikeThrough')}><span className="toolbar-strike">S</span></button>
                      <input className="toolbar-color" title="文字颜色" type="color" onChange={(e) => execEditorCommand('foreColor', e.target.value)} defaultValue="#1f2937" />
                      <input className="toolbar-color" title="高亮颜色" type="color" onChange={(e) => execEditorCommand('hiliteColor', e.target.value)} defaultValue="#fff2a8" />
                      <span className="toolbar-divider"></span>
                      <button title="无序列表" onClick={() => execEditorCommand('insertUnorderedList')}>•</button>
                      <button title="有序列表" onClick={() => execEditorCommand('insertOrderedList')}>1.</button>
                      <button title="左对齐" onClick={() => execEditorCommand('justifyLeft')}>≡</button>
                      <button title="居中" onClick={() => execEditorCommand('justifyCenter')}>≣</button>
                      <button title="右对齐" onClick={() => execEditorCommand('justifyRight')}>≢</button>
                      <button title="分割线" onClick={() => execEditorCommand('insertHorizontalRule')}>—</button>
                      <button title="插入表格" onClick={() => insertBasicTable()}>▦</button>
                      <button title="选择图片" onClick={() => fileInputRef.current?.click()}>🖼</button>
                      <button className={formatBrush ? 'toolbar-active' : ''} title="格式刷（单次）" onClick={() => captureFormatBrush()}>🖌</button>
                      <button title="清除样式" onClick={() => execEditorCommand('removeFormat')}>Tx</button>
                    </div>
                    {selectedImageEl ? <div className="image-mini-toolbar"><span>图片大小</span><button onClick={() => resizeSelectedImage('original')}>原始</button><button onClick={() => resizeSelectedImage(25)}>25%</button><button onClick={() => resizeSelectedImage(50)}>50%</button><button onClick={() => resizeSelectedImage(75)}>75%</button><button onClick={() => resizeSelectedImage(100)}>100%</button><button onClick={() => resizeSelectedImage('fit')}>适应宽度</button></div> : null}
                    <div ref={vaultEditorRef} className="editor-content vault-rich-editor" contentEditable suppressContentEditableWarning onPaste={handleEditorPaste} onClick={handleEditorClick} onKeyUp={() => captureEditorSelection()} onMouseUp={() => { captureEditorSelection(); applyFormatBrushIfNeeded() }} onContextMenu={openEditorContextMenu} onBlur={(e) => updateVaultDraftPayloadField('notes', e.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: selectedVaultPayload.notes || '<p></p>' }} />
                  </>
                ) : selectedVaultEntry.entryType === 'login' ? (
                  <div className="vault-form">
                    <div className="vault-notice">高安全模式：保险箱内容默认不参与全文搜索，离开一段时间会自动重新锁定。</div>
                    {clipboardNotice ? <div className="vault-copy-toast">{clipboardNotice}</div> : null}
                    <div className="vault-grid">
                      <label className="vault-span-2"><span>标题</span><input value={selectedVaultDraft?.title || ''} onChange={(e) => updateVaultDraftTitle(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                      <label><span>账号 / 用户名</span><input value={selectedVaultPayload.username || ''} onChange={(e) => updateVaultDraftPayloadField('username', e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                      <div className="vault-inline-actions"><button className="vault-inline-btn" onClick={() => void copySensitive(selectedVaultPayload.username || '', '账号')}>复制账号</button></div>
                      <label><span>密码</span><input type={vaultPasswordVisible ? 'text' : 'password'} value={selectedVaultPayload.password || ''} onChange={(e) => updateVaultDraftPayloadField('password', e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                      <div className="vault-inline-actions"><button className="vault-inline-btn" onClick={() => setVaultPasswordVisible((v) => !v)}>{vaultPasswordVisible ? '隐藏密码' : '显示密码'}</button><button className="vault-inline-btn" onClick={() => void copySensitive(selectedVaultPayload.password || '', '密码')}>复制密码</button></div>
                      <label className="vault-span-2"><span>网址</span><input value={selectedVaultPayload.url || ''} onChange={(e) => updateVaultDraftPayloadField('url', e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                      <label className="vault-span-2"><span>备注</span><textarea rows={8} value={selectedVaultPayload.notes || ''} onChange={(e) => updateVaultDraftPayloadField('notes', e.target.value)} /></label>
                    </div>
                  </div>
                ) : (
                  <div className="vault-form">
                    <div className="vault-notice">该条目不会加入普通搜索。建议仅在需要时短暂查看，完成后手动锁定保险箱。</div>
                    {clipboardNotice ? <div className="vault-copy-toast">{clipboardNotice}</div> : null}
                    <label className="vault-span-2"><span>标题</span><input value={selectedVaultDraft?.title || ''} onChange={(e) => updateVaultDraftTitle(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                    <label className="vault-span-2"><span>{selectedVaultEntry.entryType === 'mnemonic' ? '助*词' : '私钥 / 敏感内容'}</span><textarea className="vault-secret-area" rows={10} value={selectedVaultPayload.secret || ''} onChange={(e) => updateVaultDraftPayloadField('secret', e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                    <div className="vault-inline-actions"><button className="vault-inline-btn" onClick={() => void copySensitive(selectedVaultPayload.secret || '', selectedVaultEntry.entryType === 'mnemonic' ? '助*词' : '私钥')}>复制内容</button></div>
                    <label className="vault-span-2"><span>备注</span><textarea rows={6} value={selectedVaultPayload.notes || ''} onChange={(e) => updateVaultDraftPayloadField('notes', e.target.value)} /></label>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files?.[0]; if (file) insertImageFile(file); e.currentTarget.value = '' }} />
      {editorMenu && <div className="context-menu editor-context-menu" style={menuStyle(editorMenu, 170, 240)}><button onClick={() => { document.execCommand('cut'); setEditorMenu(null) }}>剪切</button><button onClick={() => { document.execCommand('copy'); setEditorMenu(null) }}>复制</button><button onClick={async () => { try { const text = await navigator.clipboard.readText(); document.execCommand('insertText', false, text) } catch { document.execCommand('paste') } setEditorMenu(null) }}>粘贴</button><div className="context-sep" /><button onClick={() => { document.execCommand('selectAll'); setEditorMenu(null) }}>全选</button><div className="context-sep" /><button onClick={() => { document.execCommand('bold'); setEditorMenu(null) }}>加粗</button><button onClick={() => { document.execCommand('italic'); setEditorMenu(null) }}>斜体</button><div className="context-sep" /><button onClick={() => { document.execCommand('delete'); setEditorMenu(null) }}>删除</button></div>}
      {tableMenu && <div className="context-menu editor-context-menu table-context-menu" style={menuStyle(tableMenu, 190, 300)}><button onClick={() => tableInsertRow('above')}>向上插入一行</button><button onClick={() => tableInsertRow('below')}>向下插入一行</button><button onClick={() => tableInsertCol('left')}>向左插入一列</button><button onClick={() => tableInsertCol('right')}>向右插入一列</button><div className="context-sep" /><button onClick={() => tableDeleteRow()}>删除当前行</button><button onClick={() => tableDeleteCol()}>删除当前列</button><button onClick={() => tableDeleteTable()}>删除表格</button></div>}

      {contextMenu && <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>{contextMenu.kind === 'folder' ? <><button onClick={() => openCreateNote(contextMenu.id)}>新建笔记</button><button onClick={() => { setNewFolderParent(contextMenu.id); setNewFolderName(''); setContextMenu(null) }}>新建子分类</button><button onClick={() => beginRename('folder', contextMenu.id, folderMap.get(contextMenu.id)?.name ?? '')}>重命名</button><button onClick={() => void deleteItem('folder', contextMenu.id)}>删除</button></> : <><button onClick={() => beginRename('note', contextMenu.id, noteMap.get(contextMenu.id)?.title ?? '')}>重命名</button><button onClick={() => void deleteItem('note', contextMenu.id)}>删除</button></>}</div>}
      {vaultContextMenu && <div className="context-menu" style={menuStyle(vaultContextMenu, 200, 180)}>{vaultContextMenu.kind === 'folder' ? <><button onClick={() => { openCreateVaultEntry(vaultContextMenu.id); setVaultContextMenu(null) }}>新建安全笔记</button><button onClick={() => { setNewVaultFolderParent(vaultContextMenu.id); setNewVaultFolderName(''); setVaultContextMenu(null) }}>新建子目录</button><button onClick={() => void renameVaultFolder(vaultContextMenu.id)}>重命名</button><button onClick={() => void deleteVaultFolder(vaultContextMenu.id)}>删除目录</button></> : <><button onClick={() => { setVaultContextMenu(null); void saveVaultDraft() }}>保存当前条目</button><button onClick={() => { setVaultContextMenu(null); void deleteVaultEntry() }}>删除条目</button></>}</div>}

      {newFolderParent !== undefined && <div className="modal-mask" onClick={() => setNewFolderParent(undefined)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-title">{newFolderParent ? '新建子分类' : '新建分类'}</div><input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => handleEnterEscape(e, () => { void createFolder(newFolderParent ?? null) }, () => setNewFolderParent(undefined))} placeholder="分类名称" autoFocus /><div className="modal-actions"><button onClick={() => setNewFolderParent(undefined)}>取消</button><button className="primary" onClick={() => void createFolder(newFolderParent ?? null)}>创建</button></div></div></div>}
      {newNoteFolderId !== null && <div className="modal-mask" onClick={() => setNewNoteFolderId(null)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-title">新建笔记</div><input value={newNoteTitle} onChange={(e) => setNewNoteTitle(e.target.value)} onKeyDown={(e) => handleEnterEscape(e, () => { void createNote() }, () => setNewNoteFolderId(null))} placeholder="笔记标题（可留空）" autoFocus /><select value={newNoteType} onChange={(e) => setNewNoteType(e.target.value as NoteType)} onKeyDown={(e) => handleEnterEscape(e, () => { void createNote() }, () => setNewNoteFolderId(null))}><option value="rich_text">普通笔记</option><option value="markdown">Markdown</option><option value="mind_map">脑图</option></select><div className="modal-actions"><button onClick={() => setNewNoteFolderId(null)}>取消</button><button className="primary" onClick={() => void createNote()}>创建</button></div></div></div>}
      {newVaultFolderParent !== undefined && <div className="modal-mask" onClick={() => setNewVaultFolderParent(undefined)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-title">{newVaultFolderParent ? '新建保险箱子目录' : '新建保险箱目录'}</div><input value={newVaultFolderName} onChange={(e) => setNewVaultFolderName(e.target.value)} onKeyDown={(e) => handleEnterEscape(e, () => { void createVaultFolder(newVaultFolderParent ?? null) }, () => setNewVaultFolderParent(undefined))} placeholder="目录名称" autoFocus /><div className="modal-actions"><button onClick={() => setNewVaultFolderParent(undefined)}>取消</button><button className="primary" onClick={() => void createVaultFolder(newVaultFolderParent ?? null)}>创建</button></div></div></div>}
      {vaultRenameFolderId !== null && <div className="modal-mask" onClick={() => setVaultRenameFolderId(null)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-title">重命名保险箱目录</div><input value={vaultRenameFolderName} onChange={(e) => setVaultRenameFolderName(e.target.value)} onKeyDown={(e) => handleEnterEscape(e, () => { void confirmRenameVaultFolder() }, () => setVaultRenameFolderId(null))} placeholder="目录名称" autoFocus /><div className="modal-actions"><button onClick={() => setVaultRenameFolderId(null)}>取消</button><button className="primary" onClick={() => void confirmRenameVaultFolder()}>确认</button></div></div></div>}
      {mindContextMenu && <div className="context-menu" style={{ left: mindContextMenu.x, top: mindContextMenu.y }}><button onClick={() => { setMindSelectionPath(mindContextMenu.path); addMindChild(); setMindContextMenu(null) }}>新建子主题</button><button onClick={() => { setMindSelectionPath(mindContextMenu.path); addMindSibling(); setMindContextMenu(null) }}>新建同级主题</button><button onClick={() => { setMindSelectionPath(mindContextMenu.path); toggleMindCollapsed(); setMindContextMenu(null) }}>{selectedMindNode?.collapsed ? '展开主题' : '收起主题'}</button><button onClick={() => { setMindSelectionPath(mindContextMenu.path); deleteSelectedMindNode(); setMindContextMenu(null) }}>删除主题</button></div>}
      {newVaultEntryFolderId !== null && <div className="modal-mask" onClick={() => setNewVaultEntryFolderId(null)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-title">新建保险箱条目</div><input value={newVaultEntryTitle} onChange={(e) => setNewVaultEntryTitle(e.target.value)} onKeyDown={(e) => handleEnterEscape(e, () => { void createVaultEntry() }, () => setNewVaultEntryFolderId(null))} placeholder="条目标题（可留空）" autoFocus /><select value={newVaultEntryType} onChange={(e) => setNewVaultEntryType(e.target.value as any)}><option value="login">登录账号</option><option value="secure_note">安全笔记</option><option value="mnemonic">助*词</option><option value="private_key">私钥</option></select><div className="vault-subtle">保险箱条目只在保险箱解锁后加载，普通搜索不会命中这些内容。</div><div className="modal-actions"><button onClick={() => setNewVaultEntryFolderId(null)}>取消</button><button className="primary" onClick={() => void createVaultEntry()}>创建</button></div></div></div>}
      {vaultConfirm && <div className="modal-mask" onClick={() => setVaultConfirm(null)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-title">确认操作</div><div className="vault-subtle">{vaultConfirm.message}</div><div className="modal-actions"><button onClick={() => { pendingVaultNavigationRef.current = null; setVaultConfirm(null) }}>取消</button><button className="primary" onClick={() => void confirmVaultAction()}>确认</button></div></div></div>}
      {appConfirm && <div className="modal-mask" onClick={() => setAppConfirm(null)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-title">确认删除</div><div className="vault-subtle">{appConfirm.message}</div><div className="modal-actions"><button onClick={() => setAppConfirm(null)}>取消</button><button className="primary" onClick={() => void confirmAppAction()}>确认删除</button></div></div></div>}
      {vaultAuthMode && <div className="modal-mask" onClick={() => setVaultAuthMode(null)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-title">{vaultAuthMode === 'init' ? '初始化保险箱' : '解锁保险箱'}</div><input type="password" value={vaultPassword1} onChange={(e) => setVaultPassword1(e.target.value)} onKeyDown={(e) => handleEnterEscape(e, () => { void submitVaultAuth() }, () => setVaultAuthMode(null))} placeholder="输入保险箱密码" autoFocus />{vaultAuthMode === 'init' && <input type="password" value={vaultPassword2} onChange={(e) => setVaultPassword2(e.target.value)} onKeyDown={(e) => handleEnterEscape(e, () => { void submitVaultAuth() }, () => setVaultAuthMode(null))} placeholder="再次输入保险箱密码" />} {vaultError ? <div className="vault-error">{vaultError}</div> : <div className="vault-subtle">保险箱使用独立数据库 seacat-note-vault.db，默认不加载、不参与全文搜索。</div>}<div className="modal-actions"><button onClick={() => setVaultAuthMode(null)}>取消</button><button className="primary" onClick={() => void submitVaultAuth()}>{vaultAuthMode === 'init' ? '创建并解锁' : '解锁'}</button></div></div></div>}
      {backupModalOpen && <div className="modal-mask" onClick={() => !backupBusy && setBackupModalOpen(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-title">备份 / 恢复</div><div className="vault-subtle">导出时会把普通笔记、保险箱、附件等应用数据一起打包，并使用你输入的备份密码整体加密。没有这个密码，无法解出备份内容。</div><input type="password" value={backupPassword} onChange={(e) => setBackupPassword(e.target.value)} placeholder="输入备份密码" autoFocus /><div className="modal-actions"><button onClick={() => !backupBusy && setBackupModalOpen(false)} disabled={backupBusy}>取消</button><button onClick={() => void importBackup()} disabled={backupBusy}>{backupBusy ? '处理中...' : '导入备份'}</button><button className="primary" onClick={() => void exportBackup()} disabled={backupBusy}>{backupBusy ? '处理中...' : '导出加密备份'}</button></div>{backupNotice ? <div className="vault-subtle backup-notice">{backupNotice}</div> : null}</div></div>}
      {dragGhost && <div className="drag-ghost" style={{ left: dragGhost.x, top: dragGhost.y }}>{dragGhost.label}</div>}
    </div>
  )
}

function defaultVaultTitle(type: string) { if (type === 'login') return '未命名登录'; if (type === 'mnemonic') return '未命名助*词'; if (type === 'private_key') return '未命名私钥'; return '未命名安全笔记' }
function createVaultTemplate(type: string) { if (type === 'login') return JSON.stringify({ username: '', password: '', url: '', notes: '' }, null, 2); if (type === 'mnemonic') return JSON.stringify({ secret: '', notes: '' }, null, 2); if (type === 'private_key') return JSON.stringify({ secret: '', notes: '' }, null, 2); return JSON.stringify({ notes: '' }, null, 2) }
function parseVaultPayloadFromDraft(entry: VaultEntry, draft?: VaultDraft | null) { try { const parsed = JSON.parse(draft?.content || entry.content || '{}'); return typeof parsed === 'object' && parsed ? parsed : {} } catch { return entry.entryType === 'secure_note' ? { notes: draft?.content || entry.content || '' } : { secret: draft?.content || entry.content || '', notes: '' } } }
function parseVaultPayload(entry: VaultEntry) { try { const parsed = JSON.parse(entry.content || '{}'); return typeof parsed === 'object' && parsed ? parsed : {} } catch { return entry.entryType === 'secure_note' ? { notes: entry.content || '' } : { secret: entry.content || '', notes: '' } } }
function vaultEntryTypeLabel(type: string) { if (type === 'login') return '登录账号'; if (type === 'mnemonic') return '助*词'; if (type === 'private_key') return '私钥'; return '安全笔记' }
function vaultEntrySummary(entry: VaultEntry) { const payload = parseVaultPayload(entry); if (entry.entryType === 'login') return payload.username || payload.url || '登录账号条目'; if (entry.entryType === 'mnemonic') return (payload.secret || '').slice(0, 40) || '助*词内容'; if (entry.entryType === 'private_key') return (payload.secret || '').slice(0, 40) || '私钥内容'; return (payload.notes || '').slice(0, 80) || '空内容' }

function markdownEscapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function normalizeMarkdownSource(source: string) {
  const raw = source || ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^<p>(<br\s*\/?\s*>|&nbsp;|\s)*<\/p>$/i.test(trimmed)) return ''
  if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed
      .replace(/<\/?(div|section|article|main|aside|header|footer)[^>]*>/gi, '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/^<p[^>]*>/i, '')
      .replace(/<\/p>$/i, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim()
  }
  return raw
}

function applyMarkdownInline(source: string) {
  let html = source
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  return html
}

function renderMarkdownToHtml(source: string) {
  const md = normalizeMarkdownSource(source || '')
  const lines = markdownEscapeHtml(md).split(/\r?\n/)
  let html = ''
  let inCode = false
  let inUl = false
  let inOl = false
  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false }
    if (inOl) { html += '</ol>'; inOl = false }
  }
  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (line.startsWith('```')) {
      closeLists()
      html += inCode ? '</code></pre>' : '<pre><code>'
      inCode = !inCode
      continue
    }
    if (inCode) { html += `${line}\n`; continue }
    if (!line.trim()) { closeLists(); continue }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) { closeLists(); html += `<h${heading[1].length}>${applyMarkdownInline(heading[2])}</h${heading[1].length}>`; continue }
    const ul = line.match(/^[-*+]\s+(.*)$/)
    if (ul) { if (!inUl) { closeLists(); html += '<ul>'; inUl = true } html += `<li>${applyMarkdownInline(ul[1])}</li>`; continue }
    const ol = line.match(/^\d+\.\s+(.*)$/)
    if (ol) { if (!inOl) { closeLists(); html += '<ol>'; inOl = true } html += `<li>${applyMarkdownInline(ol[1])}</li>`; continue }
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) { closeLists(); html += `<blockquote>${applyMarkdownInline(quote[1])}</blockquote>`; continue }
    html += `<p>${applyMarkdownInline(line)}</p>`
  }
  closeLists()
  if (inCode) html += '</code></pre>'
  return html
}

function parseMindMapContent(content: string): MindNode {
  try {
    const parsed = JSON.parse(content || '{}')
    const root = parsed?.root ?? parsed
    return normalizeMindNode(root)
  } catch {
    return { text: '中心主题', children: [] }
  }
}

function normalizeMindNode(node: any): MindNode {
  return {
    text: typeof node?.text === 'string' ? node.text : '新节点',
    children: Array.isArray(node?.children) ? node.children.map((child: any) => normalizeMindNode(child)) : [],
    collapsed: !!node?.collapsed,
    color: typeof node?.color === 'string' ? node.color : '',
    fontSize: typeof node?.fontSize === 'number' ? node.fontSize : 14,
    x: typeof node?.x === 'number' ? node.x : undefined,
    y: typeof node?.y === 'number' ? node.y : undefined,
    side: node?.side === 'left' || node?.side === 'right' || node?.side === 'center' ? node.side : undefined,
    lineStyle: node?.lineStyle === 'straight' || node?.lineStyle === 'bracket' || node?.lineStyle === 'dashed' ? node.lineStyle : 'curve',
  }
}

function getMindNodeAtPath(root: MindNode, path: number[]) {
  let current: MindNode | undefined = root
  for (const index of path) {
    current = current?.children?.[index]
  }
  return current ?? null
}

function renderMindNode(
  node: MindNode,
  path: number[],
  selectedPath: number[],
  dropPath: number[] | null,
  onSelect: (path: number[]) => void,
  onContextMenu: (e: React.MouseEvent, path: number[]) => void,
  onDragStart: (e: React.DragEvent, path: number[]) => void,
  onDragEnter: (path: number[]) => void,
  onDragEnd: () => void,
  onDrop: (e: React.DragEvent, targetPath: number[]) => void,
  onToggleCollapse: (path: number[]) => void,
): JSX.Element {
  const selected = path.length === selectedPath.length && path.every((value, index) => value === selectedPath[index])
  const isDropTarget = !!dropPath && path.length === dropPath.length && path.every((value, index) => value === dropPath[index])
  return (
    <div className={`mind-node-wrap depth-${path.length} ${selected ? 'is-selected' : ''}`} data-depth={path.length} key={path.join('-') || 'root'}>
      <button
        className={`mind-node ${path.length === 0 ? 'mind-node-root' : ''} ${selected ? 'is-selected' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
        onClick={() => onSelect(path)}
        onDoubleClick={() => onToggleCollapse(path)}
        onContextMenu={(e) => onContextMenu(e, path)}
        draggable
        onDragStart={(e) => onDragStart(e, path)}
        onDragEnter={() => onDragEnter(path)}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragEnter(path) }}
        onDragEnd={onDragEnd}
        onDrop={(e) => onDrop(e, path)}
        style={{ backgroundColor: node.color || undefined, fontSize: `${node.fontSize || 14}px` }}
      >
        <span className="mind-node-label">{node.text || '新节点'}</span>
        {!!node.children?.length && (
          <span
            className="mind-node-collapse-badge"
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse(path)
            }}
          >
            {node.collapsed ? '+' : node.children.length}
          </span>
        )}
      </button>
      {!!node.children?.length && !node.collapsed && (
        <div className="mind-node-children">
          {node.children.map((child, index) =>
            renderMindNode(
              child,
              [...path, index],
              selectedPath,
              dropPath,
              onSelect,
              onContextMenu,
              onDragStart,
              onDragEnter,
              onDragEnd,
              onDrop,
              onToggleCollapse,
            ),
          )}
        </div>
      )}
    </div>
  )
}

function cloneMindNode(node: MindNode): MindNode {
  return {
    ...node,
    children: (node.children ?? []).map((child) => cloneMindNode(child)),
  }
}

function ensureMindLayout(root: MindNode) {
  const cloned = cloneMindNode(root)
  const rowCounters: Record<string, number> = { left: 0, right: 0 }
  const centerX = 560
  const centerY = 120
  const stepX = 240
  const stepY = 92

  function walk(node: MindNode, level: number, side: 'left' | 'right' | 'center') {
    if (level === 0) {
      node.side = 'center'
      if (typeof node.x !== 'number') node.x = centerX
      if (typeof node.y !== 'number') node.y = centerY
    } else {
      node.side = side
      if (typeof node.x !== 'number') node.x = centerX + (side === 'left' ? -1 : 1) * stepX * level
      if (typeof node.y !== 'number') {
        rowCounters[side] += 1
        node.y = centerY + rowCounters[side] * stepY
      }
    }
    const children = node.children ?? []
    children.forEach((child, index) => {
      const childSide = level === 0 ? (index % 2 === 0 ? 'right' : 'left') : side
      walk(child, level + 1, childSide)
    })
  }

  walk(cloned, 0, 'center')
  return cloned
}

type FlatMindNode = {
  path: number[]
  node: MindNode
  parentPath: number[] | null
}

function flattenMindNodes(root: MindNode, path: number[] = [], parentPath: number[] | null = null): FlatMindNode[] {
  const items: FlatMindNode[] = [{ path, node: root, parentPath }]
  if (root.collapsed) return items
  for (let i = 0; i < (root.children ?? []).length; i += 1) {
    items.push(...flattenMindNodes(root.children![i], [...path, i], path))
  }
  return items
}

function pathEquals(a: number[] | null, b: number[] | null) {
  if (!a || !b || a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function getMindLinePath(parent: MindNode, child: MindNode) {
  const x1 = (parent.x ?? 0) + 72
  const y1 = (parent.y ?? 0) + 22
  const x2 = (child.x ?? 0) + 72
  const y2 = (child.y ?? 0) + 22
  const style = child.lineStyle || 'curve'
  if (style === 'straight' || style === 'dashed') {
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }
  if (style === 'bracket') {
    const midX = x1 + (x2 > x1 ? 48 : -48)
    return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
  }
  const c1x = x1 + (x2 > x1 ? 90 : -90)
  const c2x = x2 - (x2 > x1 ? 90 : -90)
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`
}

function renderMindCanvas(
  root: MindNode,
  selectedPath: number[],
  onSelect: (path: number[]) => void,
  onContextMenu: (e: React.MouseEvent, path: number[]) => void,
  onPointerDown: (e: React.MouseEvent, path: number[], node: MindNode) => void,
  onToggleCollapse: (path: number[]) => void,
): JSX.Element {
  const layoutRoot = ensureMindLayout(root)
  const flat = flattenMindNodes(layoutRoot)
  const byPath = new Map(flat.map((item) => [item.path.join(','), item.node] as const))
  return (
    <div className="mind-canvas-board">
      <svg className="mind-lines" viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid meet">
        {flat.map((item) => {
          if (!item.parentPath) return null
          const parent = byPath.get(item.parentPath.join(','))
          if (!parent) return null
          const style = item.node.lineStyle || 'curve'
          return (
            <path
              key={`line-${item.path.join('-')}`}
              d={getMindLinePath(parent, item.node)}
              className={`mind-line mind-line--${style}`}
            />
          )
        })}
      </svg>
      {flat.map((item) => {
        const selected = pathEquals(item.path, selectedPath)
        const node = item.node
        return (
          <button
            key={`node-${item.path.join('-') || 'root'}`}
            className={`mind-free-node ${item.path.length === 0 ? 'mind-free-node-root' : ''} ${selected ? 'is-selected' : ''}`}
            style={{
              left: `${node.x ?? 0}px`,
              top: `${node.y ?? 0}px`,
              backgroundColor: node.color || undefined,
              fontSize: `${node.fontSize || 14}px`,
            }}
            onClick={() => onSelect(item.path)}
            onContextMenu={(e) => onContextMenu(e, item.path)}
            onMouseDown={(e) => onPointerDown(e, item.path, node)}
            onDoubleClick={() => onToggleCollapse(item.path)}
          >
            <span className="mind-free-node-text">{node.text || '新节点'}</span>
            {!!node.children?.length && (
              <span
                className="mind-free-node-badge"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleCollapse(item.path)
                }}
              >
                {node.collapsed ? '+' : node.children.length}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function defaultTitleByType(type: NoteType) {
  if (type === 'markdown') return '未命名 Markdown'
  if (type === 'mind_map') return '未命名脑图'
  return '未命名笔记'
}
function noteTypeLabel(type: NoteType) { if (type === 'markdown') return 'Markdown'; if (type === 'mind_map') return '脑图'; return '普通笔记' }
function buildFolderPath<T extends { id: string; parentId: string | null }>(folderId: string, folderMap: Map<string, T>) { if (!folderId) return [] as T[]; const result: T[] = []; let current: T | undefined = folderMap.get(folderId); while (current) { result.unshift(current); current = current.parentId ? folderMap.get(current.parentId) : undefined } return result }
function includeFolderAncestors(folderId: string, folderMap: Map<string, Folder>, ids: Set<string>) { let current = folderMap.get(folderId); while (current) { ids.add(current.id); current = current.parentId ? folderMap.get(current.parentId) : undefined } }
function renderHighlighted(text: string, query: string) { if (!query) return text; const source = text || ''; const lower = source.toLowerCase(); const q = query.toLowerCase(); const parts: JSX.Element[] = []; let cursor = 0; let idx = lower.indexOf(q, cursor); if (idx === -1) return source; while (idx !== -1) { if (idx > cursor) parts.push(<span key={`t-${cursor}`}>{source.slice(cursor, idx)}</span>); parts.push(<mark key={`m-${idx}`}>{source.slice(idx, idx + q.length)}</mark>); cursor = idx + q.length; idx = lower.indexOf(q, cursor) } if (cursor < source.length) parts.push(<span key={`t-${cursor}`}>{source.slice(cursor)}</span>); return parts }
function stripSearchMarks(html: string) { return html.replace(/<mark\b[^>]*class=(["'])search-hit\1[^>]*>(.*?)<\/mark>/gi, '$2').replace(/<mark\b[^>]*>(.*?)<\/mark>/gi, '$1') }
function escapeRegExp(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function escapeHtml(text: string) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function highlightHtml(content: string, query: string, noteType: NoteType) { if (noteType !== 'rich_text') { const raw = escapeHtml(content || ''); if (!query) return raw; const re = new RegExp(escapeRegExp(query), 'gi'); return raw.replace(re, (hit) => `<mark class="search-hit">${hit}</mark>`) } if (!query) return stripSearchMarks(content); const clean = stripSearchMarks(content); const re = new RegExp(escapeRegExp(query), 'gi'); return clean.replace(/>([^<]+)</g, (_m, text) => `>${text.replace(re, (hit: string) => `<mark class="search-hit">${hit}</mark>`)}<`) }
function stripHtml(html: string) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
function collectDescendantFolderIds<T extends { id: string; parentId: string | null }>(folders: T[], rootId: string): string[] { const ids = [rootId]; const queue = [rootId]; while (queue.length) { const current = queue.shift()!; for (const folder of folders) { if (folder.parentId === current) { ids.push(folder.id); queue.push(folder.id) } } } return ids }
function resequenceFolders<T extends { id: string; parentId: string | null; sort: number; name: string }>(folders: T[]): T[] { const buckets = new Map<string | null, T[]>(); for (const folder of folders) { const key = folder.parentId; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key)!.push(folder) } const orderMap = new Map<string, number>(); for (const bucket of buckets.values()) { bucket.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)); bucket.forEach((item, idx) => orderMap.set(item.id, idx)) } return folders.map((folder) => ({ ...folder, sort: orderMap.get(folder.id) ?? folder.sort })) }
function resequenceNotes<T extends { id: string; folderId: string; sort: number; title: string }>(notes: T[]): T[] { const buckets = new Map<string, T[]>(); for (const note of notes) { if (!buckets.has(note.folderId)) buckets.set(note.folderId, []); buckets.get(note.folderId)!.push(note) } const orderMap = new Map<string, number>(); for (const bucket of buckets.values()) { bucket.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title)); bucket.forEach((item, idx) => orderMap.set(item.id, idx)) } return notes.map((note) => ({ ...note, sort: orderMap.get(note.id) ?? note.sort })) }
function moveNoteByHint(data: AppData, noteId: string, hint: DropHint): AppData { if (hint.kind === 'none') return data; const notes = structuredClone(data.notes); const note = notes.find((n) => n.id === noteId); if (!note) return data; if (hint.kind === 'folder-into') { note.folderId = hint.folderId; const siblings = notes.filter((n) => n.folderId === hint.folderId && n.id !== noteId).sort((a, b) => a.sort - b.sort); siblings.push(note); siblings.forEach((n, idx) => { const found = notes.find((x) => x.id === n.id); if (found) found.sort = idx }); return { ...data, notes: resequenceNotes(notes) } } if (hint.kind === 'note-before' || hint.kind === 'note-after') { const target = notes.find((n) => n.id === hint.noteId); if (!target || target.id === noteId) return data; note.folderId = target.folderId; const bucket = notes.filter((n) => n.folderId === target.folderId && n.id !== noteId).sort((a, b) => a.sort - b.sort); const targetIndex = bucket.findIndex((n) => n.id === target.id); const insertAt = hint.kind === 'note-before' ? targetIndex : targetIndex + 1; bucket.splice(insertAt, 0, note); bucket.forEach((n, idx) => { const found = notes.find((x) => x.id === n.id); if (found) found.sort = idx }); return { ...data, notes: resequenceNotes(notes) } } return data }
function moveFolderByHint(data: AppData, folderId: string, hint: DropHint): AppData { if (hint.kind === 'none') return data; const folders = structuredClone(data.folders); const folder = folders.find((f) => f.id === folderId); if (!folder) return data; const descendants = new Set(collectDescendantFolderIds(folders, folderId)); if (hint.kind === 'folder-into') { if (descendants.has(hint.folderId) || hint.folderId === folderId) return data; folder.parentId = hint.folderId; const siblings = folders.filter((f) => f.parentId === hint.folderId && f.id !== folderId).sort((a, b) => a.sort - b.sort); siblings.push(folder); siblings.forEach((f, idx) => { const found = folders.find((x) => x.id === f.id); if (found) found.sort = idx }); return { ...data, folders: resequenceFolders(folders) } } if (hint.kind === 'folder-before' || hint.kind === 'folder-after') { const target = folders.find((f) => f.id === hint.folderId); if (!target || target.id === folderId || descendants.has(target.id)) return data; folder.parentId = target.parentId; const bucket = folders.filter((f) => f.parentId === target.parentId && f.id !== folderId).sort((a, b) => a.sort - b.sort); const targetIndex = bucket.findIndex((f) => f.id === target.id); const insertAt = hint.kind === 'folder-before' ? targetIndex : targetIndex + 1; bucket.splice(insertAt, 0, folder); bucket.forEach((f, idx) => { const found = folders.find((x) => x.id === f.id); if (found) found.sort = idx }); return { ...data, folders: resequenceFolders(folders) } } return data }
