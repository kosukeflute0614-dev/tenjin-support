'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

const faqItems = [
    {
        q: "利用料金はかかりますか？",
        a: "現在はベータ版として、すべての機能を無料でご利用いただけます。将来的に有料プランを導入する場合も、事前に十分な告知を行います。"
    },
    {
        q: "商用利用は可能ですか？",
        a: "はい、劇団やプロデュース公演の有料チケット販売・予約管理に自由にご利用いただけます。"
    },
    {
        q: "当日券のみの管理もできますか？",
        a: "はい、事前予約なしの当日券のみの受付管理としてもご利用可能です。「当日受付」画面から簡単に発行できます。"
    },
    {
        q: "推奨ブラウザを教えてください。",
        a: "Google Chrome, Safari, Microsoft Edge の最新版を推奨しています。"
    }
];

export default function FaqPage() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <div className="container" style={{ padding: '4rem 2rem', maxWidth: '800px', margin: '0 auto' }}>
            <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
                <h1 className="heading-lg" style={{ fontSize: '2.5rem', marginBottom: '1rem', fontWeight: '200' }}>
                    よくある質問
                </h1>
                <p className="text-muted" style={{ fontSize: '1.1rem' }}>
                    Tenjin-Support について、よくいただくご質問とその回答をまとめました。
                </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {faqItems.map((item, index) => (
                    <div key={index} style={{
                        border: '1px solid #eee',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        backgroundColor: openIndex === index ? '#fcfcfc' : 'white',
                        transition: 'all 0.2s ease'
                    }}>
                        <button
                            onClick={() => setOpenIndex(openIndex === index ? null : index)}
                            style={{
                                width: '100%',
                                padding: '1.5rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontWeight: '600',
                                color: 'var(--text-main)',
                                fontSize: '1.1rem'
                            }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <HelpCircle size={20} color="var(--primary)" />
                                {item.q}
                            </span>
                            {openIndex === index ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                        {openIndex === index && (
                            <div style={{
                                padding: '0 1.5rem 1.5rem 4rem',
                                lineHeight: '1.8',
                                color: '#555'
                            }}>
                                {item.a}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: '5rem', color: 'var(--text-muted)' }}>
                <p>解決しない場合は、公式SNS等からお気軽にお問い合わせください。</p>
            </div>
        </div>
    );
}
