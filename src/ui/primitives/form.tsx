import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"

type ControlProps = { className?: string }

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & ControlProps) {
  return <input {...props} className={["ui-input", className].filter(Boolean).join(" ")} />
}

export function TextArea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps) {
  return <textarea {...props} className={["ui-textarea", className].filter(Boolean).join(" ")} />
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement> & ControlProps) {
  return <select {...props} className={["ui-select", className].filter(Boolean).join(" ")} />
}
