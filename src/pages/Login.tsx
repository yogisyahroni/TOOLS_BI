import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn, Database, Fingerprint, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { haptics } from '@/lib/mobile';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login, loginWithBiometrics, isAuthenticated, isBiometricSupported, isBiometricEnrolled } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    // Redirect to dashboard if already logged in
    useEffect(() => {
        if (isAuthenticated) {
            navigate('/');
        }
    }, [isAuthenticated, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            toast({ title: 'Validation error', description: 'Email and password are required.', variant: 'destructive' });
            return;
        }
        setIsSubmitting(true);
        try {
            await login(email, password);
            toast({ title: 'Welcome back!', description: 'You have successfully signed in.' });
            navigate('/');
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Login failed. Check your credentials.';
            toast({ title: 'Sign in failed', description: msg, variant: 'destructive' });
            haptics.notification('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBiometricLogin = async () => {
        setIsSubmitting(true);
        try {
            await haptics.impact();
            await loginWithBiometrics();
            toast({ title: 'Welcome back!', description: 'Authenticated with biometrics.' });
            navigate('/');
        } catch (err: any) {
            toast({ 
                title: 'Biometric failed', 
                description: err.message || 'Could not authenticate with biometrics.',
                variant: 'destructive' 
            });
            haptics.notification('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md"
            >
                {/* Logo */}
                <div className="flex items-center gap-3 mb-8 justify-center">
                    <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
                        <Database className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">NeuraDash</h1>
                        <p className="text-sm text-muted-foreground">BI Platform</p>
                    </div>
                </div>

                <div className="bg-card rounded-2xl p-8 border border-border shadow-card">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-foreground">Sign in</h2>
                        <p className="text-muted-foreground mt-1">Enter your credentials to access your workspace</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => setShowPassword((v) => !v)}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-end">
                            <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                                Forgot password?
                            </Link>
                        </div>

                        <div className="flex flex-col gap-3">
                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                                        Signing in…
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <LogIn className="w-4 h-4" />
                                        Sign in
                                    </span>
                                )}
                            </Button>

                            {isBiometricSupported && isBiometricEnrolled && (
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    className="w-full flex items-center gap-2"
                                    onClick={handleBiometricLogin}
                                    disabled={isSubmitting}
                                >
                                    <Fingerprint className="w-4 h-4" />
                                    Sign in with Biometrics
                                </Button>
                            )}
                        </div>
                    </form>

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Don't have an account?{' '}
                        <Link to="/register" className="text-primary hover:underline font-medium">
                            Sign up
                        </Link>
                    </p>
                </div>
                
                {isBiometricSupported && !isBiometricEnrolled && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-3"
                    >
                        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Biometric authentication is available. Sign in once with your password to enable it for faster access next time.
                        </p>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
}

