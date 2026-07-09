'use client'

import dynamic from 'next/dynamic'

/**
 * Carga diferida del editor Tiptap (~440 KB). El chunk de tiptap/ProseMirror
 * solo baja cuando un <RichTextEditor> se monta de verdad (usuario editando),
 * no al abrir la vista de Desalojos. El path de LECTURA usa RichTextView
 * (components/RichTextView.tsx), que no depende de tiptap.
 *
 * ssr:false porque el editor necesita DOM/window. Los consumidores importan el
 * editor DESDE ACÁ (default) en vez de './RichTextEditor'.
 */
const RichTextEditor = dynamic(() => import('./RichTextEditor'), {
  ssr: false,
  loading: () => (
    <div className="border border-gray-200 rounded bg-gray-50 min-h-[64px] animate-pulse" />
  ),
})

export default RichTextEditor
