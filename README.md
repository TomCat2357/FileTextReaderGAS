# FileTextReaderGAS

Google Docs, Sheets, PDF, Word ファイルからテキストを抽出する Google Apps Script ライブラリ。
非同期タスク API によるテキスト分割処理にも対応。

## ディレクトリ構成

```
FileTextReaderGAS/
├── .clasp.json            # clasp プロジェクト設定
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

### 3. プロジェクトの作成とデプロイ

新規作成する場合:

```bash
clasp create --title "FileTextReaderGAS" --type standalone --rootDir src
```

既存プロジェクトにデプロイ:

```bash
npm run clasp:push
```

### 4. Google Cloud Console での設定

Apps Script エディタで以下を有効化:

- **Advanced Google services** > **Drive API**
- Google Cloud Console で同プロジェクトの **Google Drive API** を有効化

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
- 共有リンク
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
| `splitMode` | No | `"equal"` (行均等分割) / `"page"` (改ページ分割) | `"equal"` |
| `ocrLanguage` | No | PDF OCR 言語コード | `"ja"` |

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
    { "partNo": 1, "status": "completed", "url": "https://drive.google.com/..." },
    { "partNo": 2, "status": "completed", "url": "https://drive.google.com/..." },
    { "partNo": 3, "status": "completed", "url": "https://drive.google.com/..." }
  ]
}
```

タスクのステータス: `queued` → `running` → `completed` / `failed`

## 必要な OAuth スコープ

- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/script.external_request`
- `https://www.googleapis.com/auth/userinfo.email`

## npm スクリプト

| コマンド | 説明 |
|---|---|
| `npm run clasp:login` | Google 認証 |
| `npm run clasp:push` | コードをデプロイ |
| `npm run clasp:pull` | リモートからコード取得 |
| `npm run clasp:open` | Apps Script エディタを開く |
