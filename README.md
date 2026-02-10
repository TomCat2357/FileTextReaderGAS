# FileTextReaderGAS

Google Drive 上の **Google Docs / Google Sheets / PDF / Word** からテキストを抽出する Google Apps Script（GAS）プロジェクトです。  
Web アプリとしてデプロイすると、HTTP 経由で **非同期 Task API（分割処理）**としても利用できます。

---

## 1. できること

### 同期（GAS 内から直接呼ぶ）
- `readTextFromUrl(urlOrId, options)` に Drive の URL またはファイル ID を渡してテキスト取得

### 非同期（Web アプリ経由で HTTP から呼ぶ）
- `POST` でタスク作成（OCR・分割処理可）
- `GET` で進捗ポーリング
- 完了後、分割結果は Drive に保存され、URL が返る

---

## 2. ディレクトリ構成

```
FileTextReaderGAS/
├── .clasp.json            # clasp プロジェクト設定
├── .gas-deployment.json   # デプロイ情報キャッシュ (自動生成)
├── deploy.ps1             # デプロイスクリプト (PowerShell)
├── package.json           # npm 設定
├── README.md
└── src/
    ├── appsscript.json    # GAS マニフェスト
    ├── Code.gs            # 同期テキスト抽出コア
    ├── Api.gs             # Web API エンドポイント (doGet / doPost)
    ├── Worker.gs          # 非同期タスク実行ワーカー
    ├── TaskStore.gs       # タスクメタデータ管理 (PropertiesService)
    └── ResultStore.gs     # 結果ファイル保存 (Drive)
```

---

## 3. 前提・注意（重要）

### 3.1 Web アプリ公開設定と「認証」の整合
このプロジェクトの Task API は、タスク作成者とリクエストユーザーの一致でアクセス制御します（`createdBy` と `Session.getActiveUser().getEmail()` の比較）。  
そのため **「匿名アクセス（Anyone / ANYONE_ANONYMOUS）」では成立しません**。

✅ 推奨設定（どちらか）:
- **自分だけ**（Only myself）
- **Google アカウントを持つユーザー**（Anyone with Google account）

> 既存の `src/appsscript.json` では `access: "ANYONE_ANONYMOUS"` になっている場合があります。Task API を安全に動かすなら、ここを変更して再デプロイしてください。

### 3.2 PDF/Word は一時的に Google Doc へ変換して抽出
- PDF は Drive API v2 の `Files.copy(convert=true, ocr=true)` 相当で OCR 変換してから読みます
- Word も一度 Google Docs に変換して読みます
- 変換後の一時 Doc は `setTrashed(true)` でゴミ箱へ移動します（完全削除ではありません）

### 3.3 実行時間・同時実行
- GAS には実行時間制限があります
- Worker は LockService で排他し、基本「1トリガーで1タスク（または連続処理）」の設計です
- 大きい PDF は OCR で時間がかかります。`parts` を増やすと結果保存回数も増えます

---

## 4. セットアップ

### 4.1 依存パッケージ
```bash
npm install
```

### 4.2 clasp ログイン
```bash
npm run clasp:login
```

### 4.3 プロジェクト作成（新規の場合）
```bash
clasp create --title "FileTextReaderGAS" --type standalone --rootDir src
```

### 4.4 Google Cloud / Apps Script 設定（必須）
Apps Script エディタで以下を有効化:
- **Advanced Google services** → **Drive API (v2)**

加えて、Google Cloud Console 側でも同プロジェクトの **Google Drive API** を有効化してください。

---

## 5. デプロイ

### 5.1 deploy.ps1（推奨）
PowerShell で以下を実行すると、push → deploy → URL 表示まで行います。

```powershell
.\deploy.ps1
```

- 初回は新規デプロイメントを作成
- 2回目以降は `.gas-deployment.json` に保存された Deployment ID を使って更新

### 5.2 手動（clasp）
```bash
npm run clasp:push
clasp deploy
```

---

## 6. Web アプリ公開設定（必須）

Task API を成立させるには、匿名アクセスではなく「認証あり」にしてください。

1. Apps Script エディタ → **デプロイ** → **新しいデプロイ**
2. 種類: **ウェブアプリ**
3. 実行ユーザー: **自分**
4. アクセスできるユーザー:  
   - **自分だけ** もしくは  
   - **Google アカウントを持つ全員**

---

## 7. 使い方（同期）

### 7.1 基本
`readTextFromUrl(urlOrId, options)` に URL またはファイル ID を渡します。

```javascript
// Google Docs URL
var text = readTextFromUrl("https://docs.google.com/document/d/FILE_ID/edit");

// ファイル ID
var text = readTextFromUrl("FILE_ID");

// PDF（OCR 言語指定）
var text = readTextFromUrl("PDF_FILE_ID", { ocrLanguage: "ja" });
```

### 7.2 入力として受け付ける形式
- Google Docs / Sheets / Drive の URL
- 共有リンク（`/d/FILE_ID/` 形式）
- `?id=FILE_ID` 形式
- ファイル ID（`[a-zA-Z0-9_-]{10,}`）

---

## 8. 使い方（非同期 Task API）

### 8.1 エンドポイント
- Web アプリ URL（例）:  
  `https://script.google.com/macros/s/XXXX/exec`

### 8.2 タスク作成（POST）

#### リクエスト
```http
POST {WEB_APP_URL}
Content-Type: application/json

{
  "action": "createTask",
  "sourceUrl": "https://docs.google.com/document/d/FILE_ID/edit",
  "parts": 3,
  "splitMode": "equal",
  "ocrLanguage": "ja"
}
```

#### パラメータ
| パラメータ | 必須 | 説明 | デフォルト |
|---|---:|---|---|
| action | Yes | `"createTask"` 固定 | - |
| sourceUrl | Yes | 対象ファイルの URL または ID | - |
| parts | No | 分割数（1以上） | 1 |
| splitMode | No | `"equal"`（行で均等） / `"page"`（`\f`改ページ） | equal |
| ocrLanguage | No | PDF OCR 言語コード | ja |

#### レスポンス
```json
{
  "taskId": "t_xxxxxxxxxxxx",
  "status": "queued",
  "statusUrl": "?taskId=t_xxxxxxxxxxxx"
}
```

---

### 8.3 タスク状態確認（GET）

```http
GET {WEB_APP_URL}?taskId={taskId}
```

レスポンス例:
```json
{
  "taskId": "t_xxxxxxxxxxxx",
  "status": "completed",
  "progress": 100,
  "partsTotal": 3,
  "partsDone": 3,
  "results": [
    { "partNo": 1, "status": "done", "url": "https://drive.google.com/..." },
    { "partNo": 2, "status": "done", "url": "https://drive.google.com/..." },
    { "partNo": 3, "status": "done", "url": "https://drive.google.com/..." }
  ],
  "error": null
}
```

ステータス:
- `queued` → `running` → `completed`
- 失敗時: `failed`（`error.code`, `error.message` が入ります）

---

### 8.4 結果ファイル
- 分割結果は Google Drive にテキストファイルとして保存されます
- 保存先フォルダ: `FileTextReaderGAS_Results`
- 共有設定: **オーナーのみ（PRIVATE）**

---

## 9. curl 例

> Web アプリを「認証あり」で公開している場合、ブラウザのログインセッションがない curl では 302/401 相当になり得ます。  
> 手元の用途に合わせて、ブラウザから叩く・GAS/社内基盤から叩く等の運用にしてください。

### 9.1 作成
```bash
curl -X POST "$WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "action":"createTask",
    "sourceUrl":"FILE_ID_OR_URL",
    "parts":3,
    "splitMode":"equal",
    "ocrLanguage":"ja"
  }'
```

### 9.2 状態確認
```bash
curl "$WEB_APP_URL?taskId=t_xxxxxxxxxxxx"
```

---

## 10. 必要な OAuth スコープ

| スコープ | 用途 |
|---|---|
| https://www.googleapis.com/auth/drive | OCR変換、結果保存 |
| https://www.googleapis.com/auth/documents | Docs テキスト取得 |
| https://www.googleapis.com/auth/spreadsheets | Sheets テキスト取得 |
| https://www.googleapis.com/auth/script.external_request | Web App |
| https://www.googleapis.com/auth/userinfo.email | 作成者識別 |

---

## 11. npm スクリプト

| コマンド | 説明 |
|---|---|
| npm run clasp:login | Google 認証 |
| npm run clasp:push | コードをプッシュ |
| npm run clasp:pull | リモートから取得 |
| npm run clasp:open | Apps Script エディタを開く |

---

## 12. トラブルシュート

### Q1. GET が `FORBIDDEN` になる
- Web アプリが匿名アクセスになっていないか確認
- タスクを作成した Google アカウントと、状態確認しているアカウントが一致しているか確認

### Q2. curl だと 302 になる / HTML が返る
- ブラウザのログイン前提のため（Web アプリが「認証あり」設定）
- 同じアカウントでログインしたブラウザから叩く、または運用方法を見直してください

### Q3. PDF がうまく読めない
- Drive API v2 / Drive API 有効化を確認
- OCR は言語に依存します（`ocrLanguage` を調整）
