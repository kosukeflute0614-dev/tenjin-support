# セキュリティ監査レポート - Tenjin-Support

**監査日**: 2026-03-03
**対象**: Theater Production Support (Tenjin-Support)
**手法**: OWASP Top 10 + コード静的解析 + 依存関係監査

---

## 対応ステータス一覧

| ID | 深刻度 | OWASP | 問題 | ステータス |
|----|--------|-------|------|-----------|
| SEC-01 | CRITICAL | A02 | シークレットの露出 (.env.local) | [x] 確認済（.gitignore に含まれている。.env.example 更新済） |
| SEC-02 | CRITICAL | A01 | staffTokens が公開ページに露出 | [x] 修正済（userId 未指定時に除外） |
| SEC-03 | CRITICAL | A02 | staffToken が予約/ログに永続保存 | [x] 修正済（staffVerified: true に変更） |
| SEC-04 | HIGH | A01 | IDOR: getDashboardStats の所有権検証欠如 | [x] 修正済（production 所有権検証を追加） |
| SEC-05 | HIGH | A02 | 弱いパスコードハッシュ (SHA-256) | [x] 修正済（bcrypt 導入、SHA-256 後方互換あり） |
| SEC-06 | HIGH | A03 | parseInt 入力バリデーション不足 | [x] 修正済（parsePositiveInt ヘルパー追加） |
| SEC-07 | HIGH | A01 | 公開予約 API の認可不足 | [x] 修正済（receptionStatus !== 'OPEN' をブロック） |
| SEC-08 | HIGH | A07 | Cookie セッションの暗号化なし | [x] 修正済（jose JWT 署名、secure/strict 強化） |
| SEC-09 | MEDIUM | A04 | レート制限なし（公開エンドポイント） | [ ] 未対応（要追加パッケージ検討） |
| SEC-10 | MEDIUM | A04 | メモリ内フィルタリングのみ（DB レベル不足） | [x] 修正済（Firestore クエリに userId 追加） |
| SEC-11 | MEDIUM | A05 | 個人メールアドレスのハードコード | [x] 修正済（環境変数 REPLY_TO_EMAIL に変更） |
| SEC-12 | MEDIUM | A03 | dangerouslySetInnerHTML 使用 | [x] 修正済（通常の style タグに変更） |
| SEC-13 | LOW | A09 | 監査ログなし | [ ] 未対応（将来的に実装検討） |
| SEC-14 | LOW | A05 | CSRF 保護が暗黙的 | [-] 対応不要（Next.js Server Actions の自動保護） |
| SEC-15 | HIGH | A06 | npm 依存関係の既知脆弱性 | [x] 修正済（npm audit fix 実行、0 vulnerabilities） |

---

## CRITICAL - 即座に対応が必要

### SEC-01: シークレットの露出 (.env.local)

- **OWASP**: A02 Cryptographic Failures
- **ファイル**: `.env.local` (line 11, 18)
- **深刻度**: CRITICAL
- **発見内容**:
  - Firebase API Key がソースコード内に存在: `AIzaSyDjnmQYlhJ1q7aprhANJcq8FOezLnsBQXk`
  - RESEND API Key がソースコード内に存在していた（旧キーは無効化済み・再発行対応済み）
  - `.gitignore` に `.env.local` が含まれているが、万一コミットされた場合のリスクが極めて高い
- **影響**:
  - リポジトリアクセス権を持つ全員が Firebase プロジェクトに直接アクセス可能
  - RESEND API を使った不正メール送信
  - Firebase プロジェクトの乗っ取り
- **対応方針**:
  1. Firebase API Key は公開キーとして設計されているため、Firestore Security Rules での保護が本質的な対策
  2. RESEND API Key はサーバーサイド専用であることを確認（`NEXT_PUBLIC_` プレフィックスがないこと）
  3. `.env.local` が Git 履歴に含まれていないことを確認
  4. Firebase App Check の導入を検討
- **確認コマンド**:
  ```bash
  git log --all --full-history -- .env.local
  git log --all --full-history -- .env
  ```

---

### SEC-02: staffTokens が公開ページに露出

- **OWASP**: A01 Broken Access Control
- **ファイル**: `src/lib/client-firestore/production.ts` (line 64)
- **深刻度**: CRITICAL
- **発見内容**:
  ```typescript
  // line 64
  staffTokens: rawData.staffTokens || {}
  ```
  `fetchProductionDetailsClient()` が公開予約ページ (`/book/[productionId]`) から呼び出され、
  `staffTokens`（スタッフ認証トークン・ハッシュ済みパスコード）が未認証ユーザーに返される。
- **影響**:
  - 攻撃者がブラウザの DevTools からスタッフトークンを取得可能
  - トークンを使ってスタッフとして認証し、チェックイン・支払い操作が可能
  - 権限昇格による不正操作
- **対応方針**:
  公開ページ用の関数では `staffTokens` を除外する。
  ```typescript
  // 公開用: staffTokens を含めない
  export async function fetchProductionDetailsPublic(productionId: string): Promise<Production | null> {
    const docSnap = await getDoc(doc(db, "productions", productionId));
    if (!docSnap.exists()) return null;
    const data = serializeDoc<Production>(docSnap);
    const { staffTokens, ...publicData } = data;
    return publicData as Production;
  }
  ```

---

### SEC-03: staffToken が予約/ログに永続保存

- **OWASP**: A02 Cryptographic Failures
- **ファイル**: `src/lib/client-firestore/staff.ts` (line 164, 239)
- **深刻度**: CRITICAL
- **発見内容**:
  ```typescript
  // line 164 - createSameDayTicketStaffClient
  staffToken,
  // line 239 - processCheckinWithPaymentStaffClient
  staffToken,
  ```
  スタッフトークンが `reservations` および `checkinLogs` ドキュメントに永続保存される。
- **影響**:
  - Firestore のドキュメントからトークンを抽出可能
  - 過去のトークンが無期限にアクセス可能
  - トークン漏洩時の影響範囲が拡大
- **対応方針**:
  - `staffToken` フィールドを削除し、`_staffToken` のみを Security Rules 検証用に一時的に使用
  - または `staffTokenUsed: true` のようなフラグのみを保存
  ```typescript
  // Before
  staffToken,

  // After (トークン値を保存しない)
  staffVerified: true,
  ```

---

## HIGH - 早急に対応

### SEC-04: IDOR - getDashboardStats の所有権検証欠如

- **OWASP**: A01 Broken Access Control
- **ファイル**: `src/app/actions/dashboard.ts` (line 16-41)
- **深刻度**: HIGH
- **発見内容**:
  ```typescript
  export async function getDashboardStats(
    productionId: string, userId: string
  ): Promise<PerformanceStats[]> {
    // productionId の所有者が userId であることを検証していない
    const qPerf = query(performancesRef, where("productionId", "==", productionId));
  }
  ```
  `userId` パラメータはクライアントから渡されるため、攻撃者が任意の `productionId` を指定して
  他ユーザーの売上データを取得可能。
- **影響**:
  - 他ユーザーの売上統計・公演データの閲覧
  - 競合他社や第三者による情報窃取
- **対応方針**:
  ```typescript
  // production の所有権を検証
  const productionSnap = await getDoc(doc(db, "productions", productionId));
  if (!productionSnap.exists() || productionSnap.data().userId !== userId) {
    throw new Error("Unauthorized");
  }
  ```

---

### SEC-05: 弱いパスコードハッシュ (SHA-256)

- **OWASP**: A02 Cryptographic Failures
- **ファイル**: `src/app/actions/staff-auth.ts` (line 8-10)
- **深刻度**: HIGH
- **発見内容**:
  ```typescript
  function hashPasscode(passcode: string): string {
    return crypto.createHash('sha256').update(passcode).digest('hex');
  }
  ```
  SHA-256 はパスワード/パスコードハッシュには不適切：
  - ソルトなし → レインボーテーブル攻撃に脆弱
  - 計算が高速すぎる → ブルートフォース攻撃に弱い
  - パスコードは通常4-6桁 → 全探索が容易
- **影響**:
  - スタッフパスコードの逆算が容易
  - レインボーテーブルによる即座の解読
- **対応方針**:
  短いパスコード（4-6桁数字）の場合、ハッシュ強化だけでは不十分。
  以下の多層防御を推奨：
  1. パスコードの最小長を8文字以上に変更
  2. bcrypt または PBKDF2 でハッシュ（サーバーサイドで実施）
  3. 試行回数制限の導入（5回失敗でロック）
  ```typescript
  import { hash, compare } from 'bcrypt';
  const SALT_ROUNDS = 10;
  const hashed = await hash(passcode, SALT_ROUNDS);
  const isValid = await compare(input, hashed);
  ```
  **注意**: クライアント側のハッシュ（Web Crypto API）との整合性も要検討。

---

### SEC-06: parseInt 入力バリデーション不足

- **OWASP**: A03 Injection
- **ファイル**: `src/app/actions/production-details.ts` (line 29, 63-64, 184, 242-243)
- **深刻度**: HIGH
- **発見内容**:
  ```typescript
  const capacity = parseInt(formData.get('capacity') as string);     // line 29
  const advancePrice = parseInt(formData.get('advancePrice') as string); // line 63
  const doorPrice = parseInt(formData.get('doorPrice') as string);   // line 64
  ```
  - `parseInt()` が NaN を返しても Firestore に保存される
  - 負値・極端に大きな値のチェックなし
  - 空文字列の場合 NaN が保存される
- **影響**:
  - データベースに不正な値（NaN、負値）が保存される
  - 会計計算の不整合
  - アプリケーションのクラッシュ
- **対応方針**:
  ```typescript
  function parsePositiveInt(value: string | null, fieldName: string, max = 999999): number {
    if (!value) throw new Error(`${fieldName} is required`);
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0 || num > max) {
      throw new Error(`${fieldName} must be a number between 0 and ${max}`);
    }
    return num;
  }

  const capacity = parsePositiveInt(formData.get('capacity') as string, 'capacity', 9999);
  const advancePrice = parsePositiveInt(formData.get('advancePrice') as string, 'advancePrice');
  ```

---

### SEC-07: 公開予約 API の認可不足

- **OWASP**: A01 Broken Access Control
- **ファイル**: `src/app/actions/reservation.ts` (line 25-32)
- **深刻度**: HIGH
- **発見内容**:
  未認証ユーザーが `activeProductionId` を指定すると、`receptionStatus` を確認せずに
  公演詳細が返される。クローズ済みの公演情報にもアクセス可能。
- **影響**:
  - 非公開公演の情報漏洩
  - クローズ済み公演への不正予約の可能性
- **対応方針**:
  ```typescript
  if (!userId && activeProductionId) {
    const production = await fetchProductionDetailsPublic(activeProductionId);
    if (!production || production.receptionStatus !== 'OPEN') {
      return { productions: [], performances: [] };
    }
    // ...
  }
  ```

---

### SEC-08: Cookie セッションの暗号化なし

- **OWASP**: A07 Identification and Authentication Failures
- **ファイル**: `src/app/actions/staff-auth.ts` (line 58-64)
- **深刻度**: HIGH
- **発見内容**:
  ```typescript
  cookieStore.set(`staff_session_${productionId}`, sessionPayload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60
  });
  ```
  - セッションペイロードが平文 JSON で保存
  - `secure` フラグが開発環境で無効
  - セッションデータの改ざん検知なし
- **影響**:
  - Cookie 値の改ざんによる権限昇格
  - 開発環境での MITM 攻撃
- **対応方針**:
  ```typescript
  import { SignJWT, jwtVerify } from 'jose';

  // セッションをJWTとして署名
  const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
  const token = await new SignJWT({ productionId, staffToken, role })
    .setProtectionHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(secret);

  cookieStore.set(`staff_session_${productionId}`, token, {
    httpOnly: true,
    secure: true,  // 常に true
    sameSite: 'strict',  // lax → strict に強化
    maxAge: 24 * 60 * 60,
    path: '/',
  });
  ```

---

### SEC-15: npm 依存関係の既知脆弱性

- **OWASP**: A06 Vulnerable and Outdated Components
- **深刻度**: HIGH
- **発見内容**:
  ```
  minimatch ≤3.1.3  → HIGH: ReDoS (複数CVE)
  ajv <6.14.0        → MODERATE: ReDoS
  ```
- **影響**: ReDoS によるサービス拒否の可能性（間接依存、実際のリスクは限定的）
- **対応方針**:
  ```bash
  npm audit fix
  ```

---

## MEDIUM - 計画的に対応

### SEC-09: レート制限なし（公開エンドポイント）

- **OWASP**: A04 Insecure Design
- **ファイル**: `src/app/actions/reservation.ts` (line 86-128)
- **深刻度**: MEDIUM
- **発見内容**: `createPublicReservation()` にレート制限・CAPTCHA なし。
- **影響**: スパム予約、Firestore クォータ消費、DoS
- **対応方針**: Upstash Ratelimit または Firestore ベースのレート制限を導入。
  公開フォームに reCAPTCHA / Turnstile を追加。

---

### SEC-10: メモリ内フィルタリングのみ

- **OWASP**: A04 Insecure Design
- **ファイル**: `src/app/actions/dashboard.ts` (line 27, 89)
- **深刻度**: MEDIUM
- **発見内容**: Firestore クエリで全ドキュメントを取得後、アプリ内で `userId` フィルタ。
- **影響**: 不要なデータ取得、Firestore Rules 不備時のデータ漏洩
- **対応方針**: クエリに `where("userId", "==", userId)` を追加。

---

### SEC-11: 個人メールアドレスのハードコード

- **OWASP**: A05 Security Misconfiguration
- **ファイル**: `src/lib/email.ts` (line 11)
- **深刻度**: MEDIUM
- **発見内容**: `const REPLY_TO = 'kosuke.flute0614@gmail.com';`
- **影響**: 個人情報の露出、マルチテナント未対応
- **対応方針**: 環境変数 or 劇団設定から取得。

---

### SEC-12: dangerouslySetInnerHTML 使用

- **OWASP**: A03 Injection
- **ファイル**: `src/app/reception/page.tsx` (line 111-119)
- **深刻度**: MEDIUM
- **発見内容**: 静的 CSS に対して `dangerouslySetInnerHTML` を使用。現時点でのリスクは低いが、
  将来的にユーザー入力が混入した場合に XSS リスクとなる。
- **対応方針**: CSS Modules または `<style>` タグの直接使用に変更。

---

## LOW - 改善推奨

### SEC-13: 監査ログなし

- **OWASP**: A09 Security Logging and Monitoring Failures
- **深刻度**: LOW
- **発見内容**: 支払い登録・チェックイン変更・予約キャンセル等の重要操作に監査ログがない。
- **対応方針**: `auditLogs` コレクションを作成し、重要操作時にログを記録。

---

### SEC-14: CSRF 保護が暗黙的

- **OWASP**: A05 Security Misconfiguration
- **深刻度**: LOW
- **発見内容**: Next.js Server Actions の自動 CSRF 保護に依存。明示的な Origin/Referer 検証なし。
- **対応方針**: Next.js 16 の Server Actions は自動保護されるため、現時点で対応不要。
  カスタム API Routes を追加する場合は明示的な CSRF トークン検証を実装すること。

---

## 参考: Firestore Security Rules の確認事項

上記の問題の多くは、Firestore Security Rules が適切に設定されていれば影響が軽減される。
以下を確認すること：
- `productions` の `staffTokens` フィールドへのクライアント読み取りが制限されているか
- `reservations` は所有者のみ読み取り可能か
- `checkinLogs` は認証済みスタッフのみアクセス可能か
