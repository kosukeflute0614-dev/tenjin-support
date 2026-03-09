'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc, updateDoc, query, where, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { serializeDoc } from '@/lib/firestore-utils';
import { Production } from '@/types';
import SurveyBuilder, { SurveyQuestion } from '@/components/SurveyBuilder';
import SurveyQRSection from '@/components/SurveyQRSection';
import SurveyReportTab from '@/components/SurveyReportTab';
import PrintLayoutEditor from '@/components/PrintLayoutEditor';

interface SurveyTemplate {
    id: string;
    productionId: string;
    userId: string;
    title: string;
    status: 'draft' | 'active' | 'closed';
    questions: SurveyQuestion[];
    createdAt: any;
    updatedAt: any;
}

interface SurveyResponse {
    id: string;
    surveyTemplateId: string;
    productionId: string;
    answers: Record<string, any>;
    submittedAt: any;
}

type TabKey = 'report' | 'builder' | 'share';

export default function SurveyHubPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading } = useAuth();
    const [production, setProduction] = useState<Production | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
    const [editingTemplate, setEditingTemplate] = useState<SurveyTemplate | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>('builder');
    const [responses, setResponses] = useState<SurveyResponse[]>([]);
    const [showPrintEditor, setShowPrintEditor] = useState(false);
    const [troupeName, setTroupeName] = useState<string>('');
    const [isDirty, setIsDirty] = useState(false);

    useUnsavedChanges(isDirty);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // 公演情報 + 既存テンプレートの取得
    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            try {
                const docRef = doc(db, 'productions', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = serializeDoc<Production>(docSnap);
                    if (data.userId === user.uid) {
                        setProduction(data);

                        // 劇団名の取得
                        if (data.troupeId) {
                            const tSnap = await getDoc(doc(db, 'troupes', data.troupeId));
                            if (tSnap.exists()) {
                                setTroupeName(tSnap.data().name || '');
                            }
                        } else {
                            // Legacy: User document から取得
                            const uSnap = await getDoc(doc(db, 'users', data.userId));
                            if (uSnap.exists()) {
                                setTroupeName(uSnap.data().troupeName || '');
                            }
                        }

                        const q = query(
                            collection(db, 'surveyTemplates'),
                            where('productionId', '==', data.id),
                            where('userId', '==', user.uid)
                        );
                        const snap = await getDocs(q);
                        const items = snap.docs.map(d => {
                            const t = { id: d.id, ...d.data() } as SurveyTemplate;
                            t.questions.sort((a, b) => {
                                if (a.type === 'newsletter_optin') return 1;
                                if (b.type === 'newsletter_optin') return -1;
                                return a.order - b.order;
                            });
                            return t;
                        });
                        setTemplates(items);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (!loading && user) {
            fetchData();
        } else if (!loading) {
            setIsLoading(false);
        }
    }, [id, user, loading]);

    // リアルタイム回答ストリーム (onSnapshot)
    useEffect(() => {
        if (!user || templates.length === 0) return;
        const templateIds = templates.map(t => t.id);
        // Firestore 'in' は最大30件まで
        const q = query(
            collection(db, 'surveyResponses'),
            where('surveyTemplateId', 'in', templateIds.slice(0, 30))
        );
        const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as SurveyResponse));
            setResponses(items);
        }, (err) => {
            console.error('Response stream error:', err);
        });
        return () => unsub();
    }, [user, templates]);

    const handleInitializeSurvey = async () => {
        if (!user || !production) return;
        setIsCreating(true);
        try {
            const newTemplate: Omit<SurveyTemplate, 'id'> = {
                productionId: production.id,
                userId: user.uid,
                title: `${production.title} アンケート`,
                status: 'draft',
                questions: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, 'surveyTemplates'), newTemplate);
            const created: SurveyTemplate = {
                ...newTemplate,
                id: docRef.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            setTemplates(prev => [...prev, created]);
            setEditingTemplate(created);
        } catch (error) {
            console.error('Failed to create survey template:', error);
            showToast('アンケートの作成に失敗しました', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleQuestionsChange = (questions: SurveyQuestion[]) => {
        if (!editingTemplate) return;
        setEditingTemplate({ ...editingTemplate, questions });
        setIsDirty(true);
    };

    const handleSaveQuestions = async () => {
        if (!editingTemplate) return;
        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'surveyTemplates', editingTemplate.id), {
                questions: editingTemplate.questions,
                updatedAt: serverTimestamp()
            });
            setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? editingTemplate : t));
            setIsDirty(false);
            showToast('✅ 設問を保存しました');
        } catch (error) {
            console.error('Failed to save questions:', error);
            showToast('保存に失敗しました', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading || isLoading) {
        return <div className="flex-center" style={{ height: '50vh' }}>読み込み中...</div>;
    }

    if (!user || !production) {
        return (
            <div className="container" style={{ textAlign: 'center', padding: '4rem' }}>
                <h2 className="heading-md">ページが見つかりません</h2>
                <Link href="/dashboard" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>ダッシュボードに戻る</Link>
            </div>
        );
    }

    // ── 印刷レイアウトエディタ（フルスクリーン） ──
    if (showPrintEditor && templates.length > 0 && production) {
        const tpl = templates[0];
        return (
            <PrintLayoutEditor
                questions={tpl.questions}
                templateTitle={production.title}
                templateId={tpl.id}
                productionId={tpl.productionId}
                troupeName={troupeName}
                onBack={() => setShowPrintEditor(false)}
            />
        );
    }

    // ── ビルダー編集モード (フルスクリーン) ──
    if (editingTemplate) {
        return (
            <div className="container" style={{ maxWidth: '1000px' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <button
                        onClick={() => {
                            if (isDirty && !window.confirm('変更が保存されていません。管理ハブに戻ってもよろしいですか？')) return;
                            setIsDirty(false);
                            setEditingTemplate(null);
                        }}
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}
                    >
                        <span>&larr;</span> 管理ハブに戻る
                    </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ flex: '1 1 200px' }}>
                        <h2 className="heading-lg" style={{ marginBottom: '0.3rem' }}>アンケート・ビルダー</h2>
                        <p className="text-muted" style={{ fontSize: '0.85rem' }}>{editingTemplate.title}</p>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleSaveQuestions}
                        disabled={isSaving}
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        {isSaving ? '保存中...' : '💾 設問を保存'}
                    </button>
                </div>

                <SurveyBuilder
                    questions={editingTemplate.questions}
                    onChange={handleQuestionsChange}
                />

                <Toast toast={toast} />
            </div>
        );
    }

    // テンプレートが未作成
    if (templates.length === 0) {
        return (
            <div className="container" style={{ maxWidth: '1000px' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                        <span>&larr;</span> ダッシュボードに戻る
                    </Link>
                </div>
                <PageHeader title={production.title} />
                <div className="card" style={{ padding: '3rem', textAlign: 'center', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
                    <h3 className="heading-md" style={{ marginBottom: '0.5rem' }}>まだアンケートがありません</h3>
                    <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                        アンケートを作成して、観客からの声を集めましょう。
                    </p>
                    <button className="btn btn-primary" onClick={handleInitializeSurvey} disabled={isCreating}>
                        {isCreating ? '作成中...' : '＋ アンケートを初期化する'}
                    </button>
                </div>
            </div>
        );
    }

    const currentTemplate = templates[0]; // 現在は公演あたり1テンプレート想定
    const surveyUrl = typeof window !== 'undefined' ? `${window.location.origin}/book/${id}/survey` : `/book/${id}/survey`;

    const tabs: { key: TabKey; label: string; icon: string }[] = [
        { key: 'builder', label: '作成・編集', icon: '🛠️' },
        { key: 'share', label: '共有・印刷', icon: '📱' },
        { key: 'report', label: 'レポート', icon: '📊' },
    ];

    // ── 3タブ構成 メインUI ──
    return (
        <div className="container" style={{ maxWidth: '1000px' }}>
            <div style={{ marginBottom: '1.25rem' }}>
                <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                    <span>&larr;</span> ダッシュボードに戻る
                </Link>
            </div>
            <PageHeader title={production.title} />

            {/* テンプレート情報バー */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '1rem', padding: '0.75rem 1rem',
                backgroundColor: 'var(--card-bg)', borderRadius: '10px',
                border: '1px solid var(--card-border)',
                flexWrap: 'wrap', gap: '0.5rem',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 200px', minWidth: 0 }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTemplate.title}</span>
                    <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold',
                        backgroundColor: currentTemplate.status === 'active' ? '#dcfce7' : '#f3f4f6',
                        color: currentTemplate.status === 'active' ? '#166534' : '#6b7280',
                    }}>
                        {currentTemplate.status === 'active' ? '公開中' : currentTemplate.status === 'draft' ? '下書き' : '終了'}
                    </span>
                </div>
                <button
                    className="btn btn-secondary"
                    onClick={async () => {
                        const newStatus = currentTemplate.status === 'active' ? 'draft' : 'active';
                        await updateDoc(doc(db, 'surveyTemplates', currentTemplate.id), { status: newStatus, updatedAt: serverTimestamp() });
                        setTemplates(prev => prev.map(t => t.id === currentTemplate.id ? { ...t, status: newStatus as any } : t));
                        showToast(newStatus === 'active' ? '🌐 アンケートを公開しました' : '📝 下書きに戻しました');
                    }}
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem' }}
                >
                    {currentTemplate.status === 'active' ? '⏸ 非公開にする' : '🌐 公開する'}
                </button>
            </div>

            {/* タブナビゲーション */}
            <div style={{
                display: 'flex', gap: '0.25rem', marginBottom: '1.5rem',
                backgroundColor: '#f3f4f6', borderRadius: '10px', padding: '4px',
            }}>
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => {
                            if (isDirty && activeTab === 'builder' && tab.key !== 'builder') {
                                if (!window.confirm('変更が保存されていません。このタブを離れてもよろしいですか？')) return;
                                setIsDirty(false);
                            }
                            setActiveTab(tab.key);
                        }}
                        style={{
                            flex: 1, padding: '0.7rem 0.5rem',
                            borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontSize: '0.85rem', fontWeight: activeTab === tab.key ? 'bold' : 'normal',
                            backgroundColor: activeTab === tab.key ? 'var(--card-bg)' : 'transparent',
                            color: activeTab === tab.key ? 'var(--text)' : 'var(--text-muted)',
                            boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.2s',
                        }}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* タブコンテンツ */}
            {activeTab === 'report' && (
                <SurveyReportTab
                    responses={responses}
                    template={currentTemplate}
                />
            )}
            {activeTab === 'builder' && (
                <BuilderTab
                    template={currentTemplate}
                    onOpenBuilder={() => setEditingTemplate(currentTemplate)}
                    onOpenPrintEditor={() => setShowPrintEditor(true)}
                />
            )}
            {activeTab === 'share' && (
                <ShareTab
                    template={currentTemplate}
                    surveyUrl={surveyUrl}
                    productionTitle={production.title}
                    onCopy={() => showToast('📋 URLをコピーしました')}
                />
            )}

            <Toast toast={toast} />
        </div>
    );
}


/* =========================================
   ── 作成・編集タブ ──
   ========================================= */

function BuilderTab({ template, onOpenBuilder, onOpenPrintEditor }: {
    template: SurveyTemplate;
    onOpenBuilder: () => void;
    onOpenPrintEditor: () => void;
}) {
    return (
        <div className="card" style={{ padding: '2rem', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ flex: '1 1 200px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>設問の管理</h3>
                    <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        設問数: {template.questions.length}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={onOpenBuilder} style={{ fontSize: '0.9rem' }}>
                        🛠️ ビルダーを開く
                    </button>
                    <button
                        onClick={onOpenPrintEditor}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.5rem 1rem', borderRadius: '8px',
                            border: '1px solid #d1d5db', backgroundColor: 'var(--secondary)',
                            color: '#374151', fontSize: '0.85rem', cursor: 'pointer',
                            fontWeight: '500', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f3f4f6'; e.currentTarget.style.borderColor = '#9ca3af'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; e.currentTarget.style.borderColor = '#d1d5db'; }}
                    >
                        🖨️ 印刷レイアウト
                    </button>
                </div>
            </div>

            {/* 設問一覧プレビュー */}
            {template.questions.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {template.questions
                        .sort((a, b) => a.order - b.order)
                        .map((q, i) => (
                            <div key={q.id} style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.6rem 0.8rem', borderRadius: '6px',
                                backgroundColor: 'var(--secondary)', fontSize: '0.85rem',
                            }}>
                                <span style={{
                                    width: '22px', height: '22px', borderRadius: '50%',
                                    backgroundColor: 'var(--primary)', color: '#fff',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.7rem', fontWeight: 'bold', flexShrink: 0,
                                }}>
                                    {i + 1}
                                </span>
                                <span style={{ flex: 1 }}>{q.label}</span>
                                <span style={{
                                    fontSize: '0.7rem', color: 'var(--text-muted)',
                                    padding: '1px 6px', borderRadius: '3px', backgroundColor: 'var(--secondary)',
                                }}>
                                    {typeLabel(q.type)}
                                </span>
                            </div>
                        ))}
                </div>
            ) : (
                <p className="text-muted" style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: '0.9rem' }}>
                    まだ設問がありません。ビルダーから追加しましょう。
                </p>
            )}
        </div>
    );
}

function typeLabel(type: string): string {
    const map: Record<string, string> = {
        single_choice: '単一選択',
        multi_choice: '複数選択',
        free_text: '自由記述',
        rating_scale: '5段階評価',
        newsletter_optin: 'メルマガ',
    };
    return map[type] || type;
}

/* =========================================
   ── 共有・印刷タブ ──
   ========================================= */

function ShareTab({ template, surveyUrl, productionTitle, onCopy }: {
    template: SurveyTemplate;
    surveyUrl: string;
    productionTitle: string;
    onCopy: () => void;
}) {
    if (template.status !== 'active') {
        return (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
                <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</p>
                <h3 className="heading-md" style={{ marginBottom: '0.5rem' }}>アンケートが非公開です</h3>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                    QRコードを利用するには、まずアンケートを公開してください。
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            <SurveyQRSection
                url={surveyUrl}
                productionTitle={productionTitle}
                onCopy={onCopy}
            />

            {/* 印刷用PDFダウンロード（プレースホルダ） */}
            <div style={{
                padding: '1.5rem', backgroundColor: 'var(--card-bg)',
                borderRadius: '8px', border: '1px dashed #d1d5db',
            }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🖨️</span> 印刷用アンケートPDF
                </h4>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem', lineHeight: '1.6' }}>
                    印刷レイアウトエディタで作成したデザインを、高精度なPDFとしてダウンロードできます。
                </p>
                <button
                    disabled
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 1.2rem', borderRadius: '8px',
                        border: '1px solid var(--card-border)', backgroundColor: 'var(--secondary)',
                        color: '#9ca3af', fontSize: '0.85rem', cursor: 'not-allowed',
                    }}
                >
                    📄 PDFをダウンロード（準備中）
                </button>
            </div>
        </div>
    );
}

/* =========================================
   ── 共通サブコンポーネント ──
   ========================================= */

function BackLink() {
    return (
        <div style={{ marginBottom: '1.25rem' }}>
            <Link href="/dashboard" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                <span>&larr;</span> ダッシュボードに戻る
            </Link>
        </div>
    );
}

function PageHeader({ title }: { title: string }) {
    return (
        <div style={{ marginBottom: '1.5rem' }}>
            <h2 className="heading-lg" style={{ marginBottom: '0.5rem' }}>アンケート管理</h2>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>{title} — アンケートの作成・配布・集計を管理します。</p>
        </div>
    );
}

function Toast({ toast }: { toast: { message: string; type: 'success' | 'error' } | null }) {
    if (!toast) return null;
    return (
        <>
            <div style={{
                position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
                padding: '0.8rem 1.5rem', borderRadius: '12px', zIndex: 100,
                backgroundColor: toast.type === 'success' ? '#1a1a2e' : '#e53e3e',
                color: '#fff', fontSize: '0.9rem', fontWeight: '600',
                boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
                animation: 'toastIn 0.3s ease'
            }}>
                {toast.message}
            </div>
            <style jsx>{`
                @keyframes toastIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>
        </>
    );
}
