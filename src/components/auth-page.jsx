import { useState } from 'react';
import { supabase } from '../supabaseClient';

function AuthLayout({ eyebrow, title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f1115] p-6 text-white">
      <div className="w-full max-w-md rounded-[32px] border border-[#2a2f3a] bg-white/[0.04] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.35em] text-[#a1a1aa]">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-[#a1a1aa]">{subtitle}</p>
        <div className="mt-8">{children}</div>
        <div className="mt-6 text-sm text-[#a1a1aa]">{footer}</div>
      </div>
    </div>
  );
}

const inputClassName =
  'w-full rounded-2xl border border-[#3a404d] bg-[#11141a] px-4 py-3 text-sm text-white outline-none transition duration-200 placeholder:text-[#6b7280] focus:border-[#5d6678]';

export function LoginPage({ onNavigate, onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      if (data.session) {
        onAuthenticated();
      }
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel entrar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Login"
      title="Entre no Workspace"
      subtitle="Use seu e-mail e senha para acessar o painel."
      footer={
        <button
          type="button"
          onClick={() => onNavigate('/cadastro')}
          className="font-medium text-white transition duration-200 hover:text-[#d4d4d8]"
        >
          Criar conta
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="E-mail"
          className={inputClassName}
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha"
          className={inputClassName}
          required
        />

        {error ? <p className="text-sm text-[#f4c7cf]">{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl border border-[#3a404d] bg-[#20232a] px-4 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-[#2f3542] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </AuthLayout>
  );
}

export function CadastroPage({ onNavigate, onAuthenticated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('As senhas nao coincidem.');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data.session) {
        onAuthenticated();
        return;
      }

      setSuccess('Conta criada. Verifique seu e-mail para confirmar o acesso, se necessario.');
    } catch (submitError) {
      setError(submitError.message || 'Nao foi possivel criar a conta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Cadastro"
      title="Crie sua conta"
      subtitle="Configure seu acesso para usar o Workspace."
      footer={
        <button
          type="button"
          onClick={() => onNavigate('/login')}
          className="font-medium text-white transition duration-200 hover:text-[#d4d4d8]"
        >
          Voltar para login
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nome"
          className={inputClassName}
          required
        />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="E-mail"
          className={inputClassName}
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha"
          className={inputClassName}
          required
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirmar senha"
          className={inputClassName}
          required
        />

        {error ? <p className="text-sm text-[#f4c7cf]">{error}</p> : null}
        {success ? <p className="text-sm text-[#d4d4d8]">{success}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-2xl border border-[#3a404d] bg-[#20232a] px-4 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-[#2f3542] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Criando conta...' : 'Criar conta'}
        </button>
      </form>
    </AuthLayout>
  );
}
