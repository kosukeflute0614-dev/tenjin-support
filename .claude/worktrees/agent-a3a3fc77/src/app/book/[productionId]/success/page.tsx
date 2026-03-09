'use client';

import { useEffect, useState, use } from 'react';
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import Link from 'next/link';

export default function BookSuccessPage({ params }: { params: Promise<{ productionId: string }> }) {
    const { productionId } = use(params);
    const [title, setTitle] = useState<string | null>(null);

    useEffect(() => {
        const fetchTitle = async () => {
            try {
                const docRef = doc(db, "productions", productionId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setTitle(docSnap.data().title);
                }
            } catch (error) {
                console.error("Error fetching production title on success page:", error);
            }
        };
        fetchTitle();
    }, [productionId]);

    return (
        <div className="container" style={{ maxWidth: '600px', textAlign: 'center', paddingTop: '5rem' }}>
            <div className="card" style={{ padding: '4rem 2rem', borderTop: '4px solid var(--primary)' }}>
                <div style={{ color: 'var(--primary)', fontSize: '5rem', marginBottom: '1.5rem' }}>✨</div>
                <h2 className="heading-lg" style={{ marginBottom: '1.5rem' }}>ご予約ありがとうございます</h2>
                <p style={{ color: 'var(--text-muted)', lineHeight: '1.8', marginBottom: '2rem' }}>
                    「{title || '公演'}」へのご予約を承りました。<br />
                    ご入力いただいたメールアドレスへ内容の確認メールを送信しております。<br />
                    当日、劇場でお会いできることを心より楽しみにしております。
                </p>
                <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '2rem' }}>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>※メールが届かない場合は、お手数ですが劇団までお問い合わせください。</p>
                </div>
            </div>
        </div>
    );
}
