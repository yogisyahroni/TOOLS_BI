import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, Database, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function Register() {
    const [displayName, setDisplayName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { register, login, isLoading } = useAuthStore();
    const navigate = useNavigate();
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!displayName || !email || !password) {
            toast({ title: 'Validation error', description: 'All fields are required.', variant: 'destructive' });
            return;
        }
        if (password.length < 8) {
            toast({ title: 'Validation error', description: 'Password must be at least 8 characters.', variant: 'destructive' });
            return;
        }
        try {
            await register(email, password, displayName);
            toast({ title: 'Account created!', description: 'Signing you in…' });
            // Auto-login after register
            await login(email, password);
            navigate('/');
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Registration failed. Please try again.';
            toast({ title: 'Sign up failed', description: msg, variant: 'destructive' });
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
                <div className="flex items-center gap-3 mb-8 justify-center">
                    <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
                        <Database className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">DataLens</h1>
                        <p className="text-sm text-muted-foreground">BI Platform</p>
                    </div>
                </div>

                <div className="bg-card rounded-2xl p-8 border border-border shadow-card">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-foreground">Create account</h2>
                        <p className="text-muted-foreground mt-1">Start your 14-day free trial, no credit card required</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="displayName">Full Name</Label>
                            <Input
                                id="displayName"
                                type="text"
                                placeholder="Your name"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                autoComplete="name"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="reg-email">Email</Label>
                            <Input
                                id="reg-email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="reg-password">Password</Label>
                            <div className="relative">
                                <Input
                                    id="reg-password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Min 8 characters"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="new-password"
                                    minLength={8}
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

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                                    Creating account…
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <UserPlus className="w-4 h-4" />
                                    Create account
                                </span>
                            )}
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Already have an account?{' '}
                        <Link to="/login" className="text-primary hover:underline font-medium">
                            Sign in
                        </Link>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
