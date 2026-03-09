'use client';

import React, { useState } from 'react';
import { Mail, Send, User, MessageSquare } from 'lucide-react';

export default function ContactPage() {
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
    };

    if (submitted) {
        return (
            <div className="container" style={{ padding: '8rem 2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>✉️</div>
                <h1 className="heading-lg" style={{ marginBottom: '1rem' }}>お問い合わせありがとうございます</h1>
                <p className="text-muted" style={{ fontSize: '1.1rem', marginBottom: '2rem' }}>
                    メッセージを受領いたしました。内容を確認の上、担当者より折り返しご連絡させていただきます。
                </p>
                <button onClick={() => setSubmitted(false)} className="btn btn-secondary">
                    トップへ戻る
                </button>
            </div>
        );
    }

    return (
        <div className="container" style={{ padding: '4rem 2rem', maxWidth: '800px', margin: '0 auto' }}>
            <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
                <h1 className="heading-lg" style={{ fontSize: '2.5rem', marginBottom: '1rem', fontWeight: '200' }}>
                    お問い合わせ
                </h1>
                <p className="text-muted" style={{ fontSize: '1.1rem' }}>
                    サービスの導入に関するご相談や、不具合のご報告、<br />機能のご要望など、お気軽にお寄せください。
                </p>
            </header>

            <div className="card" style={{ padding: '3rem', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.05)' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* Name */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#333' }}>
                            <User size={16} color="var(--primary)" />
                            お名前 / 団体名
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="例：天神 太郎 / 劇団 Tenjin"
                            style={{
                                width: '100%',
                                padding: '1rem',
                                borderRadius: '12px',
                                border: '1px solid #ddd',
                                fontSize: '1rem'
                            }}
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#333' }}>
                            <Mail size={16} color="var(--primary)" />
                            メールアドレス
                        </label>
                        <input
                            type="email"
                            required
                            placeholder="example@tenjin-support.com"
                            style={{
                                width: '100%',
                                padding: '1rem',
                                borderRadius: '12px',
                                border: '1px solid #ddd',
                                fontSize: '1rem'
                            }}
                        />
                    </div>

                    {/* Message */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#333' }}>
                            <MessageSquare size={16} color="var(--primary)" />
                            お問い合わせ内容
                        </label>
                        <textarea
                            required
                            rows={6}
                            placeholder="こちらにお問い合わせ内容をご入力ください"
                            style={{
                                width: '100%',
                                padding: '1rem',
                                borderRadius: '12px',
                                border: '1px solid #ddd',
                                fontSize: '1rem',
                                lineHeight: '1.6'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{
                            padding: '1.2rem',
                            borderRadius: '12px',
                            fontSize: '1.1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            marginTop: '1rem'
                        }}
                    >
                        <Send size={20} />
                        メッセージを送信する
                    </button>
                </form>
            </div>
        </div>
    );
}
