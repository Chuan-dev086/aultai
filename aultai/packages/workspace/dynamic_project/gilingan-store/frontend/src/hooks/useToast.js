import { useCallback, useRef, useState } from "react";

export function useToast(duration = 2200) {
  const [message, setMessage] = useState("");
  const timer = useRef();
  const notify = useCallback((msg) => {
    setMessage(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), duration);
  }, [duration]);
  return { message, notify };
}
