
import { useEffect, useMemo, useRef, useState } from 'react'
import MindMap from 'simple-mind-map'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import Select from 'simple-mind-map/src/plugins/Select.js'
import KeyboardNavigation from 'simple-mind-map/src/plugins/KeyboardNavigation.js'
import Scrollbar from 'simple-mind-map/src/plugins/Scrollbar.js'
import MiniMap from 'simple-mind-map/src/plugins/MiniMap.js'
import Export from 'simple-mind-map/src/plugins/Export.js'
import Themes from 'simple-mind-map-plugin-themes'
import themeList from 'simple-mind-map-plugin-themes/themeList'
import 'simple-mind-map/dist/simpleMindMap.esm.css'

type Props = {
  value: string
  onChange: (val: string) => void
}

type MindMapFullData = {
  layout?: string
  root?: any
  theme?: {
    template?: string
    config?: Record<string, any>
  }
  view?: Record<string, any>
}

type NodeStyleState = {
  fontSize: number
  color: string
  fillColor: string
  borderColor: string
}

let pluginsRegistered = false

function ensurePlugins() {
  if (pluginsRegistered) return
  try {
    Themes.init(MindMap)
  } catch {}
  try { MindMap.usePlugin(Drag) } catch {}
  try { MindMap.usePlugin(Select) } catch {}
  try { MindMap.usePlugin(KeyboardNavigation) } catch {}
  try { MindMap.usePlugin(Scrollbar) } catch {}
  try { MindMap.usePlugin(MiniMap) } catch {}
  try { MindMap.usePlugin(Export) } catch {}
  pluginsRegistered = true
}

function createDefaultMindMapData(): MindMapFullData {
  return {
    layout: 'mindMap',
    root: {
      data: {
        text: '中心主题',
      },
      children: [],
    },
    theme: {
      template: 'default',
      config: {},
    },
    view: {},
  }
}

function convertLegacyNode(node: any): any {
  return {
    data: {
      text: typeof node?.text === 'string' ? node.text : '新节点',
    },
    children: Array.isArray(node?.children) ? node.children.map(convertLegacyNode) : [],
  }
}

function normalizeMindMapData(value: string): MindMapFullData {
  if (!value.trim()) return createDefaultMindMapData()
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && parsed.root) {
      return {
        layout: parsed.layout || 'mindMap',
        root: parsed.root,
        theme: parsed.theme || { template: 'default', config: {} },
        view: parsed.view || {},
      }
    }
    if (parsed && typeof parsed === 'object' && parsed.data) {
      return {
        layout: 'mindMap',
        root: parsed,
        theme: { template: 'default', config: {} },
        view: {},
      }
    }
    if (parsed && typeof parsed === 'object' && parsed.root?.text) {
      return {
        layout: 'mindMap',
        root: {
          data: { text: parsed.root.text || '中心主题' },
          children: (parsed.root.children || []).map(convertLegacyNode),
        },
        theme: { template: 'default', config: {} },
        view: {},
      }
    }
  } catch {}
  return createDefaultMindMapData()
}

const defaultNodeStyle: NodeStyleState = {
  fontSize: 16,
  color: '#1f2937',
  fillColor: '#ffffff',
  borderColor: '#274472',
}

export default function MindMapEditor({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mindRef = useRef<any>(null)
  const saveTimerRef = useRef<number | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeNode, setActiveNode] = useState<any>(null)
  const [styleState, setStyleState] = useState<NodeStyleState>(defaultNodeStyle)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [currentTheme, setCurrentTheme] = useState(() => 'default')
  const [currentLayout, setCurrentLayout] = useState('mindMap')
  const [panelOpen, setPanelOpen] = useState(true)

  const initialData = useMemo(() => normalizeMindMapData(value), [value])

  const syncActiveNodeState = () => {
    const node = mindRef.current?.renderer?.activeNodeList?.[0] || null
    setActiveNode(node)
    const data = node?.nodeData?.data || node?.data?.data || node?.getData?.()?.data || {}
    setStyleState({
      fontSize: Number(data.fontSize || 16),
      color: data.color || '#1f2937',
      fillColor: data.fillColor || '#ffffff',
      borderColor: data.borderColor || '#274472',
    })
  }

  useEffect(() => {
    ensurePlugins()
    if (!containerRef.current) return

    try {
      const full = initialData
      const options: Record<string, any> = {
        el: containerRef.current,
        data: full.root,
        layout: 'mindMap',
        theme: full.theme?.template || 'default',
        themeConfig: full.theme?.config || {},
        enableFreeDrag: false,
        mousewheelAction: 'zoom',
        useLeftKeySelectionRightKeyDrag: false,
        fit: true,
      }
      if (full.view && (full.view as any).state) {
        options.viewData = full.view
      }

      const mind = new MindMap(options as any)
      mindRef.current = mind
      setCurrentTheme('default')
      setCurrentLayout('mindMap')

      const persist = () => {
        if (!mindRef.current) return
        try {
          const fullData = mindRef.current.getData(true)
          onChange(JSON.stringify(fullData, null, 2))
          setNotice('已保存')
          window.setTimeout(() => setNotice(''), 1200)
        } catch (err) {
          console.error('mind map save failed', err)
        }
      }

      const schedulePersist = () => {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = window.setTimeout(() => {
          persist()
        }, 180)
      }

      mind.on?.('data_change', schedulePersist)
      mind.on?.('view_data_change', schedulePersist)
      mind.on?.('node_active', () => {
        syncActiveNodeState()
        setContextMenu(null)
      })
      mind.on?.('draw_click', () => setContextMenu(null))
      mind.on?.('node_tree_render_end', () => {
        syncActiveNodeState()
        setReady(true)
      })

      setReady(true)
      setError('')

      return () => {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
        try {
          mind.destroy()
        } catch {}
        mindRef.current = null
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const exec = (command: string, ...args: any[]) => {
    if (!mindRef.current) return
    try {
      mindRef.current.execCommand(command, ...args)
      setContextMenu(null)
    } catch (err) {
      console.error(command, err)
    }
  }

  const setLayout = (layout: string) => {
    try {
      if (!mindRef.current) return
      if (typeof mindRef.current.setLayout === 'function') {
        mindRef.current.setLayout(layout)
      } else {
        exec('SET_LAYOUT', layout)
      }
      setCurrentLayout(layout)
      setNotice('布局已切换')
      window.setTimeout(() => setNotice(''), 1200)
      try {
        const fullData = mindRef.current?.getData?.(true)
        if (fullData) {
          fullData.layout = layout
          onChange(JSON.stringify(fullData, null, 2))
        }
      } catch (err) {
        console.error('persist layout', err)
      }
    } catch (err) {
      console.error('setLayout', err)
    }
  }

  const setTheme = (theme: string) => {
    try {
      if (!mindRef.current) return
      if (typeof mindRef.current.setTheme === 'function') {
        mindRef.current.setTheme(theme)
      } else {
        exec('SET_THEME', theme)
      }
      setCurrentTheme(theme)
      onAfterMutation()
    } catch (err) {
      console.error('setTheme', err)
    }
  }

  const onAfterMutation = () => {
    syncActiveNodeState()
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      try {
        const fullData = mindRef.current?.getData?.(true)
        if (fullData) onChange(JSON.stringify(fullData, null, 2))
      } catch (err) {
        console.error(err)
      }
    }, 160)
  }

  const resetCenter = () => {
    try {
      if (mindRef.current?.renderer?.setRootNodeCenter) {
        mindRef.current.renderer.setRootNodeCenter()
      } else {
        exec('RESET_LAYOUT')
      }
      onAfterMutation()
    } catch (err) {
      console.error('resetCenter', err)
    }
  }

  const exportJson = () => {
    try {
      const fullData = mindRef.current?.getData?.(true)
      const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mind-map.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('exportJson', err)
    }
  }

  const exportImg = async () => {
    try {
      const image = await mindRef.current?.export?.('png', true)
      if (!image) return
      const a = document.createElement('a')
      a.href = image
      a.download = 'mind-map.png'
      a.click()
    } catch (err) {
      console.error('exportImg', err)
    }
  }

  const updateNodeStyle = (patch: Partial<NodeStyleState>) => {
    const node = activeNode || mindRef.current?.renderer?.activeNodeList?.[0]
    if (!node || !mindRef.current?.renderer?.setNodeDataRender) return
    const next = {
      ...styleState,
      ...patch,
    }
    setStyleState(next)
    try {
      mindRef.current.renderer.setNodeDataRender(node, {
        fontSize: next.fontSize,
        color: next.color,
        fillColor: next.fillColor,
        borderColor: next.borderColor,
      })
      onAfterMutation()
    } catch (err) {
      console.error('updateNodeStyle', err)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!mindRef.current?.renderer?.activeNodeList?.length) return
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const themeOptions = [
    { name: '默认主题', value: 'default' },
    ...((themeList as any[]) || []).slice(0, 8).map((item: any) => ({
      name: item.name || item.value,
      value: item.value,
    })),
  ]

  return (
    <div className="smm-shell">
      <div className="smm-toolbar">
        <button className="primary" onClick={() => exec('INSERT_CHILD_NODE', false)}>+ 子主题</button>
        <button onClick={() => exec('INSERT_NODE', false)}>+ 同级</button>
        <button onClick={() => exec('REMOVE_NODE')}>删除</button>
        <button onClick={() => exec('BACK')}>撤销</button>
        <button onClick={() => exec('FORWARD')}>重做</button>
        <button onClick={() => exec('RESET_LAYOUT')}>整理布局</button>
        <button onClick={resetCenter}>根节点居中</button>
        <button onClick={exportJson}>导出 JSON</button>
        <button onClick={exportImg}>导出图片</button>
        <button className={currentLayout === 'mindMap' ? 'primary' : ''} onClick={() => setLayout('mindMap')}>左右结构</button>
        <button className={currentLayout === 'logicalStructure' ? 'primary' : ''} onClick={() => setLayout('logicalStructure')}>单侧结构</button>
        <button className={currentLayout === 'organizationStructure' ? 'primary' : ''} onClick={() => setLayout('organizationStructure')}>组织结构</button>
        <button className={currentLayout === 'catalogOrganization' ? 'primary' : ''} onClick={() => setLayout('catalogOrganization')}>目录结构</button>
        <button onClick={() => setPanelOpen((v) => !v)}>{panelOpen ? '收起属性' : '展开属性'}</button>
        <div className="smm-toolbar-spacer" />
        <label className="smm-inline-field">
          <span>主题</span>
          <select value={currentTheme} onChange={(e) => setTheme(e.target.value)}>
            {themeOptions.map((item) => <option key={item.value} value={item.value}>{item.name}</option>)}
          </select>
        </label>
      </div>

      <div className="smm-main">
        <div className="smm-stage-wrap" onContextMenu={handleContextMenu}>
          <div ref={containerRef} className="smm-stage" />
          {!ready && !error ? <div className="smm-overlay">脑图初始化中…</div> : null}
          {error ? <div className="smm-overlay smm-overlay-error">脑图加载失败：{error}</div> : null}
        </div>

        <aside className={`smm-sidepanel ${panelOpen ? "" : "collapsed"}`}>
          <div className="smm-sidepanel-title">节点样式</div>
          <label className="smm-field">
            <span>字号</span>
            <select value={String(styleState.fontSize)} onChange={(e) => updateNodeStyle({ fontSize: Number(e.target.value) })}>
              {[14, 16, 18, 20, 24, 28].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <label className="smm-field">
            <span>文字颜色</span>
            <input type="color" value={styleState.color} onChange={(e) => updateNodeStyle({ color: e.target.value })} />
          </label>
          <label className="smm-field">
            <span>背景颜色</span>
            <input type="color" value={styleState.fillColor} onChange={(e) => updateNodeStyle({ fillColor: e.target.value })} />
          </label>
          <label className="smm-field">
            <span>边框颜色</span>
            <input type="color" value={styleState.borderColor} onChange={(e) => updateNodeStyle({ borderColor: e.target.value })} />
          </label>
          <div className="smm-sidepanel-tip">先点选节点，再调样式。</div>
        </aside>

        {contextMenu ? (
          <div className="smm-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button onClick={() => exec('INSERT_NODE', false)}>插入同级节点</button>
            <button onClick={() => exec('INSERT_CHILD_NODE', false)}>插入子级节点</button>
            <button onClick={() => exec('UP_NODE')}>上移节点</button>
            <button onClick={() => exec('DOWN_NODE')}>下移节点</button>
            <button onClick={() => exec('EXPAND_ALL')}>展开所有下级节点</button>
            <button onClick={() => exec('UNEXPAND_ALL')}>收起所有下级节点</button>
            <div className="smm-context-sep" />
            <button className="danger" onClick={() => exec('REMOVE_NODE')}>删除节点</button>
          </div>
        ) : null}
      </div>

      <div className="smm-footer">
        <span>SimpleMindMap 集成版</span>
        {notice ? <span className="smm-notice">{notice}</span> : null}
      </div>
    </div>
  )
}
