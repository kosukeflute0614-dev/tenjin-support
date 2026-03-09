'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export default function LandingPage() {
  const { user, profile, loading, isNewUser, loginWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      if (isNewUser) {
        router.push('/onboarding');
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, profile, loading, isNewUser, router]);

  if (loading) {
    return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
  }

  return (
    <div className="container" style={{
      textAlign: 'center',
      padding: '10vh 2rem',
      animation: 'fadeIn 1s ease-out'
    }}>
      <div style={{ marginBottom: '4rem' }}>
        <div style={{ fontSize: '5rem', marginBottom: '1.5rem', display: 'inline-block' }}>🎭</div>
        <h1 className="heading-lg" style={{
          fontSize: '2.5rem',
          fontWeight: '200',
          letterSpacing: '0.15em',
          marginBottom: '1rem'
        }}>
          Tenjin-Support
        </h1>
        <p className="text-muted" style={{ fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto', lineHeight: '1.8' }}>
          演劇制作の、その先へ。<br />
          シンプルで、美しく、迷いのない予約管理体験を。
        </p>
      </div>

      <div style={{
        padding: '3rem',
        backgroundColor: 'var(--card-bg)',
        borderRadius: 'var(--border-radius)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.05)',
        display: 'inline-block',
        minWidth: '320px'
      }}>
        <h2 className="heading-md" style={{ marginBottom: '2rem', fontWeight: '400' }}>制作者ログイン</h2>

        <button
          onClick={loginWithGoogle}
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '1rem 2rem',
            fontSize: '1.05rem',
            borderRadius: '12px'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#ffffff" d="M17.64 8.2v3.6c0 .5-.4.9-.9.9h-8.5v-3.6h5.8c-.2-1.1-.9-2-1.8-2.6v-2c1.3.6 2.4 1.6 3 2.9.2.3.3.6.4.8z" />
            <path fill="#ffffff" d="M9.1 18c-2.4 0-4.6-.9-6.3-2.5l2.1-1.6c1.1.7 2.6 1.2 4.2 1.2 3.1 0 5.8-2.1 6.7-4.9h3.7c-1 5.3-5.5 9-10.4 9z" />
            <path fill="#ffffff" d="M2.8 15.5c-1.8-1.6-2.8-3.9-2.8-6.4 0-2.5 1-4.8 2.8-6.4l2.1 1.6C4.1 5.3 3.6 6.8 3.6 9.1c0 2.3.5 3.8 1.3 4.8l-2.1 1.6z" />
            <path fill="#ffffff" d="M9.1 3.6c1.6 0 3.1.5 4.2 1.2l2.1-1.6C13.7.9 11.5 0 9.1 0 4.2 0 .5 3.7 0 8.2l3.7 0c.9-2.8 3.6-4.6 5.4-4.6z" />
          </svg>
          Google でログイン
        </button>

        <p className="text-muted" style={{ marginTop: '1.5rem', fontSize: '0.8rem' }}>
          ※劇団・団体代表者としてのアカウントを作成します。
        </p>
      </div>

      <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
    </div>
  );
}
