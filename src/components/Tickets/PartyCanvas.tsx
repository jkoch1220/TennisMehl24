import { useEffect, useRef } from 'react';

interface PartyCanvasProps {
  trigger: boolean;
  onComplete?: () => void;
  position?: { x: number; y: number };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  type: 'circle' | 'star' | 'dollar' | 'confetti' | 'sparkle';
  life: number;
  maxLife: number;
  scale: number;
}

const PartyCanvas = ({ trigger, onComplete, position }: PartyCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAnimatingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!trigger) {
      // Cleanup wenn trigger false wird
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      particlesRef.current = [];
      isAnimatingRef.current = false;
      return;
    }

    if (isAnimatingRef.current) return; // Verhindere doppelte Animationen
    isAnimatingRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) {
      isAnimatingRef.current = false;
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      isAnimatingRef.current = false;
      return;
    }

    // Canvas auf volle Bildschirmgröße setzen
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';

    const centerX = position?.x ?? window.innerWidth / 2;
    const centerY = position?.y ?? window.innerHeight / 2;

    // Spektakuläre Farbpalette
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#FF6B9D',
      '#C44569', '#F8B500', '#6C5CE7', '#00D2D3', '#FF6348',
      '#FFD700', '#FF1493', '#00FF7F', '#FF4500', '#9370DB',
      '#FF69B4', '#00CED1', '#FF8C00', '#32CD32', '#FF1493'
    ];

    // Optimierte Partikel-Anzahl für Performance
    const particleCount = 300;
    particlesRef.current = [];
    startTimeRef.current = Date.now();

    // Erste Explosionswelle - Hauptexplosion
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = 3 + Math.random() * 8;
      const rand = Math.random();
      const type = rand < 0.25 ? 'star' : 
                   rand < 0.5 ? 'circle' : 
                   rand < 0.75 ? 'confetti' : 
                   rand < 0.9 ? 'sparkle' : 'dollar';
      
      particlesRef.current.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: type === 'dollar' ? 18 : (8 + Math.random() * 14),
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.25,
        type,
        life: 0,
        maxLife: 180 + Math.random() * 80,
        scale: 1,
      });
    }

    // Zweite Explosionswelle nach kurzer Verzögerung
    timeoutRef.current = setTimeout(() => {
      if (!isAnimatingRef.current) return;
      
      for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6;
        const type = Math.random() < 0.5 ? 'sparkle' : 'star';
        
        particlesRef.current.push({
          x: centerX,
          y: centerY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 6 + Math.random() * 10,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.3,
          type,
          life: 0,
          maxLife: 120 + Math.random() * 80,
          scale: 1,
        });
      }
    }, 100);

    // Optimierte Animations-Loop
    const animate = () => {
      if (!isAnimatingRef.current) return;
      
      const currentTime = Date.now();
      const elapsed = currentTime - startTimeRef.current;
      
      // Clear mit optimierter Methode
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Entferne inaktive Partikel während der Iteration
      const activeParticles: Particle[] = [];
      let hasActiveParticles = false;

      particlesRef.current.forEach((particle) => {
        particle.life++;
        
        // Partikel bewegen
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.18; // Schwerkraft
        particle.rotation += particle.rotationSpeed;
        particle.vx *= 0.986; // Reibung
        particle.vy *= 0.986;
        
        // Pulsierender Scale-Effekt (optimiert)
        particle.scale = 1 + Math.sin(particle.life * 0.08) * 0.25;
        
        const lifeRatio = particle.life / particle.maxLife;
        const isActive = particle.life < particle.maxLife && particle.y < window.innerHeight + 200 && particle.x > -100 && particle.x < window.innerWidth + 100;
        
        if (isActive) {
          hasActiveParticles = true;
          activeParticles.push(particle);
          
          // Partikel zeichnen
          ctx.save();
          ctx.translate(particle.x, particle.y);
          ctx.rotate(particle.rotation);
          ctx.scale(particle.scale, particle.scale);
          
          const alpha = Math.max(0, 1 - lifeRatio * 1.3);
          ctx.globalAlpha = alpha;
          
          ctx.fillStyle = particle.color;
          ctx.strokeStyle = particle.color;
          ctx.lineWidth = 1.5;

          switch (particle.type) {
            case 'circle':
              ctx.beginPath();
              ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
              ctx.fill();
              break;
              
            case 'star':
              ctx.beginPath();
              const starSize = particle.size / 2;
              for (let i = 0; i < 5; i++) {
                const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
                const x = Math.cos(angle) * starSize;
                const y = Math.sin(angle) * starSize;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }
              ctx.closePath();
              ctx.fill();
              break;
              
            case 'dollar':
              ctx.font = `bold ${particle.size}px Arial`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('$', 0, 0);
              break;
              
            case 'confetti':
              ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
              break;
              
            case 'sparkle':
              ctx.beginPath();
              const sparkleSize = particle.size / 2;
              ctx.moveTo(0, -sparkleSize);
              ctx.lineTo(sparkleSize / 6, -sparkleSize / 6);
              ctx.lineTo(sparkleSize, 0);
              ctx.lineTo(sparkleSize / 6, sparkleSize / 6);
              ctx.lineTo(0, sparkleSize);
              ctx.lineTo(-sparkleSize / 6, sparkleSize / 6);
              ctx.lineTo(-sparkleSize, 0);
              ctx.lineTo(-sparkleSize / 6, -sparkleSize / 6);
              ctx.closePath();
              ctx.fill();
              break;
          }

          ctx.restore();
        }
      });

      // Aktualisiere Partikel-Array (entferne inaktive)
      particlesRef.current = activeParticles;

      // Explosions-Glühen (nur am Anfang)
      if (elapsed < 400) {
        const glowAlpha = (1 - elapsed / 400) * 0.25;
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 150);
        gradient.addColorStop(0, `rgba(255, 215, 0, ${glowAlpha})`);
        gradient.addColorStop(0.5, `rgba(255, 165, 0, ${glowAlpha * 0.5})`);
        gradient.addColorStop(1, `rgba(255, 69, 0, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      }

      // Weiter animieren wenn Partikel aktiv oder noch in der Glüh-Phase
      if (hasActiveParticles || elapsed < 1800) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Animation beendet
        isAnimatingRef.current = false;
        if (onComplete) {
          setTimeout(() => {
            onComplete();
          }, 100);
        }
      }
    };

    // Starte Animation
    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      isAnimatingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      particlesRef.current = [];
    };
  }, [trigger, onComplete, position]);

  if (!trigger) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
      style={{ background: 'transparent' }}
    />
  );
};

export default PartyCanvas;
