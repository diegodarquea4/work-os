'use client'

import { useState, useEffect } from 'react'

const MESSAGES: Record<string, string[]> = {
  ejecutiva: [
    'Analizando datos de la región...',
    'Redactando síntesis ejecutiva...',
    'Generando documento PDF...',
  ],
  ficha: [
    'Compilando indicadores regionales...',
    'Generando Kit de Viaje PDF...',
  ],
}

const TIPO_LABEL: Record<string, string> = {
  ejecutiva: 'Minuta Ejecutiva',
  ficha: 'Kit de Viaje',
}

export default function MinutaLoadingModal({ tipo }: { tipo: string }) {
  const messages = MESSAGES[tipo] ?? MESSAGES.ejecutiva
  const [msgIdx, setMsgIdx] = useState(0)
  const [fadeIn, setFadeIn] = useState(true)

  useEffect(() => {
    if (msgIdx >= messages.length - 1) return
    const timer = setInterval(() => {
      setFadeIn(false)
      setTimeout(() => {
        setMsgIdx(i => Math.min(i + 1, messages.length - 1))
        setFadeIn(true)
      }, 300)
    }, 3000)
    return () => clearInterval(timer)
  }, [msgIdx, messages.length])

  const progress = Math.round(((msgIdx + 1) / messages.length) * 100)

  return (
    <>
      <style>{`
        @keyframes minuta-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(420%); }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

          {/* ── Header ── */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="rgb(15 23 42)" strokeWidth="1.5">
                <path d="M4 3h8l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" strokeLinejoin="round"/>
                <path d="M12 3v4h4M7 10h6M7 13h4" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900 leading-tight">
                {TIPO_LABEL[tipo] ?? 'Minuta'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">División de Coordinación Interministerial</p>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="px-6 pt-5 pb-4">

            {/* Progress bar with shimmer */}
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1 relative">
              <div
                className="h-full bg-slate-900 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute inset-y-0 w-1/5 bg-white/40 rounded-full"
                style={{ animation: 'minuta-slide 1.6s ease-in-out infinite' }}
              />
            </div>

            {/* Step label */}
            <p className="text-right text-xs text-gray-400 mb-5">
              {msgIdx + 1} / {messages.length}
            </p>

            {/* Cycling message */}
            <div className="min-h-[2.5rem] flex items-start">
              <p
                className="text-sm text-gray-800 leading-snug transition-opacity duration-300"
                style={{ opacity: fadeIn ? 1 : 0 }}
              >
                {messages[msgIdx]}
              </p>
            </div>

            {/* Step dots */}
            <div className="flex items-center gap-1.5 mt-4">
              {messages.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i < msgIdx
                      ? 'bg-slate-900 w-1.5'
                      : i === msgIdx
                        ? 'bg-slate-900 w-4'
                        : 'bg-gray-200 w-1.5'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="px-6 pb-5">
            <p className="text-xs text-gray-400 text-center">
              {tipo === 'ficha'
                ? 'Compilando datos regionales — unos segundos.'
                : 'Generando documento — puede demorar hasta 15 seg.'}
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
