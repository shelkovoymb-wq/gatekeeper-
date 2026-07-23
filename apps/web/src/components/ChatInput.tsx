import { useState, useRef, useEffect } from 'react'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  disabled = false,
  placeholder = 'Type your message...',
}: ChatInputProps) {
  const [rows, setRows] = useState(1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const newRows = Math.min(
        Math.max(1, Math.ceil(textareaRef.current.scrollHeight / 24)),
        5
      )
      setRows(newRows)
      textareaRef.current.style.height = `${newRows * 24}px`
    }
  }, [value])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim() && !isLoading && !disabled) {
      onSubmit(value)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit(e as any)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-slate-700 bg-gradient-to-t from-slate-900 to-slate-800 p-6 shadow-2xl"
      role="search"
      aria-label="Message input"
    >
      <div className="flex gap-4 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading || disabled}
          rows={rows}
          className="flex-1 px-4 py-3 border border-slate-600 rounded-xl bg-slate-700/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent resize-none disabled:bg-slate-800 disabled:cursor-not-allowed transition-all backdrop-blur-sm"
          aria-label="Message input"
        />

        <button
          type="submit"
          disabled={isLoading || disabled || !value.trim()}
          className="px-8 py-3 bg-gradient-to-r from-primary-500 via-secondary-500 to-accent-500 text-white rounded-xl font-bold hover:from-primary-600 hover:via-secondary-600 hover:to-accent-600 disabled:from-slate-500 disabled:to-slate-600 disabled:cursor-not-allowed transition-all duration-300 flex-shrink-0 shadow-lg hover:shadow-2xl hover:shadow-primary-500/40 transform hover:scale-105"
          aria-label={isLoading ? 'Sending...' : 'Send message'}
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Sending
            </span>
          ) : (
            '🚀 Send'
          )}
        </button>
      </div>

      <p className="text-xs text-slate-400 mt-3">
        ⌘ + Enter or Ctrl + Enter to send
      </p>
    </form>
  )
}
