import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './state/auth-context';
import { DashboardProvider } from './state/dashboard-context';
import { isSupabaseConfigured } from './supabaseClient';

const application = isSupabaseConfigured ? (
  <React.StrictMode>
    <AuthProvider>
      <DashboardProvider>
        <App />
      </DashboardProvider>
    </AuthProvider>
  </React.StrictMode>
) : (
  <main className="flex min-h-screen items-center justify-center bg-[#0f1115] p-6 text-white">
    <section className="w-full max-w-xl rounded-3xl border border-[#5b3c26] bg-[#241a13] p-6 shadow-2xl sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#e8b77f]">Configuração necessária</p>
      <h1 className="mt-3 text-2xl font-semibold">Supabase não configurado</h1>
      <p className="mt-4 text-sm leading-6 text-[#d7c7bb]">
        Cadastre as variáveis <strong>VITE_SUPABASE_URL</strong> e <strong>VITE_SUPABASE_ANON_KEY</strong> no
        ambiente de hospedagem e faça um novo deploy.
      </p>
    </section>
  </main>
);

ReactDOM.createRoot(document.getElementById('root')).render(application);
