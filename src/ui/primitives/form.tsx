import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react"

type ControlProps = { className?: string }

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & ControlProps>(function Input({ className = "", ...props }, ref) {
  return <input {...props} ref={ref} className={["ui-input", className].filter(Boolean).join(" ")} />
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps>(function TextArea({ className = "", ...props }, ref) {
  return <textarea {...props} ref={ref} className={["ui-textarea", className].filter(Boolean).join(" ")} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & ControlProps>(function Select({ className = "", ...props }, ref) {
  return <select {...props} ref={ref} className={["ui-select", className].filter(Boolean).join(" ")} />
})
