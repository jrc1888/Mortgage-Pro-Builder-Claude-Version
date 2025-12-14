
import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { Mail, Lock, Loader2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

export const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
        if (mode === 'signup') {
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });
            if (error) throw error;
            setMessage("Check your email for the confirmation link!");
        } else {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
        }
    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
  };

  // If environment variables aren't set up yet
  if (!isSupabaseConfigured()) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
            <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 shadow-xl text-center">
                 <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-100">
                    <AlertCircle size={32} />
                 </div>
                 <h2 className="text-xl font-bold text-slate-900 mb-2">Supabase Not Configured</h2>
                 <p className="text-sm text-slate-500 mb-6">
                    To enable the cloud login system, you need to create a project at <strong>supabase.com</strong> and add your <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment variables.
                 </p>
                 <div className="text-xs bg-slate-900 text-slate-300 p-4 rounded-lg text-left font-mono overflow-x-auto">
                    VITE_SUPABASE_URL=https://xyz.supabase.co<br/>
                    VITE_SUPABASE_ANON_KEY=eyJh...
                 </div>
            </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
       {/* Decorative Elements */}
       <div className="absolute top-0 left-0 w-full h-1/2 bg-slate-900 z-0"></div>
       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/20 rounded-full blur-3xl z-0"></div>

       <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl relative z-10 overflow-hidden border border-slate-200">
            <div className="bg-slate-950 p-8 text-center border-b border-slate-800">
                <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30 mx-auto mb-4">
                     <ShieldCheck size={24} className="text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">MortgagePro Cloud</h1>
                <p className="text-slate-400 text-sm mt-1">Secure Workspace Access</p>
            </div>

            <div className="p-8">
                {error && (
                    <div className="mb-6 bg-red-50 text-red-600 p-3 rounded-lg text-xs font-bold border border-red-100 flex items-center gap-2">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}
                {message && (
                    <div className="mb-6 bg-emerald-50 text-emerald-600 p-3 rounded-lg text-xs font-bold border border-emerald-100 flex items-center gap-2">
                        <ShieldCheck size={16} /> {message}
                    </div>
                )}

                <form onSubmit={handleAuth} className="space-y-5">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Mail size={16} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                            </div>
                            <input 
                                type="email" 
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 h-11 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-900 placeholder-slate-400"
                                placeholder="name@company.com"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Password</label>
                        <div className="relative group">
                             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock size={16} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                            </div>
                            <input 
                                type="password" 
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 h-11 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-900"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg shadow-indigo-200 transition-all text-sm uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : (
                            <>
                                {mode === 'signin' ? 'Sign In' : 'Create Account'} <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                    <p className="text-xs text-slate-500 font-medium">
                        {mode === 'signin' ? "Don't have an account?" : "Already have an account?"}
                    </p>
                    <button 
                        onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setMessage(null); }}
                        className="mt-2 text-indigo-600 font-bold text-xs uppercase tracking-wide hover:underline"
                    >
                        {mode === 'signin' ? "Create an account" : "Sign in to existing account"}
                    </button>
                </div>
            </div>
       </div>
    </div>
  );
};
