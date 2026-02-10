# FileTextReaderGAS

Google Drive 上の **Google Docs / Google Sheets / PDF / Word** からテキストを抽出する Google Apps Script（GAS）プロジェクトです。  
Web アプリとしてデプロイすると、HTTP 経由で **非同期 Task API（分割処理）** として利用できます。

- 同期: GAS 内から `readTextFromUrl()` を直接呼ぶ  
- 非同期: Web アプリに `POST` してタスク作成 → `GET` で進捗/結果取得

---

## 1. できること

### 1.1 同期（GAS 内から直接呼ぶ）
- `readTextFromUrl(urlOrId, options)` に Drive の URL またはファイル ID を渡してテキスト取得

### 1.2 非同期（Web アプリ経由で HTTP から呼ぶ）
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
    ├── Worker.gs          # 非同期タスク実行ワーカー（トリガー）
    ├── TaskStore.gs       # タスクメタデータ管理 (PropertiesService)
    └── ResultStore.gs     # 結果ファイル保存 (Drive)
```

---

## 3. セキュリティ/公開設定（重要）

### 3.1 Task API は「作成者のみ」アクセス可能
`GET` での進捗/結果取得は、タスク作成者（`createdBy`）とリクエストユーザーの一致でアクセス制御します。

- `createdBy` はタスク作成時に `Session.getActiveUser().getEmail()` を保存
- `GET` は `task.createdBy === Session.getActiveUser().getEmail()` を検証

この設計のため **匿名アクセス（Anyone / ANYONE_ANONYMOUS）では成立しません**。

✅ 推奨（Apps Script のデプロイ設定）  
- 実行ユーザー: **自分**
- アクセスできるユーザー: **自分だけ** または **Google アカウントを持つユーザー（Anyone）**（ドメイン限定にしたい場合は Domain）

> `src/appsscript.json` の `webapp.access` が `ANYONE_ANONYMOUS` のままだと、意図した認証が働かず
> `Session.getActiveUser().getEmail()` が空になる/期待通り取得できない可能性があります。
> 安全運用のため、マニフェスト・デプロイ設定を「認証あり」に揃えてから再デプロイしてください。

### 3.2 結果ファイルの共有設定
分割結果は Drive にテキストファイルとして保存されます。

- 保存先フォルダ: `FileTextReaderGAS_Results`
- 共有設定: **オーナーのみ（PRIVATE）**（ResultStore で強制）

### 3.3 PDF / Word の扱い（変換 + 後片付け）
- PDF は Drive API v2 の `Files.copy(convert=true, ocr=true)` 相当で OCR 変換してから読みます
- Word も一度 Google Docs に変換して読みます
- 変換後の一時 Doc は `setTrashed(true)` でゴミ箱へ移動します（完全削除ではありません）

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

### 4.4 Advanced Google services（必須）
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

## 6. 使い方（同期）

### 6.1 基本
`readTextFromUrl(urlOrId, options)` に URL またはファイル ID を渡します。

```javascript
// Google Docs URL
var text = readTextFromUrl("https://docs.google.com/document/d/FILE_ID/edit");

// ファイル ID
var text = readTextFromUrl("FILE_ID");

// PDF（OCR 言語指定）
var text = readTextFromUrl("PDF_FILE_ID", { ocrLanguage: "ja" });
```

### 6.2 入力として受け付ける形式
- Google Docs / Sheets / Drive の URL
- 共有リンク（`/d/FILE_ID/` 形式）
- `?id=FILE_ID` 形式
- ファイル ID（`[a-zA-Z0-9_-]{10,}`）

---

## 7. 使い方（非同期 Task API）

このプロジェクトの Web API は **1つの Web アプリ URL（/exec）** で、`POST` / `GET` を提供します。

### 7.1 エンドポイント
- Web アプリ URL（例）:  
  `https://script.google.com/macros/s/XXXX/exec`

### 7.2 タスク作成（POST）

#### リクエスト（action=createTask）
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
| action | No | `"createTask"`（省略時も createTask） | createTask |
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

### 7.3 タスク状態確認（GET）
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

### 7.4 同期読み出し（HTTP / action=readSync）
非同期にせず「HTTPで即時にテキストを返す」用途向けに `readSync` も用意しています。

```http
POST {WEB_APP_URL}
Content-Type: application/json

{
  "action": "readSync",
  "sourceUrl": "FILE_ID_OR_URL",
  "ocrLanguage": "ja"
}
```

レスポンス例:
```json
{
  "status": "completed",
  "text": "...."
}
```

---

## 8. curl 例（注意あり）

Web アプリを「認証あり」で公開している場合、ブラウザのログインセッションがない `curl` では **302/401 相当**になり得ます。  
用途に合わせて以下のどれかで運用してください。

- 同じ Google アカウントでログイン済みのブラウザから叩く
- 社内基盤/GAS など「ログインセッション」前提の環境から叩く
- 必要なら API の認証方式（例: トークン）を別途設計する（本プロジェクト範囲外）

### 8.1 タスク作成
```bash
curl -X POST "$WEB_APP_URL"   -H "Content-Type: application/json"   -d '{
    "action":"createTask",
    "sourceUrl":"FILE_ID_OR_URL",
    "parts":3,
    "splitMode":"equal",
    "ocrLanguage":"ja"
  }'
```

### 8.2 状態確認
```bash
curl "$WEB_APP_URL?taskId=t_xxxxxxxxxxxx"
```

---

## 9. 必要な OAuth スコープ

`src/appsscript.json` で指定している主なスコープ:

| スコープ | 用途 |
|---|---|
| https://www.googleapis.com/auth/drive | OCR変換、結果保存 |
| https://www.googleapis.com/auth/documents | Docs テキスト取得 |
| https://www.googleapis.com/auth/spreadsheets | Sheets テキスト取得 |
| https://www.googleapis.com/auth/script.external_request | Web App |
| https://www.googleapis.com/auth/userinfo.email | 作成者識別 |
| https://www.googleapis.com/auth/script.scriptapp | トリガー作成（Worker 起動） |

---

## 10. npm スクリプト

| コマンド | 説明 |
|---|---|
| npm run clasp:login | Google 認証 |
| npm run clasp:push | コードをプッシュ |
| npm run clasp:pull | リモートから取得 |
| npm run clasp:open | Apps Script エディタを開く |

---

## 11. トラブルシュート

### Q1. GET が `FORBIDDEN` になる
- Web アプリが匿名アクセスになっていないか確認
- タスクを作成した Google アカウントと、状態確認しているアカウントが一致しているか確認

### Q2. curl だと 302 になる / HTML が返る
- ブラウザのログイン前提のため（Web アプリが「認証あり」設定）
- 同じアカウントでログインしたブラウザから叩く、または運用方法を見直してください

### Q3. PDF がうまく読めない
- Drive API v2 / Drive API 有効化を確認
- OCR は言語に依存します（`ocrLanguage` を調整）

### Q4. `Session.getActiveUser().getEmail()` が空になる
- 匿名アクセスや権限設定の不一致が原因になりがちです（3章参照）
- それでも取得できない場合、環境/アカウント種別の制約の可能性があります  
  → `Session.getEffectiveUser().getEmail()` の利用を検討してください（要件に合わせてコード変更）

---

## 12. ライセンス
必要に応じて追記してください。
