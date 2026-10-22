import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';

const STORAGE_KEY = 'break-end-time';
const PRESETS = [5, 10, 15, 20];

export default function BreakTimer() {
  const [duration, setDuration] = useState(15);
  const [endTime, setEndTime] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!endTime) {
      setRemaining(null);
      return;
    }

    const tick = () => {
      const diff = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setRemaining(diff);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  const handleStart = () => {
    const end = Date.now() + duration * 60 * 1000;
    localStorage.setItem(STORAGE_KEY, String(end));
    setEndTime(end);
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setEndTime(null);
  };

  const isRunning = endTime !== null;
  const isOver = isRunning && remaining === 0;

  const displaySeconds = isRunning ? remaining : duration * 60;
  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col items-center gap-4">
      <div className="text-4xl">☕</div>
      <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
        <Clock size={20} />
        Break Timer
      </h3>

      <div
        className={`text-5xl font-mono font-bold text-center transition-colors ${
          isOver ? 'text-red-500 animate-pulse' : 'text-gray-700'
        }`}
      >
        {isOver ? '00:00' : formatted}
      </div>

      {isOver && (
        <div className="flex items-center gap-2 text-red-500 animate-pulse">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">Break Over!</span>
        </div>
      )}

      {!isRunning && (
        <>
          <p className="text-sm text-gray-400">Select break duration</p>
          <div className="flex gap-2">
            {PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => setDuration(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  duration === m
                    ? 'text-white border-transparent'
                    : 'text-gray-600 border-gray-200 bg-white hover:bg-gray-50'
                }`}
                style={duration === m ? { backgroundColor: '#8FB8FF', borderColor: '#8FB8FF' } : {}}
              >
                {m} min
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex gap-3 mt-2">
        {!isRunning ? (
          <button
            onClick={handleStart}
            className="px-5 py-2 rounded-lg font-medium text-white transition-colors"
            style={{ backgroundColor: '#b6d7a8' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#9ecb8d')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#b6d7a8')}
          >
            Start Break
          </button>
        ) : (
          <button
            onClick={handleReset}
            className="px-5 py-2 rounded-lg font-medium text-white transition-colors"
            style={{ backgroundColor: '#F5C400' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ef8fa5')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#F5C400')}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
