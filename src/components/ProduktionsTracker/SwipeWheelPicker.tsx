import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface SwipeWheelPickerProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  quickValues?: number[];
}

// Audio Context singleton for tick sounds
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported');
      return null;
    }
  }
  return audioContext;
};

// Premium tick sound generator
const playTickSound = (intensity: 'light' | 'medium' | 'heavy' | 'success' | 'limit') => {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume if suspended (required for user interaction)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const now = ctx.currentTime;

  // Create oscillator for the tick
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Different sounds for different intensities
  const configs: Record<string, { freq: number; duration: number; gain: number; type: OscillatorType }> = {
    light: { freq: 1200, duration: 0.02, gain: 0.08, type: 'sine' },
    medium: { freq: 800, duration: 0.03, gain: 0.12, type: 'triangle' },
    heavy: { freq: 600, duration: 0.04, gain: 0.15, type: 'triangle' },
    success: { freq: 880, duration: 0.1, gain: 0.2, type: 'sine' },
    limit: { freq: 200, duration: 0.08, gain: 0.1, type: 'square' },
  };

  const config = configs[intensity];

  oscillator.type = config.type;
  oscillator.frequency.setValueAtTime(config.freq, now);

  // Success sound has a frequency sweep up
  if (intensity === 'success') {
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.05);
    oscillator.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
  }

  // Limit sound sweeps down
  if (intensity === 'limit') {
    oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.08);
  }

  gainNode.gain.setValueAtTime(config.gain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + config.duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + config.duration + 0.01);
};

// Premium haptic feedback
const triggerHaptic = (pattern: 'tick' | 'heavy' | 'success' | 'limit' | 'drag') => {
  if (!navigator.vibrate) return;

  const patterns: Record<string, number | number[]> = {
    tick: 8,           // Short, crisp tick
    heavy: 15,         // Heavier tick for big changes
    success: [30, 50, 30, 50, 60], // Celebratory pattern
    limit: [20, 30, 20],           // Warning - hit limit
    drag: 3,           // Very light during continuous drag
  };

  navigator.vibrate(patterns[pattern]);
};

// Physics constants
const MOMENTUM_MULTIPLIER = 0.92;  // Decay rate
const MIN_VELOCITY = 0.5;          // Stop threshold
const SNAP_SPRING = 0.3;           // Snap animation speed
const SENSITIVITY = 8;             // Pixels per unit

const SwipeWheelPicker: React.FC<SwipeWheelPickerProps> = ({
  value,
  onChange,
  min = 1,
  max = 500,
  step = 1,
  unit = 'Tonnen',
  quickValues = [5, 10, 25, 50],
}) => {
  // State
  const [isDragging, setIsDragging] = useState(false);
  const [displayOffset, setDisplayOffset] = useState(0); // Visual offset during drag

  // Refs
  const wheelRef = useRef<HTMLDivElement>(null);
  const velocityRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const lastValueRef = useRef(value);
  const startValueRef = useRef(value);
  const accumulatedDeltaRef = useRef(0);

  // Clamp value to bounds
  const clampValue = useCallback((v: number) => {
    return Math.max(min, Math.min(max, Math.round(v / step) * step));
  }, [min, max, step]);

  // Handle value change with feedback
  const handleValueChange = useCallback((newValue: number, source: 'drag' | 'momentum' | 'button' | 'quick') => {
    const clamped = clampValue(newValue);

    if (clamped !== lastValueRef.current) {
      const diff = Math.abs(clamped - lastValueRef.current);

      // Play feedback based on source and change magnitude
      if (source === 'drag') {
        playTickSound(diff > 5 ? 'medium' : 'light');
        triggerHaptic(diff > 5 ? 'heavy' : 'tick');
      } else if (source === 'momentum') {
        playTickSound('light');
        triggerHaptic('tick');
      } else if (source === 'button') {
        playTickSound('medium');
        triggerHaptic('heavy');
      } else if (source === 'quick') {
        playTickSound('heavy');
        triggerHaptic('heavy');
      }

      lastValueRef.current = clamped;
      onChange(clamped);
    }

    // Check limits
    if (newValue < min || newValue > max) {
      playTickSound('limit');
      triggerHaptic('limit');
    }
  }, [clampValue, min, max, onChange]);

  // Animation loop for momentum
  const animateMomentum = useCallback(() => {
    const velocity = velocityRef.current;

    if (Math.abs(velocity) < MIN_VELOCITY) {
      velocityRef.current = 0;
      setDisplayOffset(0);
      animationRef.current = null;
      return;
    }

    // Apply momentum
    accumulatedDeltaRef.current += velocity;
    velocityRef.current *= MOMENTUM_MULTIPLIER;

    // Calculate new value from accumulated delta
    const deltaUnits = Math.round(accumulatedDeltaRef.current / SENSITIVITY);
    if (deltaUnits !== 0) {
      const newValue = startValueRef.current + deltaUnits;
      handleValueChange(newValue, 'momentum');
    }

    // Visual offset for smooth animation
    const remainder = accumulatedDeltaRef.current % SENSITIVITY;
    setDisplayOffset(-remainder);

    animationRef.current = requestAnimationFrame(animateMomentum);
  }, [handleValueChange]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    setIsDragging(true);
    lastYRef.current = e.touches[0].clientY;
    lastTimeRef.current = Date.now();
    startValueRef.current = value;
    accumulatedDeltaRef.current = 0;
    velocityRef.current = 0;

    // Initialize audio context on first touch
    getAudioContext();
  }, [value]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();

    const currentY = e.touches[0].clientY;
    const currentTime = Date.now();

    const deltaY = lastYRef.current - currentY;
    const deltaTime = Math.max(currentTime - lastTimeRef.current, 1);

    // Track velocity for momentum
    velocityRef.current = deltaY / deltaTime * 16; // Normalize to ~60fps

    accumulatedDeltaRef.current += deltaY;

    // Calculate new value
    const deltaUnits = Math.round(accumulatedDeltaRef.current / SENSITIVITY);
    if (deltaUnits !== 0) {
      const newValue = startValueRef.current + deltaUnits;
      handleValueChange(newValue, 'drag');
    }

    // Visual offset for smooth dragging
    const remainder = accumulatedDeltaRef.current % SENSITIVITY;
    setDisplayOffset(-remainder);

    lastYRef.current = currentY;
    lastTimeRef.current = currentTime;
  }, [isDragging, handleValueChange]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);

    // Start momentum animation if velocity is significant
    if (Math.abs(velocityRef.current) > MIN_VELOCITY) {
      animationRef.current = requestAnimationFrame(animateMomentum);
    } else {
      // Snap back
      setDisplayOffset(0);
    }
  }, [animateMomentum]);

  // Mouse handlers (for desktop)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    setIsDragging(true);
    lastYRef.current = e.clientY;
    lastTimeRef.current = Date.now();
    startValueRef.current = value;
    accumulatedDeltaRef.current = 0;
    velocityRef.current = 0;

    getAudioContext();
  }, [value]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentY = e.clientY;
      const currentTime = Date.now();

      const deltaY = lastYRef.current - currentY;
      const deltaTime = Math.max(currentTime - lastTimeRef.current, 1);

      velocityRef.current = deltaY / deltaTime * 16;

      accumulatedDeltaRef.current += deltaY;

      const deltaUnits = Math.round(accumulatedDeltaRef.current / SENSITIVITY);
      if (deltaUnits !== 0) {
        const newValue = startValueRef.current + deltaUnits;
        handleValueChange(newValue, 'drag');
      }

      const remainder = accumulatedDeltaRef.current % SENSITIVITY;
      setDisplayOffset(-remainder);

      lastYRef.current = currentY;
      lastTimeRef.current = currentTime;
    };

    const handleMouseUp = () => {
      setIsDragging(false);

      if (Math.abs(velocityRef.current) > MIN_VELOCITY) {
        animationRef.current = requestAnimationFrame(animateMomentum);
      } else {
        setDisplayOffset(0);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleValueChange, animateMomentum]);

  // Wheel scroll handler
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    // Cancel ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const delta = e.deltaY > 0 ? -step : step;
    const newValue = value + delta;

    handleValueChange(newValue, 'button');
  }, [value, step, handleValueChange]);

  useEffect(() => {
    const wheel = wheelRef.current;
    if (wheel) {
      wheel.addEventListener('wheel', handleWheel, { passive: false });
      return () => wheel.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Generate wheel items with 3D effect
  const wheelItems = useMemo(() => {
    const items = [];
    const visibleRange = 5; // Items visible above and below center

    for (let i = -visibleRange; i <= visibleRange; i++) {
      const itemValue = value + i;
      if (itemValue >= min && itemValue <= max) {
        items.push({
          value: itemValue,
          offset: i,
        });
      } else {
        items.push({
          value: null,
          offset: i,
        });
      }
    }
    return items;
  }, [value, min, max]);

  // Increment/decrement with feedback
  const handleIncrement = useCallback((amount: number) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const newValue = value + amount;
    handleValueChange(newValue, 'button');
  }, [value, handleValueChange]);

  // Quick value selection
  const handleQuickValue = useCallback((v: number) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    handleValueChange(v, 'quick');
    setDisplayOffset(0);
    startValueRef.current = v;
    accumulatedDeltaRef.current = 0;
  }, [handleValueChange]);

  return (
    <div className="flex flex-col items-center w-full">
      {/* Quick Select Buttons */}
      <div className="flex gap-2 mb-4">
        {quickValues.map((v) => (
          <button
            key={v}
            onClick={() => handleQuickValue(v)}
            className={`
              px-3.5 py-2 rounded-xl font-semibold text-sm
              transition-all duration-200 transform active:scale-95
              ${value === v
                ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/40 scale-105'
                : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 shadow-md'
              }
            `}
          >
            {v}{unit === 'Tonnen' ? 't' : ''}
          </button>
        ))}
      </div>

      {/* Wheel Container */}
      <div className="relative w-full max-w-xs">
        {/* Up Button */}
        <button
          onClick={() => handleIncrement(step)}
          className="
            w-full flex justify-center py-2
            text-gray-400 dark:text-gray-500
            active:text-orange-500 active:scale-110
            transition-all duration-150
          "
        >
          <ChevronUp className="w-8 h-8 stroke-[2.5]" />
        </button>

        {/* 3D Wheel */}
        <div
          ref={wheelRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          className={`
            relative h-56 overflow-hidden select-none
            ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
          `}
          style={{
            perspective: '800px',
            perspectiveOrigin: 'center center',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {/* Edge Gradients - stronger for 3D depth */}
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-orange-50 via-orange-50/95 dark:from-gray-900 dark:via-gray-900/95 to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-orange-50 via-orange-50/95 dark:from-gray-900 dark:via-gray-900/95 to-transparent z-20 pointer-events-none" />

          {/* Center Selection Highlight */}
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-[72px] z-10 pointer-events-none">
            <div className="
              w-full h-full rounded-2xl
              bg-gradient-to-r from-orange-500/20 via-orange-500/30 to-orange-500/20
              dark:from-orange-400/25 dark:via-orange-400/35 dark:to-orange-400/25
              border-2 border-orange-500/60 dark:border-orange-400/60
              shadow-[inset_0_2px_8px_rgba(0,0,0,0.1)]
            " />
            {/* Glow effect */}
            <div className="
              absolute inset-0 rounded-2xl
              bg-gradient-to-r from-transparent via-orange-400/10 to-transparent
              animate-pulse
            " />
          </div>

          {/* 3D Drum Items */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{
              transform: `translateY(${displayOffset}px)`,
              transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)',
            }}
          >
            {wheelItems.map((item, index) => {
              const isCenter = item.offset === 0;
              const distance = Math.abs(item.offset);

              // 3D drum rotation
              const rotateX = item.offset * -22; // Degrees per item
              const translateZ = -Math.abs(item.offset) * 15; // Depth
              const itemY = item.offset * 48; // Vertical spacing

              // Opacity and scale based on distance
              const opacity = item.value !== null
                ? Math.max(0, 1 - distance * 0.2)
                : 0;
              const scale = isCenter ? 1 : Math.max(0.6, 1 - distance * 0.08);

              return (
                <div
                  key={index}
                  className="absolute flex items-center justify-center"
                  style={{
                    transform: `
                      translateY(${itemY}px)
                      translateZ(${translateZ}px)
                      rotateX(${rotateX}deg)
                      scale(${scale})
                    `,
                    opacity,
                    transformStyle: 'preserve-3d',
                    backfaceVisibility: 'hidden',
                    transition: isDragging ? 'none' : 'all 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)',
                  }}
                >
                  <span
                    className={`
                      font-bold tabular-nums tracking-tight
                      transition-colors duration-150
                      ${isCenter
                        ? 'text-6xl text-orange-600 dark:text-orange-400 drop-shadow-[0_2px_4px_rgba(234,88,12,0.3)]'
                        : distance === 1
                          ? 'text-4xl text-gray-500 dark:text-gray-400'
                          : 'text-3xl text-gray-400 dark:text-gray-500'
                      }
                    `}
                  >
                    {item.value}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Touch/Drag indicator lines */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-30 pointer-events-none">
            <div className="w-1 h-3 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="w-1 h-3 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="w-1 h-3 rounded-full bg-gray-400 dark:bg-gray-500" />
          </div>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-30 pointer-events-none">
            <div className="w-1 h-3 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="w-1 h-3 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="w-1 h-3 rounded-full bg-gray-400 dark:bg-gray-500" />
          </div>
        </div>

        {/* Down Button */}
        <button
          onClick={() => handleIncrement(-step)}
          className="
            w-full flex justify-center py-2
            text-gray-400 dark:text-gray-500
            active:text-orange-500 active:scale-110
            transition-all duration-150
          "
        >
          <ChevronDown className="w-8 h-8 stroke-[2.5]" />
        </button>

        {/* Unit Label */}
        <div className="text-center mt-1">
          <span className="text-xl font-semibold text-gray-500 dark:text-gray-400">{unit}</span>
        </div>
      </div>
    </div>
  );
};

export default SwipeWheelPicker;

// Export utility functions for external use
export { playTickSound, triggerHaptic };
