import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, ArrowLeft, Search, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Floating particle component
function Particle({ x, y, delay, size }: { x: string; y: string; delay: number; size: number }) {
  return (
    <motion.div
      className="absolute rounded-full bg-primary/20"
      style={{ left: x, top: y, width: size, height: size }}
      animate={{
        y: [0, -20, 0],
        opacity: [0.3, 0.8, 0.3],
        scale: [1, 1.2, 1],
      }}
      transition={{
        duration: 3 + delay,
        repeat: Infinity,
        ease: 'easeInOut',
        delay,
      }}
    />
  );
}

const particles = [
  { x: '10%', y: '20%', delay: 0, size: 8 },
  { x: '80%', y: '15%', delay: 0.5, size: 6 },
  { x: '20%', y: '70%', delay: 1, size: 10 },
  { x: '70%', y: '60%', delay: 1.5, size: 7 },
  { x: '50%', y: '85%', delay: 0.8, size: 5 },
  { x: '90%', y: '40%', delay: 2, size: 9 },
  { x: '5%', y: '50%', delay: 1.2, size: 6 },
  { x: '60%', y: '10%', delay: 0.3, size: 8 },
];

// Animated SVG illustration — a lonely satellite in space
function SpaceIllustration() {
  return (
    <div className="relative w-64 h-64 mx-auto mb-8">
      {/* Orbit ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute inset-4 rounded-full border border-primary/10"
        animate={{ rotate: -360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      />

      {/* Central planet */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 35%, hsl(var(--primary)), hsl(var(--primary) / 0.4))',
          boxShadow: '0 0 40px hsl(var(--primary) / 0.4), inset -4px -4px 12px rgba(0,0,0,0.3)',
        }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Planet ring */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-4 rounded-full border-2 border-primary/30"
          style={{ transform: 'translate(-50%, -50%) rotateX(75deg)' }}
        />
      </motion.div>

      {/* Orbiting satellite */}
      <motion.div
        className="absolute top-1/2 left-1/2"
        style={{ transformOrigin: '-88px -4px' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      >
        <motion.div
          className="w-8 h-8 rounded-lg bg-card border border-border shadow-lg flex items-center justify-center -translate-x-2 -translate-y-2"
          animate={{ rotate: -360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        >
          <Wifi className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </motion.div>

      {/* Stars */}
      {[
        { cx: '15%', cy: '15%' }, { cx: '82%', cy: '25%' },
        { cx: '25%', cy: '80%' }, { cx: '75%', cy: '78%' },
        { cx: '92%', cy: '60%' }, { cx: '8%', cy: '55%' },
      ].map((s, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-primary"
          style={{ left: s.cx, top: s.cy }}
          animate={{ opacity: [0, 1, 0], scale: [0.5, 1.5, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.3, ease: 'easeInOut' }}
        />
      ))}

      {/* Big "404" glowing text behind the planet */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.span
          className="text-8xl font-black select-none"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--primary) / 0.15))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'blur(1px)',
          }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          404
        </motion.span>
      </div>
    </div>
  );
}

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden">
      {/* Ambient gradient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ background: 'hsl(var(--primary))' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full opacity-8 blur-3xl"
          style={{ background: 'hsl(var(--primary) / 0.6)' }}
        />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map((p, i) => (
          <Particle key={i} {...p} />
        ))}
      </div>

      {/* Main content card */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        className="relative z-10 text-center px-8 py-12 max-w-md w-full mx-4"
      >
        <SpaceIllustration />

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <h1 className="text-5xl font-black tracking-tight mb-2"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--foreground)), hsl(var(--primary)))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
            Lost in Space
          </h1>
          <p className="text-muted-foreground text-base mb-2">
            The page <code className="text-primary font-mono text-sm bg-primary/10 px-1.5 py-0.5 rounded">
              {location.pathname}
            </code> doesn't exist.
          </p>
          <p className="text-muted-foreground text-sm mb-8">
            Our satellite couldn't find what you were looking for. Let's bring you back to mission control.
          </p>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="flex gap-3 justify-center flex-wrap"
        >
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
          <Button
            onClick={() => navigate('/')}
            className="gap-2 gradient-primary text-primary-foreground hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-glow"
          >
            <Home className="w-4 h-4" />
            Mission Control
          </Button>
        </motion.div>

        {/* Quick nav suggestions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 pt-6 border-t border-border"
        >
          <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1 justify-center">
            <Search className="w-3 h-3" />
            Quick navigation
          </p>
          <div className="flex gap-2 flex-wrap justify-center">
            {[
              { label: 'Dashboard', path: '/' },
              { label: 'Datasets', path: '/datasets' },
              { label: 'AI Chat', path: '/ask-data' },
              { label: 'Settings', path: '/settings' },
            ].map(({ label, path }) => (
              <motion.button
                key={path}
                onClick={() => navigate(path)}
                className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary border border-border transition-all duration-200"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {label}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default NotFound;
