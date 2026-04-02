import { useEffect, useRef, useState } from 'react';

export function InlineEditable({
  value,
  onSave,
  onClick,
  className = '',
  inputClassName = '',
  title,
  style,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commit = () => {
    onSave(draft);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setDraft(value);
            setIsEditing(false);
          }
        }}
        className={inputClassName}
      />
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onDoubleClick={() => setIsEditing(true)}
      className={className}
      style={style}
    >
      {value}
    </button>
  );
}
