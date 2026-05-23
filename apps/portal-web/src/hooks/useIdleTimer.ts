import { useState, useEffect } from 'react';

export function useIdleTimer(timeout: number) {
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      setIsIdle(false);
      timeoutId = setTimeout(() => setIsIdle(true), timeout);
    };

    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
    ];

    events.forEach((event) => document.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      events.forEach((event) =>
        document.removeEventListener(event, resetTimer),
      );
      clearTimeout(timeoutId);
    };
  }, [timeout]);

  return isIdle;
}
