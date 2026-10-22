import React, { useState, useEffect } from 'react';
import { Timer, AlertCircle } from 'lucide-react';

const STORAGE_KEY = 'bag-watch-start';

export default function BagWatchTimer() {
  const [startTime, setStartTime] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) {
      setElapsed(0);
      return;
    }

    const tick = () => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const handleStart = () => {
    const now = Date.now();
    localStorage.setItem(STORAGE_KEY, String(now));
    setStartTime(now);
  };

  const handleEnd = () => {
    localStorage.removeItem(STORAGE_KEY);
    setStartTime(null);
  };

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isWarning = elapsed >= 30 * 60;
  const isApproaching = elapsed >= 20 * 60 && !isWarning;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center gap-4">
      <div className="text-4xl">🎒</div>
      <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
        <Timer size={20} />
        Bag Watch Timer
      </h3>

      <div
        className={`text-5xl font-mono font-bold text-center transition-colors ${
          isWarning
            ? 'text-red-500 animate-pulse'
            : isApproaching
            ? 'text-orange-400'
            : 'text-gray-700'
        }`}
      >
        {formatted}
      </div>

      {isWarning && (
        <div className="flex items-center gap-2 text-red-500 animate-pulse">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">Shift exceeds 30 minutes!</span>
        </div>
      )}

      {isApproaching && !isWarning && (
        <div className="flex items-center gap-2 text-orange-400">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">Approaching 30 minutes</span>
        </div>
      )}

      {!startTime && (
        <p className="text-sm text-gray-400">No shift in progress</p>
      )}

      <div className="flex gap-3 mt-2">
        {!startTime ? (
          <button
            onClick={handleStart}
            className="px-5 py-2 rounded-lg font-medium text-white transition-colors"
            style={{ backgroundColor: '#8FB8FF' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#8fb8de')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#8FB8FF')}
          >
            Start Shift
          </button>
        ) : (
          <button
            onClick={handleEnd}
            className="px-5 py-2 rounded-lg font-medium text-white transition-colors"
            style={{ backgroundColor: '#F5C400' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ef8fa5')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#F5C400')}
          >
            End Shift
          </button>
        )}
      </div>
    </div>
  );
}
