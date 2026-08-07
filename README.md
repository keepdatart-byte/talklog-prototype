# SETLOG Prototype

スマートフォン向けの会話アルバム Web アプリのプロトタイプです。

## 実装方針

- Next.js / TypeScript / React / Tailwind CSS ベース
- 体験フローは `app/page.tsx` のクライアント状態で管理
- 人物と会話データは LocalStorage に保存
- 音声処理は `src/lib/audioProcessing.ts` に分離し、外部 API へ差し替え可能
- 対応ブラウザでは Web Speech API で録音中の発話テキストを裏側で取得
- Web Speech API が使えない端末では文字起こし、話者分離、イベント検出をモック処理へ退避
- 元音声は保存せず、一時 Blob とチャンクは処理後に破棄

## 主なファイル

- `app/page.tsx`: 画面遷移、録音フロー、話者割り当て、詳細、再生、検索
- `app/globals.css`: レトロなピクセル調デザイン
- `src/components/DrawingCanvas.tsx`: 指描き似顔絵キャンバス
- `src/lib/types.ts`: 人物・会話・発言・イベントの型
- `src/lib/mockData.ts`: 初期人物とサンプル会話
- `src/lib/audioProcessing.ts`: 音声処理の差し替え用インターフェース
- `src/lib/storage.ts`: LocalStorage 永続化
- `public/manifest.webmanifest`, `public/sw.js`: PWA 対応

## 開発

```bash
npm install
npm run dev
```

デフォルトでは `http://127.0.0.1:3000` で起動します。

動作確認でクリック遷移が反応しない場合は、production ビルドで確認してください。

```bash
npm run build
npm run start -- --hostname 0.0.0.0 --port 3001
```

## GitHub Pages で確認する

このプロジェクトは `main` ブランチへ push すると GitHub Actions で静的ビルドされ、GitHub Pages に公開できます。

1. GitHub で空のリポジトリを作成
2. このフォルダを `main` ブランチとして push
3. リポジトリの `Settings > Pages` で `GitHub Actions` を選択
4. Actions 完了後に `https://<owner>.github.io/<repo>/` をスマホで開く

GitHub Pages は HTTPS で開けるため、同じ Wi-Fi にいないスマホからも画面遷移や保存フローを確認できます。Web Speech API とマイク取得はブラウザ対応に依存します。
