'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { motion } from 'framer-motion';
import {
  Ticket, ClipboardCheck, BarChart3, Users, FileText,
  ChevronDown, ArrowRight, Check, Plus, Menu, X,
  Search, QrCode, Smartphone, Clock, Shield, UserPlus
} from 'lucide-react';
import styles from './landing.module.css';

/* ==========================================
   Animation Wrapper
   ========================================== */
function FadeIn({ children, className, delay = 0 }: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/* ==========================================
   Mock Browser Frame
   ========================================== */
function MockBrowser({ children, url }: { children: React.ReactNode; url: string }) {
  return (
    <div className={styles.browser}>
      <div className={styles.browserBar}>
        <div className={styles.browserDots}>
          <span /><span /><span />
        </div>
        <div className={styles.browserUrl}>{url}</div>
      </div>
      <div className={styles.browserContent}>
        {children}
      </div>
    </div>
  );
}

/* ==========================================
   Mock: Dashboard
   ========================================== */
function MockDashboard() {
  return (
    <>
      <div className={styles.mockHeader}>
        <span className={styles.mockTitle}>ダッシュボード</span>
        <span className={`${styles.mockBadge} ${styles.mockBadgeGreen}`}>受付中</span>
      </div>
      <div className={styles.mockStatsGrid}>
        <div className={styles.mockStatCard}>
          <div className={styles.mockStatValue}>48</div>
          <div className={styles.mockStatLabel}>総予約数</div>
        </div>
        <div className={styles.mockStatCard}>
          <div className={`${styles.mockStatValue} ${styles.mockStatAccent}`}>32<span style={{ fontSize: '0.8rem', fontWeight: 400 }}>/45</span></div>
          <div className={styles.mockStatLabel}>来場者数</div>
        </div>
        <div className={styles.mockStatCard}>
          <div className={styles.mockStatValue}>¥156K</div>
          <div className={styles.mockStatLabel}>売上合計</div>
        </div>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--foreground)' }}>3/15(土) 14:00の回 - 来場率</div>
        <div className={styles.mockProgressBar}>
          <div className={styles.mockProgressFill} style={{ width: '71%' }} />
        </div>
        <div className={styles.mockProgressLabel}>
          <span>32名 来場</span>
          <span>71%</span>
        </div>
      </div>
      <div className={styles.mockChart}>
        <div className={styles.mockChartBar} style={{ height: '60%', background: 'var(--primary)', opacity: 0.7 }}>
          <span className={styles.mockChartLabel}>3/15 14時</span>
        </div>
        <div className={styles.mockChartBar} style={{ height: '85%', background: 'var(--primary)', opacity: 0.85 }}>
          <span className={styles.mockChartLabel}>3/15 19時</span>
        </div>
        <div className={styles.mockChartBar} style={{ height: '45%', background: 'var(--primary)', opacity: 0.5 }}>
          <span className={styles.mockChartLabel}>3/16 14時</span>
        </div>
        <div className={styles.mockChartBar} style={{ height: '70%', background: 'var(--primary)', opacity: 0.65 }}>
          <span className={styles.mockChartLabel}>3/16 19時</span>
        </div>
      </div>
    </>
  );
}

/* ==========================================
   Mock: Reservation Table
   ========================================== */
function MockReservationTable() {
  const data = [
    { name: '田中 太郎', time: '3/15 14:00', type: '一般', count: 2, status: 'confirmed' },
    { name: '佐藤 花子', time: '3/15 19:00', type: '学生', count: 1, status: 'confirmed' },
    { name: '鈴木 一郎', time: '3/16 14:00', type: '一般', count: 3, status: 'confirmed' },
    { name: '高橋 美咲', time: '3/15 14:00', type: 'ペア', count: 1, status: 'pending' },
    { name: '山田 次郎', time: '3/15 19:00', type: '一般', count: 2, status: 'confirmed' },
  ];
  return (
    <>
      <div className={styles.mockHeader}>
        <span className={styles.mockTitle}>予約一覧</span>
        <span className={`${styles.mockBadge} ${styles.mockBadgeBlue}`}>5件</span>
      </div>
      <table className={styles.mockTable}>
        <thead>
          <tr>
            <th>予約者名</th>
            <th>公演回</th>
            <th>券種</th>
            <th>枚数</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{r.time}</td>
              <td>{r.type}</td>
              <td>{r.count}枚</td>
              <td>
                <span className={`${styles.mockStatusDot} ${r.status === 'confirmed' ? styles.mockStatusConfirmed : styles.mockStatusPending}`} />
                {r.status === 'confirmed' ? '確定' : '未確定'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ==========================================
   Mock: Check-in Screen
   ========================================== */
function MockCheckinScreen() {
  const items = [
    { name: '田中 太郎', detail: '一般 × 2', done: true },
    { name: '佐藤 花子', detail: '学生 × 1', done: false },
    { name: '山田 次郎', detail: '一般 × 2', done: false },
    { name: '伊藤 さくら', detail: 'ペア × 1', done: true },
  ];
  return (
    <>
      <div className={styles.mockHeader}>
        <span className={styles.mockTitle}>チェックイン</span>
        <span className={`${styles.mockBadge} ${styles.mockBadgeGreen}`}>3/15 14:00の回</span>
      </div>
      <div className={styles.mockSearchBar}>
        <Search size={14} />
        <span>予約者名で検索...</span>
      </div>
      {items.map((item, i) => (
        <div key={i} className={styles.mockCheckinItem}>
          <div>
            <div className={styles.mockCheckinName}>{item.name}</div>
            <div className={styles.mockCheckinDetail}>{item.detail}</div>
          </div>
          <div className={`${styles.mockCheckinBtn} ${item.done ? styles.mockCheckinBtnDone : styles.mockCheckinBtnAction}`}>
            {item.done ? '✓ チェックイン済' : 'チェックイン'}
          </div>
        </div>
      ))}
      <div style={{ marginTop: '0.75rem' }}>
        <div className={styles.mockProgressBar}>
          <div className={styles.mockProgressFill} style={{ width: '50%' }} />
        </div>
        <div className={styles.mockProgressLabel}>
          <span>来場: 2/4名</span>
          <span>50%</span>
        </div>
      </div>
    </>
  );
}

/* ==========================================
   LP Header
   ========================================== */
function LPHeader({ onLogin, onScrollTo }: {
  onLogin: () => void;
  onScrollTo: (id: string) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const navItems = [
    { label: '機能', id: 'features' },
    { label: '料金', id: 'pricing' },
    { label: '使い方', id: 'steps' },
    { label: 'FAQ', id: 'faq' },
  ];

  return (
    <>
      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ''}`}>
        <div className={styles.headerInner}>
          <div className={styles.headerLogo}>
            <span className={styles.headerLogoIcon}>🎭</span>
            Tenjin-Support
          </div>
          <nav className={styles.headerNav}>
            {navItems.map((item) => (
              <button
                key={item.id}
                className={styles.headerNavLink}
                onClick={() => onScrollTo(item.id)}
              >
                {item.label}
              </button>
            ))}
            <button className={styles.headerCta} onClick={onLogin}>
              無料で始める
            </button>
          </nav>
          <button className={styles.mobileMenuBtn} onClick={() => setMobileOpen(true)} aria-label="メニューを開く">
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      <div className={`${styles.mobileMenu} ${mobileOpen ? styles.mobileMenuOpen : ''}`} onClick={() => setMobileOpen(false)}>
        <div className={styles.mobileMenuPanel} onClick={(e) => e.stopPropagation()}>
          <button className={styles.mobileMenuClose} onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる">
            <X size={24} />
          </button>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={styles.mobileMenuLink}
              onClick={() => { onScrollTo(item.id); setMobileOpen(false); }}
            >
              {item.label}
            </button>
          ))}
          <button className={styles.mobileMenuCta} onClick={() => { onLogin(); setMobileOpen(false); }}>
            無料で始める
          </button>
        </div>
      </div>
    </>
  );
}

/* ==========================================
   Hero Section
   ========================================== */
function HeroSection({ onLogin, onScrollTo }: {
  onLogin: () => void;
  onScrollTo: (id: string) => void;
}) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroInner}>
        <motion.div
          className={styles.heroContent}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <div className={styles.heroBadge}>
            🎪 小劇場の制作チームのために
          </div>
          <h1 className={styles.heroTitle}>
            予約から当日受付まで、
            <br />
            <span className={styles.heroTitleAccent}>公演制作をまるごとひとつに。</span>
          </h1>
          <p className={styles.heroSub}>
            予約管理、チェックイン、来場状況の共有、売上集計、アンケートまで。
            もうスプレッドシートや紙の予約表と格闘する必要はありません。
          </p>
          <div className={styles.heroActions}>
            <button className={styles.heroCtaPrimary} onClick={onLogin}>
              無料で始める
              <ArrowRight size={20} />
            </button>
            <button className={styles.heroCtaSecondary} onClick={() => onScrollTo('features')}>
              機能を見る
              <ChevronDown size={18} />
            </button>
          </div>
          <p className={styles.heroNote}>
            ※ Googleアカウントで30秒で登録完了。1券種まで無料。
          </p>
        </motion.div>

        <motion.div
          className={styles.heroMock}
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
        >
          <MockBrowser url="tenjin-support.com/dashboard">
            <MockDashboard />
          </MockBrowser>
        </motion.div>
      </div>
    </section>
  );
}

/* ==========================================
   Pain Points Section
   ========================================== */
function PainPointsSection() {
  const pains = [
    {
      icon: <FileText size={22} />,
      title: 'ツールがバラバラで管理が大変',
      desc: '予約はGoogleフォーム、当日受付は紙のリスト、集計はスプレッドシート…。ツールを行き来するだけで疲弊する。',
    },
    {
      icon: <Users size={22} />,
      title: '受付が毎回カオスになる',
      desc: '「予約リストに名前がない」「口頭予約の伝達漏れ」——開演前の受付は毎回戦場。お客様を待たせてしまう。',
    },
    {
      icon: <BarChart3 size={22} />,
      title: '公演後の集計が苦行',
      desc: '当日精算の金額、券種ごとの売上、来場者数…。公演が終わってからの手作業集計がとにかく辛い。',
    },
    {
      icon: <Clock size={22} />,
      title: '舞台裏から客入りが見えない',
      desc: '来場状況がリアルタイムで分からず、舞台監督が何度も受付に確認しに行く。開演判断にも影響が出る。',
    },
  ];

  return (
    <section className={`${styles.section} ${styles.painSection}`}>
      <div className={styles.sectionInner}>
        <FadeIn>
          <div className={styles.sectionCenter}>
            <div className={styles.sectionLabel}>Problems</div>
            <h2 className={styles.sectionTitle}>こんなお悩み、ありませんか？</h2>
            <p className={styles.sectionSub}>
              小劇場の制作業務は、やることが多くて大変。でもそれ、ツールで解決できます。
            </p>
          </div>
        </FadeIn>
        <div className={styles.painGrid}>
          {pains.map((pain, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className={styles.painCard}>
                <div className={styles.painIcon}>{pain.icon}</div>
                <div className={styles.painContent}>
                  <h3>{pain.title}</h3>
                  <p>{pain.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ==========================================
   Features Showcase Section
   ========================================== */
function FeaturesSection() {
  return (
    <section id="features" className={`${styles.section} ${styles.featuresSection}`}>
      <div className={styles.sectionInner}>
        <FadeIn>
          <div className={styles.sectionCenter}>
            <div className={styles.sectionLabel}>Features</div>
            <h2 className={styles.sectionTitle}>Tenjin-Supportでできること</h2>
            <p className={styles.sectionSub}>
              予約受付から当日のオペレーション、公演後の振り返りまで。
              公演制作に必要な機能がすべて揃っています。
            </p>
          </div>
        </FadeIn>

        <div className={styles.featureShowcase}>
          {/* Feature 1: Reservation */}
          <FadeIn>
            <div className={styles.featureItem}>
              <div className={styles.featureText}>
                <div className={styles.featureNumber}>01</div>
                <h3 className={styles.featureTitle}>予約管理</h3>
                <p className={styles.featureDesc}>
                  公演情報を入力するだけで、予約フォームを自動生成。
                  URLをSNSやメールで共有すれば、すぐに予約受付が始まります。
                  定員管理も自動なので、オーバーブッキングの心配はありません。
                </p>
                <ul className={styles.featurePoints}>
                  <li><Check size={16} className={styles.featureCheckIcon} /> 予約フォーム自動生成</li>
                  <li><Check size={16} className={styles.featureCheckIcon} /> 定員の自動管理</li>
                  <li><Check size={16} className={styles.featureCheckIcon} /> 複数券種・複数公演回に対応</li>
                  <li><Check size={16} className={styles.featureCheckIcon} /> 予約確認メール自動送信</li>
                </ul>
              </div>
              <div className={styles.featureMock}>
                <MockBrowser url="tenjin-support.com/reservations">
                  <MockReservationTable />
                </MockBrowser>
              </div>
            </div>
          </FadeIn>

          {/* Feature 2: Check-in */}
          <FadeIn>
            <div className={`${styles.featureItem} ${styles.featureItemReverse}`}>
              <div className={styles.featureText}>
                <div className={styles.featureNumber}>02</div>
                <h3 className={styles.featureTitle}>当日受付・チェックイン</h3>
                <p className={styles.featureDesc}>
                  タブレットやスマホ1台で当日受付が完了。
                  予約者の名前を検索してワンタップでチェックイン。
                  紙の予約リストを印刷する手間はもう要りません。
                </p>
                <ul className={styles.featurePoints}>
                  <li><Check size={16} className={styles.featureCheckIcon} /> 名前検索でワンタップチェックイン</li>
                  <li><Check size={16} className={styles.featureCheckIcon} /> 当日券の追加もその場で</li>
                  <li><Check size={16} className={styles.featureCheckIcon} /> 支払い状況の管理</li>
                  <li><Check size={16} className={styles.featureCheckIcon} /> スタッフ用の簡単ログイン</li>
                </ul>
              </div>
              <div className={styles.featureMock}>
                <MockBrowser url="tenjin-support.com/checkin">
                  <MockCheckinScreen />
                </MockBrowser>
              </div>
            </div>
          </FadeIn>

          {/* Feature 3: Real-time Monitoring */}
          <FadeIn>
            <div className={styles.featureItem}>
              <div className={styles.featureText}>
                <div className={styles.featureNumber}>03</div>
                <h3 className={styles.featureTitle}>リアルタイム来場管理</h3>
                <p className={styles.featureDesc}>
                  客入りの状況がどこからでもリアルタイムで確認できます。
                  舞台監督やスタッフが受付に行かなくても、
                  スマホひとつで来場率・空席数を把握。開演判断もスムーズに。
                </p>
                <ul className={styles.featurePoints}>
                  <li><Check size={16} className={styles.featureCheckIcon} /> 来場率をリアルタイム表示</li>
                  <li><Check size={16} className={styles.featureCheckIcon} /> スマホからどこでも確認</li>
                  <li><Check size={16} className={styles.featureCheckIcon} /> 公演回ごとの集計</li>
                </ul>
              </div>
              <div className={styles.featureMock}>
                <MockBrowser url="tenjin-support.com/dashboard">
                  <MockDashboard />
                </MockBrowser>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

/* ==========================================
   More Features Grid
   ========================================== */
function MoreFeaturesSection() {
  const features = [
    {
      icon: <ClipboardCheck size={24} />,
      title: 'アンケート作成',
      desc: 'ポチポチ質問を追加するだけで、公演アンケートが完成。回答はデジタルで自動集計。',
    },
    {
      icon: <BarChart3 size={24} />,
      title: '売上レポート',
      desc: '券種別・公演回別の売上を自動で集計。公演後の会計作業が一瞬で終わります。',
    },
    {
      icon: <UserPlus size={24} />,
      title: 'スタッフ管理',
      desc: 'パスコードで簡単ログイン。受付スタッフやモニタースタッフに必要な権限だけを付与。',
    },
    {
      icon: <QrCode size={24} />,
      title: '公開予約フォーム',
      desc: 'カスタマイズ可能な予約フォームを公開。劇団のブランドに合わせた見た目に。',
    },
    {
      icon: <Smartphone size={24} />,
      title: 'スマホ完全対応',
      desc: '全機能がスマホで使えます。受付もモニタリングも、手元のスマホだけでOK。',
    },
    {
      icon: <Shield size={24} />,
      title: '安心のセキュリティ',
      desc: 'Google Cloud / Firebase上で安全にデータ管理。お客様の個人情報を守ります。',
    },
  ];

  return (
    <section className={`${styles.section} ${styles.moreFeaturesSection}`}>
      <div className={styles.sectionInner}>
        <FadeIn>
          <div className={styles.sectionCenter}>
            <div className={styles.sectionLabel}>And More</div>
            <h2 className={styles.sectionTitle}>まだまだあります</h2>
          </div>
        </FadeIn>
        <div className={styles.moreFeaturesGrid}>
          {features.map((f, i) => (
            <FadeIn key={i} delay={i * 0.08}>
              <div className={styles.moreFeatureCard}>
                <div className={styles.moreFeatureIcon}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ==========================================
   Comparison Section
   ========================================== */
function ComparisonSection() {
  const rows = [
    { feature: '予約管理', gform: '△', shibai: '○', corich: '○', tenjin: '◎' },
    { feature: '当日受付', gform: '✕', shibai: '✕', corich: '△', tenjin: '◎' },
    { feature: 'リアルタイム来場管理', gform: '✕', shibai: '✕', corich: '✕', tenjin: '◎' },
    { feature: '売上集計', gform: '✕', shibai: '✕', corich: '△', tenjin: '◎' },
    { feature: 'アンケート', gform: '別途', shibai: '✕', corich: '✕', tenjin: '◎' },
    { feature: 'スタッフ管理', gform: '✕', shibai: '✕', corich: '✕', tenjin: '◎' },
    { feature: 'お客様への手数料', gform: 'なし', shibai: 'なし', corich: '5%', tenjin: 'なし' },
    { feature: '料金', gform: '無料', shibai: '無料', corich: '¥5,000〜', tenjin: '無料〜' },
  ];

  return (
    <section className={`${styles.section} ${styles.comparisonSection}`}>
      <div className={styles.sectionInner}>
        <FadeIn>
          <div className={styles.sectionCenter}>
            <div className={styles.sectionLabel}>Comparison</div>
            <h2 className={styles.sectionTitle}>他のサービスとの違い</h2>
            <p className={styles.sectionSub}>
              予約管理だけのツールとは違います。公演当日の運営まで、まるごとカバー。
            </p>
          </div>
        </FadeIn>
        <FadeIn>
          <div className={styles.comparisonWrapper}>
            <table className={styles.comparisonTable}>
              <thead>
                <tr>
                  <th></th>
                  <th>Googleフォーム</th>
                  <th>シバイエンジン</th>
                  <th>CoRich</th>
                  <th className={styles.comparisonHighlight}>Tenjin-Support</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.feature}</td>
                    <td className={row.gform === '✕' ? styles.comparisonBad : ''}>{row.gform}</td>
                    <td className={row.shibai === '✕' ? styles.comparisonBad : ''}>{row.shibai}</td>
                    <td className={row.corich === '✕' ? styles.comparisonBad : ''}>{row.corich}</td>
                    <td className={styles.comparisonBest}>{row.tenjin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ==========================================
   Pricing Section
   ========================================== */
function PricingSection() {
  return (
    <section id="pricing" className={`${styles.section} ${styles.pricingSection}`}>
      <div className={styles.sectionInner}>
        <FadeIn>
          <div className={styles.sectionCenter}>
            <div className={styles.sectionLabel}>Pricing</div>
            <h2 className={styles.sectionTitle}>シンプルな料金体系</h2>
            <p className={styles.sectionSub}>
              1券種だけなら、ずっと無料。複数券種を使いたいときだけ、公演ごとのお支払い。
            </p>
          </div>
        </FadeIn>
        <FadeIn>
          <div className={styles.pricingGrid}>
            {/* Free Plan */}
            <div className={styles.pricingCard}>
              <div className={styles.pricingName}>フリープラン</div>
              <div className={styles.pricingDesc}>まずは無料で試したい方に</div>
              <div className={styles.pricingPrice}>
                <span className={styles.pricingCurrency}>¥</span>
                <span className={styles.pricingAmount}>0</span>
              </div>
              <div className={styles.pricingUnit}>ずっと無料</div>
              <ul className={styles.pricingFeatures}>
                <li><Check size={16} className={styles.pricingCheckIcon} /> 1券種まで利用可能</li>
                <li><Check size={16} className={styles.pricingCheckIcon} /> 予約管理</li>
                <li><Check size={16} className={styles.pricingCheckIcon} /> 当日チェックイン</li>
                <li><Check size={16} className={styles.pricingCheckIcon} /> 来場モニタリング</li>
                <li><Check size={16} className={styles.pricingCheckIcon} /> 売上レポート</li>
              </ul>
              <button className={`${styles.pricingBtn} ${styles.pricingBtnSecondary}`}>
                無料で始める
              </button>
            </div>

            {/* Pro Plan */}
            <div className={`${styles.pricingCard} ${styles.pricingCardPopular}`}>
              <div className={styles.pricingPopularBadge}>ローンチ記念価格</div>
              <div className={styles.pricingName}>プロプラン</div>
              <div className={styles.pricingDesc}>複数券種を使いたい方に</div>
              <div className={styles.pricingPrice}>
                <span className={styles.pricingCurrency}>¥</span>
                <span className={styles.pricingAmount}>3,000</span>
              </div>
              <div className={styles.pricingUnit}>1公演あたり</div>
              <div className={styles.pricingOriginal}>通常価格 ¥10,000</div>
              <ul className={styles.pricingFeatures}>
                <li><Check size={16} className={styles.pricingCheckIcon} /> 券種無制限</li>
                <li><Check size={16} className={styles.pricingCheckIcon} /> フリープランの全機能</li>
                <li><Check size={16} className={styles.pricingCheckIcon} /> アンケート機能</li>
                <li><Check size={16} className={styles.pricingCheckIcon} /> スタッフ管理</li>
                <li><Check size={16} className={styles.pricingCheckIcon} /> 優先サポート</li>
              </ul>
              <button className={`${styles.pricingBtn} ${styles.pricingBtnPrimary}`}>
                プロプランで始める
              </button>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ==========================================
   How it Works Section
   ========================================== */
function StepsSection() {
  const steps = [
    {
      number: '1',
      icon: <UserPlus size={28} />,
      title: 'アカウント作成',
      desc: 'Googleアカウントでログインするだけ。30秒で登録完了。面倒なフォーム入力は不要です。',
    },
    {
      number: '2',
      icon: <Ticket size={28} />,
      title: '公演を登録',
      desc: '公演名、日時、座席数、券種を入力。ガイドに沿って進めるだけで、すぐにセットアップが完了します。',
    },
    {
      number: '3',
      icon: <ArrowRight size={28} />,
      title: '予約受付を開始',
      desc: '自動生成された予約フォームのURLをSNSやメールで共有。あとはTenjin-Supportにおまかせ。',
    },
  ];

  return (
    <section id="steps" className={`${styles.section} ${styles.stepsSection}`}>
      <div className={styles.sectionInner}>
        <FadeIn>
          <div className={styles.sectionCenter}>
            <div className={styles.sectionLabel}>How it works</div>
            <h2 className={styles.sectionTitle}>3ステップで始められます</h2>
          </div>
        </FadeIn>
        <div className={styles.stepsGrid}>
          {steps.map((step, i) => (
            <FadeIn key={i} delay={i * 0.15}>
              <div className={styles.step}>
                <div className={styles.stepNumber}>{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ==========================================
   FAQ Section
   ========================================== */
function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      q: '本当に無料で使えますか？',
      a: 'はい、1つの券種（例：「一般」のみ）であれば、全機能を無料でお使いいただけます。複数の券種（「一般」「学生」「当日」など）を登録する場合のみ、1公演あたり¥3,000の料金が発生します。',
    },
    {
      q: 'スマホだけで使えますか？',
      a: 'はい、全機能がスマートフォンに対応しています。当日の受付やチェックインもスマホだけで完結します。タブレットやPCでももちろん使えます。',
    },
    {
      q: 'お客様に手数料はかかりますか？',
      a: 'いいえ、お客様への手数料は一切かかりません。予約されるお客様は完全無料でご利用いただけます。',
    },
    {
      q: 'データのセキュリティは大丈夫ですか？',
      a: 'Google Cloud（Firebase）上でデータを管理しており、通信はすべて暗号化されています。お客様の個人情報は安全に保護されます。',
    },
    {
      q: '公演数に制限はありますか？',
      a: 'いいえ、作成できる公演数に制限はありません。何公演でも管理できます。',
    },
    {
      q: '他のサービスから移行できますか？',
      a: 'はい、既存の予約データがある場合は、手動での登録が必要ですが、新しい公演からすぐにお使いいただけます。過去の予約を引き継ぐ必要がない場合は、登録してすぐにスタートできます。',
    },
  ];

  return (
    <section id="faq" className={`${styles.section} ${styles.faqSection}`}>
      <div className={styles.sectionInner}>
        <FadeIn>
          <div className={styles.sectionCenter}>
            <div className={styles.sectionLabel}>FAQ</div>
            <h2 className={styles.sectionTitle}>よくある質問</h2>
          </div>
        </FadeIn>
        <FadeIn>
          <div className={styles.faqList}>
            {faqs.map((faq, i) => (
              <div key={i} className={styles.faqItem}>
                <button
                  className={styles.faqQuestion}
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  aria-expanded={openIndex === i}
                >
                  {faq.q}
                  <Plus size={20} className={`${styles.faqIcon} ${openIndex === i ? styles.faqIconOpen : ''}`} />
                </button>
                {openIndex === i && (
                  <motion.div
                    className={styles.faqAnswer}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.3 }}
                  >
                    {faq.a}
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ==========================================
   Final CTA Section
   ========================================== */
function FinalCTASection({ onLogin }: { onLogin: () => void }) {
  return (
    <section className={styles.ctaSection}>
      <FadeIn>
        <div className={styles.sectionCenter}>
          <h2 className={styles.sectionTitle}>公演制作を、もっとシンプルに。</h2>
          <p className={styles.sectionSub}>
            制作業務に追われる時間を減らして、
            作品づくりにもっと集中しませんか。
          </p>
          <button className={styles.ctaBtn} onClick={onLogin}>
            無料で始める
            <ArrowRight size={20} />
          </button>
          <p className={styles.ctaNote}>クレジットカード不要 ・ 1券種まで永久無料</p>
        </div>
      </FadeIn>
    </section>
  );
}

/* ==========================================
   Footer
   ========================================== */
function LPFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerLogo}>🎭 Tenjin-Support</div>
        <div className={styles.footerLinks}>
          <a href="/guide">利用ガイド</a>
          <a href="/faq">FAQ</a>
          <a href="/contact">お問い合わせ</a>
        </div>
      </div>
      <div className={styles.footerCopy}>
        &copy; 2026 Tenjin-Support. All rights reserved.
      </div>
    </footer>
  );
}

/* ==========================================
   Main Landing Page
   ========================================== */
export default function LandingPage() {
  const { user, loading, isNewUser, loginWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      if (isNewUser) {
        router.push('/onboarding');
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, loading, isNewUser, router]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading) {
    return <div className="flex-center" style={{ height: '100vh' }}>読み込み中...</div>;
  }

  // If user is logged in, don't render LP (will redirect)
  if (user) {
    return <div className="flex-center" style={{ height: '100vh' }}>リダイレクト中...</div>;
  }

  return (
    <div className={styles.landing} id="main-content">
      <LPHeader onLogin={loginWithGoogle} onScrollTo={scrollTo} />
      <HeroSection onLogin={loginWithGoogle} onScrollTo={scrollTo} />
      <PainPointsSection />
      <FeaturesSection />
      <MoreFeaturesSection />
      <ComparisonSection />
      <PricingSection />
      <StepsSection />
      <FAQSection />
      <FinalCTASection onLogin={loginWithGoogle} />
      <LPFooter />

      {/* Mobile Fixed CTA */}
      <div className={styles.mobileCta}>
        <button className={styles.mobileCtaBtn} onClick={loginWithGoogle}>
          無料で始める <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
