# FileTextReaderGAS

Google Docs, Sheets, PDF, Word ファイルからテキストを抽出する Google Apps Script ライブラリ。
非同期タスク API によるテキスト分割処理にも対応。

## ディレクトリ構成

```
FileTextReaderGAS/
├── .clasp.json            # clasp プロジェクト設定
├── .gas-deployment.json   # デプロイ情報キャッシュ (自動生成)
├── deploy.ps1             # デプロイスクリプト (PowerShell)
├── package.json           # npm 設定
├── README.md
└── src/
    ├── appsscript.json    # GAS マニフェスト
    ├── Code.gs            # テキスト抽出コア処理
    ├── Api.gs             # Web API エンドポイント (doGet / doPost)
    ├── Worker.gs          # 非同期タスク実行ワーカー
    ├── TaskStore.gs       # タスクメタデータ管理
    └── ResultStore.gs     # 結果ファイル保存
```

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. Google にログイン

```bash
npm run clasp:login
```

### 3. プロジェクトの作成

新規作成する場合:

```bash
clasp create --title "FileTextReaderGAS" --type standalone --rootDir src
```

### 4. Google Cloud Console での設定

Apps Script エディタで以下を有効化:

- **Advanced Google services** > **Drive API** (v2)
- Google Cloud Console で同プロジェクトの **Google Drive API** を有効化

## デプロイ

### deploy.ps1 を使う方法 (推奨)

PowerShell でデプロイスクリプトを実行すると、プッシュ・デプロイ・情報表示をまとめて行えます。

```powershell
.\deploy.ps1
```

初回デプロイ時は新規デプロイメントが作成され、2回目以降は `.gas-deployment.json` に保存された Deployment ID を使って同じデプロイメントが更新されます。

### 手動でデプロイする場合

```bash
npm run clasp:push
```

プッシュ後、Apps Script エディタまたは `clasp deploy` コマンドで Web アプリとしてデプロイしてください。

### Web アプリの公開設定

`src/appsscript.json` の webapp セクションで以下が設定されています:

| 設定 | 値 | 説明 |
|---|---|---|
| `executeAs` | `USER_DEPLOYING` | デプロイしたユーザーの権限で実行 |
| `access` | `ANYONE_ANONYMOUS` | 認証なしで誰でもアクセス可能 |

## 対応ファイル形式

| ファイル形式 | MIME タイプ | 処理方法 |
|---|---|---|
| Google Docs | `application/vnd.google-apps.document` | DocumentApp API で直接取得 |
| Google Sheets | `application/vnd.google-apps.spreadsheet` | SpreadsheetApp API で全シート取得 |
| PDF | `application/pdf` | Drive API で OCR 付き変換後テキスト取得 |
| Word (.docx/.doc) | `application/vnd.openxmlformats-officedocument.*` 等 | Google Docs に変換後テキスト取得 |

## 使い方

### 同期テキスト抽出

`readTextFromUrl(urlOrId, options)` に Google Drive の URL またはファイル ID を渡してテキストを取得。

```javascript
// Google Docs URL
var text = readTextFromUrl("https://docs.google.com/document/d/FILE_ID/edit");

// ファイル ID
var text = readTextFromUrl("FILE_ID");

// PDF (OCR 言語指定)
var text = readTextFromUrl("PDF_FILE_ID", { ocrLanguage: "ja" });
```

入力形式は以下に対応:

- Google Docs / Sheets / Drive の URL
- 共有リンク (`/d/FILE_ID/` 形式)
- クエリパラメータ付きリンク (`?id=FILE_ID`)
- ファイル ID (10文字以上の英数字)

### 非同期タスク API

Web アプリとしてデプロイすることで、HTTP 経由でテキスト抽出・分割処理を実行可能。

#### タスク作成 (POST)

```
POST {デプロイURL}
Content-Type: application/json

{
  "action": "createTask",
  "sourceUrl": "https://docs.google.com/document/d/FILE_ID/edit",
  "parts": 3,
  "splitMode": "equal",
  "ocrLanguage": "ja"
}
```

| パラメータ | 必須 | 説明 | デフォルト |
|---|---|---|---|
| `action` | Yes | `"createTask"` 固定 | - |
| `sourceUrl` | Yes | 対象ファイルの URL または ID | - |
| `parts` | No | 分割数 | `1` |
| `splitMode` | No | `"equal"` (行均等分割) / `"page"` (改ページ `\f` で分割) | `"equal"` |
| `ocrLanguage` | No | PDF OCR 言語コード | `"ja"` |

レスポンス:

```json
{
  "taskId": "t_xxxxxxxxxxxx",
  "status": "queued",
  "statusUrl": "?taskId=t_xxxxxxxxxxxx"
}
```

#### タスク状態確認 (GET)

```
GET {デプロイURL}?taskId={taskId}
```

レスポンス:

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

タスクのステータス: `queued` → `running` → `completed` / `failed`

失敗時のレスポンスには `error` オブジェクト (`code`, `message`) が含まれます。

#### アクセス制御

- タスク状態確認時、リクエスト元のユーザーがタスク作成者と一致しない場合は `FORBIDDEN` エラーを返します。
- 結果ファイルは Google Drive 上にオーナー限定 (PRIVATE) で保存されます。保存先フォルダ名: `FileTextReaderGAS_Results`

## 必要な OAuth スコープ

| スコープ | 用途 |
|---|---|
| `https://www.googleapis.com/auth/drive` | ファイル情報取得、OCR 変換、結果保存 |
| `https://www.googleapis.com/auth/documents` | Google Docs テキスト取得 |
| `https://www.googleapis.com/auth/spreadsheets` | Google Sheets テキスト取得 |
| `https://www.googleapis.com/auth/script.external_request` | 外部リクエスト (Web App) |
| `https://www.googleapis.com/auth/userinfo.email` | タスク作成者の識別 |

## npm スクリプト

| コマンド | 説明 |
|---|---|
| `npm run clasp:login` | Google 認証 |
| `npm run clasp:push` | コードをデプロイ |
| `npm run clasp:pull` | リモートからコード取得 |
| `npm run clasp:open` | Apps Script エディタを開く |
