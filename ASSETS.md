# Project EBI Version 1.0 アセットマニフェスト

最終更新日: 2026年7月30日
対象Build: `20260727.1`

この文書は正式アセットの制作・配置仕様を確定するためのマニフェストです。ダミーアセットは対象外です。現在、キャラクター正式画像3件が`images/characters`配下に配置済みです。未配置の画像・音声・モデルがあっても、既存の失敗時処理によりゲームはフォールバックで起動できます。

## 1. 命名・配置規則

- ファイル名は対応するcharacter IDまたは用途名と一致させる。
- 使用可能文字は英小文字、数字、ハイフンのみとする。
- 拡張子を含め、大文字と小文字を厳密に統一する。
- URLはGitHub Pagesなどの静的ホスティングで扱える相対パスとする。
- character IDは既存コードを正とする。エビ丸は`ebi-maru`、黄金えびに相当するキャラクターは`hino-gold`である。
- `ebimaru.webp`や`golden-ebi.webp`へ変更する場合はコード修正が必要になるため、Version 1.0では使用しない。

## 2. 推奨画像仕様

### キャラクター

- 形式: WebP
- カラーモード: sRGB
- 背景: 透過
- 基本サイズ: 1024×1024px
- 構図: キャラクター全体を中央配置し、四辺に約8～12%の安全余白を確保
- 表現: 小さいスマートフォン表示でも輪郭と表情を判別できるコントラスト
- 推奨容量: 1ファイル300KB以下を目標。画質を損なう場合は500KB程度まで許容
- アニメーションWebPは使用しない

1024×1024の透過画像は、AR、図鑑カード、詳細画面、Story立ち絵で安全に共用できます。現在はAR画面と図鑑カード／詳細モーダルが同じ`definition.image`を読み込みます。Story立ち絵は未実装です。

### スポット

- 形式: WebP
- 基本サイズ: 1600×900px（16:9）
- カラーモード: sRGB
- 推奨容量: 1ファイル500KB以下
- 撮影・掲載許諾、人物・車両番号・私有物の写り込みを確認する
- `object-fit: cover`で切り抜かれても主要被写体が残る中央寄せ構図とする

## 3. 全キャラクター画像・音声・モデル一覧

「AR」と「図鑑」は現在`definition.image`を実際に表示します。「Story」は会話者名を文字列表示し、立ち絵は未使用です。画像読込失敗時はAR・図鑑とも🦐表示へ切り替わります。

| ID | 表示名 | 画像パス（AR／共用推奨） | 個別音声 | GLBモデル | Story／会話 | 優先度 | 状態 |
|---|---|---|---|---|---|---|---|
| `ebi-maru` | エビ丸 | `images/characters/ebi-maru.webp` | `sounds/characters/ebi-maru.mp3` | `models/ebi-maru.glb` | 主要会話者。現在は名前のみ | A | 画像配置済み |
| `cabbage-kun` | キャベツくん | `images/characters/cabbage-kun.webp` | `sounds/characters/cabbage-kun.mp3` | `models/cabbage-kun.glb` | 利用なし | C | 未配置 |
| `lemon-pyon` | レモンぴょん | `images/characters/lemon-pyon.webp` | `sounds/characters/lemon-pyon.mp3` | `models/lemon-pyon.glb` | 利用なし | C | 未配置 |
| `tart-chan` | タルタルちゃん | `images/characters/tart-chan.webp` | `sounds/characters/tart-chan.mp3` | `models/tart-chan.glb` | 利用なし | C | 未配置 |
| `koromo-pon` | ころもポン | `images/characters/koromo-pon.webp` | `sounds/characters/koromo-pon.mp3` | `models/koromo-pon.glb` | 利用なし | C | 未配置 |
| `hino-bito` | ひのびと | `images/characters/hino-bito.webp` | `sounds/characters/hino-bito.mp3` | `models/hino-bito.glb` | 利用なし | C | 未配置 |
| `machi-akari` | まちあかり | `images/characters/machi-akari.webp` | `sounds/characters/machi-akari.mp3` | `models/machi-akari.glb` | 利用なし | C | 未配置 |
| `kaze-ebi` | かぜえび | `images/characters/kaze-ebi.webp` | `sounds/characters/kaze-ebi.mp3` | `models/kaze-ebi.glb` | 利用なし | C | 未配置 |
| `midori-furai` | みどりフライ | `images/characters/midori-furai.webp` | `sounds/characters/midori-furai.mp3` | `models/midori-furai.glb` | 利用なし | C | 未配置 |
| `kawa-taruto` | かわタルト | `images/characters/kawa-taruto.webp` | `sounds/characters/kawa-taruto.mp3` | `models/kawa-taruto.glb` | 利用なし | C | 未配置 |
| `shonin-ebi` | 商人えび | `images/characters/shonin-ebi.webp` | `sounds/characters/shonin-ebi.mp3` | `models/shonin-ebi.glb` | 利用なし | C | 未配置 |
| `rail-furai` | レールフライ | `images/characters/rail-furai.webp` | `sounds/characters/rail-furai.mp3` | `models/rail-furai.glb` | 利用なし | C | 未配置 |
| `yamamori` | やまもり | `images/characters/yamamori.webp` | `sounds/characters/yamamori.mp3` | `models/yamamori.glb` | 利用なし | C | 未配置 |
| `mizube-queen` | みずべクイーン | `images/characters/mizube-queen.webp` | `sounds/characters/mizube-queen.mp3` | `models/mizube-queen.glb` | 利用なし | C | 未配置 |
| `festival-ebi` | まつりえび | `images/characters/festival-ebi.webp` | `sounds/characters/festival-ebi.mp3` | `models/festival-ebi.glb` | 利用なし | C | 未配置 |
| `castle-crisp` | 武将えび | `images/characters/castle-crisp.webp` | `sounds/characters/castle-crisp.mp3` | `models/castle-crisp.glb` | 利用なし | C | 画像配置済み |
| `satoyama-knight` | 里山ナイト | `images/characters/satoyama-knight.webp` | `sounds/characters/satoyama-knight.mp3` | `models/satoyama-knight.glb` | 利用なし | C | 未配置 |
| `hino-gold` | 黄金えび | `images/characters/hino-gold.webp` | `sounds/characters/hino-gold.mp3` | `models/hino-gold.glb` | Chapter 3の進行対象。現在は立ち絵なし | A | 画像配置済み |
| `king-furai` | フライ王 | `images/characters/king-furai.webp` | `sounds/characters/king-furai.mp3` | `models/king-furai.glb` | 利用なし | C | 未配置 |
| `queen-tartar` | タルタル女王 | `images/characters/queen-tartar.webp` | `sounds/characters/queen-tartar.mp3` | `models/queen-tartar.glb` | 利用なし | C | 未配置 |

### 用途別の現在値

- AR用画像参照パス: 上表の`images/characters/{character-id}.webp`
- 図鑑用画像参照パス: 専用定義なし。共用する場合は同じ`definition.image`を使用する
- Story用画像参照パス: 専用定義なし。共用する場合は会話者名からcharacter IDへ対応付ける
- ARモデル参照パス: `models/{character-id}.glb`
- キャラクター個別音声: `sounds/characters/{character-id}.mp3`
- ARモデルは定義済みだが、Version 1.0のAR描画はWebP画像を使用し、GLBはまだ描画しない

### 正式画像3体の統合状態

| character ID | 正式表示名 | 画像パス | 画像配置状態 | 図鑑表示状態 | AR表示状態 | 音声状態 | モデル状態 |
|---|---|---|---|---|---|---|---|
| `ebi-maru` | エビ丸 | `images/characters/ebi-maru.webp` | 配置済み（1024×1024 WebP・透過・sRGB） | カード／詳細で表示 | 表示確認済み | 未配置・フォールバック | 未配置・画像ARを使用 |
| `hino-gold` | 黄金えび | `images/characters/hino-gold.webp` | 配置済み（1024×1024 WebP・透過・sRGB） | カード／詳細で表示 | 表示確認済み | 未配置・フォールバック | 未配置・画像ARを使用 |
| `castle-crisp` | 武将えび | `images/characters/castle-crisp.webp` | 配置済み（1024×1024 WebP・透過・sRGB） | カード／詳細で表示 | 表示確認済み | 未配置・フォールバック | 未配置・画像ARを使用 |

## 4. 現在のサウンド一覧

### BGM

| サウンドID | 現在の参照パス | 発行元／呼出元 | 再生タイミング | ループ | 優先度 | 状態 |
|---|---|---|---|---|---|---|
| `title` | `sounds/bgm-title.mp3` | 現在呼出なし | タイトル画面用として定義のみ | あり | A | 未配置・未接続 |
| `adventure` | `sounds/bgm-adventure.mp3` | `ui:start-requested`後の直接呼出 | 「冒険をはじめる」操作後 | あり | A | 未配置・接続済み |

### 効果音

| サウンドID | 現在の参照パス | イベント／操作 | 再生タイミング | 優先度 | 状態 |
|---|---|---|---|---|---|
| `spotArrived` | `sounds/se-spot-arrived.mp3` | `gps:spot-arrived` | スポット到着 | B | 未配置・接続済み |
| `characterFound` | `sounds/se-character-found.mp3` | `character:acquired`、AR開始時の直接呼出 | 取得時。AR開始時にも直接再生 | A | 未配置・接続済み |
| `levelUp` | `sounds/se-level-up.mp3` | `character:levelup` | レベルアップ時 | B | 未配置・接続済み |
| `couponReceived` | `sounds/se-coupon-received.mp3` | `coupon:acquired` | クーポン取得時 | B | 未配置・接続済み |
| `button` | `sounds/se-button.mp3` | buttonまたは`data-action`のクリック | UIボタン操作時 | A | 未配置・接続済み |
| `characterVoice` | 実行時に各`definition.sound`を設定 | AR開始時の直接呼出 | カメラAR開始後 | B/C | 20件すべて未配置 |
| `rareCharacter` | 実行時に各`definition.sound`を設定 | AR開始時の直接呼出 | epic／legendaryのカメラAR開始後 | B/C | 個別音声と同一ファイル |

### Version 1.0向け追加推奨サウンド

以下はPriority A要件ですが、現在の`DEFAULT_ASSETS`には定義がありません。本番コードへ導入する段階でEventBus接続が必要です。

| 推奨サウンドID | 推奨配置パス | 接続候補イベント | 用途 | 優先度 | 状態 |
|---|---|---|---|---|---|
| `captureSuccess` | `sounds/se-capture-success.mp3` | `ar:captured` | 捕獲成功 | A | 未定義・未配置 |
| `questComplete` | `sounds/se-quest-complete.mp3` | `quest:complete` | Quest達成 | A | 未定義・未配置 |
| `achievementUnlock` | `sounds/se-achievement-unlock.mp3` | `achievement:unlock` | Achievement解除 | A | 未定義・未配置 |
| `ending` | `sounds/bgm-ending.mp3` | `ending:start`または`ending:credit` | エンディング／スタッフロール | A | 未定義・未配置 |

「発見音」は既存の`se-character-found.mp3`を使用します。捕獲成功音とは役割を分けます。

## 5. 音声推奨仕様

### 共通

- iPhone SafariとAndroid Chromeの互換性を優先し、正式配布形式はMP3とする
- ファイル名は英小文字、数字、ハイフンのみ
- 先頭と末尾の不要な無音を削除する
- クリッピング、DCオフセット、過度な低域を除去する
- 最終試聴は端末内蔵スピーカーとイヤホンの両方で行う
- ラウドネスの目安はBGMを約-16 LUFS、効果音・ボイスを約-14～-16 LUFSとし、ピークは-1 dBTP以下に抑える

### BGM

- 形式: MP3
- 推奨: 44.1kHz、ステレオ、128～192kbps
- ループ開始・終了点のクリック音、残響切れ、テンポずれを確認する
- ループ前提のため、曲頭・曲末の長い無音は入れない

### 効果音

- 形式: MP3。必要なら制作マスターとしてWAVを別管理してよい
- 推奨: 44.1kHz、モノラルまたはステレオ、96～160kbps
- 長さ: ボタン音は約0.1～0.3秒、通知音は約0.5～2秒を目安とする
- 同時再生されても耳障りにならない音量と帯域にする

### キャラクター個別音声

- 形式: MP3
- 推奨: 44.1kHz、モノラル、96～128kbps
- 長さ: 約0.5～2秒
- セリフを使用する場合はStory本文と重ならない短い掛け声を推奨

## 6. 音量・ミュート・自動再生対応

- 初期値: master `1.0`、BGM `0.65`、SE `0.8`、muted `false`
- 実効音量: `master × channel`
- BGMはループし、開始時に300msフェードインする
- SEは重複再生可能で、終了後にAudioの参照を解放する
- 読込・再生失敗は`false`を返し、`sound:error`を発行する。ゲーム進行は停止しない
- ミュート中は再生を行わない
- iPhone Safariの自動再生制限に対応し、`pointerdown`または`keydown`で`unlock()`する
- 「冒険をはじめる」の処理でも`unlock()`してからBGMを再生する
- ユーザー操作前のBGMは`pendingBgmId`へ保留し、`sound:blocked`を発行する

注意: 現在のAR開始処理は`spotArrived`と`characterFound`を直接再生し、同時にEventBus側にも同種の接続があります。正式音源導入前に、発見・到着・取得のどの時点で一度だけ鳴らすかを確定する必要があります。また、個別音声は簡易ARではなくカメラAR開始後にのみ呼ばれます。

## 7. スポット画像一覧

スポット定義には次の17ファイルが設定されていますが、現在のUIはスポット画像を表示していません。画像表示を導入する場合はPriority Bとして制作し、掲載権利を確認します。

| スポット | 推奨配置パス | 仕様 | 優先度 | 状態 |
|---|---|---|---|---|
| えびふらいと抹茶専門店 はま田 | `images/spots/hamada.webp` | 1600×900 WebP | B | 未配置 |
| 馬見岡綿向神社 | `images/spots/umamioka-watamuki-shrine.webp` | 1600×900 WebP | B | 未配置 |
| 近江日野商人館 | `images/spots/omi-hino-merchant-museum.webp` | 1600×900 WebP | B | 未配置 |
| 日野まちかど感応館 | `images/spots/hino-machikado-kanno.webp` | 1600×900 WebP | B | 未配置 |
| 蒲生氏郷公像 | `images/spots/gamo-ujisato-statue.webp` | 1600×900 WebP | B | 未配置 |
| 中野城跡 | `images/spots/nakano-castle-ruins.webp` | 1600×900 WebP | B | 未配置 |
| 若草清水 | `images/spots/wakakusa-spring.webp` | 1600×900 WebP | B | 未配置 |
| 信楽院 | `images/spots/shingakuin-temple.webp` | 1600×900 WebP | B | 未配置 |
| 西明寺 | `images/spots/saimyoji-temple.webp` | 1600×900 WebP | B | 未配置 |
| 鬼室神社 | `images/spots/kishitsu-shrine.webp` | 1600×900 WebP | B | 未配置 |
| 近江日野商人ふるさと館 | `images/spots/omi-hino-furusatokan.webp` | 1600×900 WebP | B | 未配置 |
| 正明寺 | `images/spots/shomeiji-temple.webp` | 1600×900 WebP | B | 未配置 |
| 金剛定寺 | `images/spots/kongojoji-temple.webp` | 1600×900 WebP | B | 未配置 |
| 若松の森跡 | `images/spots/wakamatsu-forest-ruins.webp` | 1600×900 WebP | B | 未配置 |
| 常福寺 | `images/spots/jofukuji-temple.webp` | 1600×900 WebP | B | 未配置 |
| 村社綿向神社 | `images/spots/murasha-watamuki-shrine.webp` | 1600×900 WebP | B | 未配置 |
| 徳本上人名号碑 | `images/spots/tokumoto-shonin-inscription.webp` | 1600×900 WebP | B | 未配置 |

## 8. Priority A

Version 1.0の最低限の制作対象です。

1. `images/characters/ebi-maru.webp`（配置済み）
2. `images/characters/hino-gold.webp`（配置済み）
3. `sounds/se-character-found.mp3`
4. `sounds/se-capture-success.mp3`
5. `sounds/se-quest-complete.mp3`
6. `sounds/se-achievement-unlock.mp3`
7. `sounds/se-button.mp3`
8. `sounds/bgm-title.mp3`
9. `sounds/bgm-adventure.mp3`
10. `sounds/bgm-ending.mp3`

Priority Aのキャラクター画像2件は配置済みです。`castle-crisp`も正式画像として配置され、3件とも既存パスのままAR・図鑑へ接続済みです。効果音とBGMは引き続き正式音源の配置が必要です。`bgm-title.mp3`は定義済みですが再生処理が未接続です。

## 9. Priority B

- Story主要キャラクター画像: Version 1.0ではエビ丸と日野ゴールドをPriority Aで兼用
- 主要スポット画像: 上記17件。公開範囲は権利確認後に決定
- キャラクター個別音声: まず`ebi-maru.mp3`と`hino-gold.mp3`
- 補助SE: スポット到着、レベルアップ、クーポン取得

## 10. Priority C

- 全20キャラクター画像の完成
- 全20キャラクター個別音声の完成
- 全20キャラクターGLBモデルの完成
- WebXR／WebGL描画の導入はアセット制作とは別の実装Phaseで扱う

## 11. 制作・導入順

1. エビ丸と日野ゴールドのデザイン、ID、余白、色基準を確定
2. 2体の1024×1024透過WebPを制作し、AR実機表示を確認
3. 発見、捕獲、Quest、Achievement、ボタンの5種類のSEを制作
4. タイトル、探索、エンディングの3曲を制作し、ループと音量差を確認
5. Priority Aの未接続サウンドをEventBusへ接続する実装を別途レビュー
6. エビ丸と日野ゴールドの個別音声を制作
7. 主要スポット画像を権利確認後に制作
8. 残り18キャラクターの画像と音声を共通テンプレートで制作
9. 全20体のGLBを制作し、将来のレンダラー導入時に最適化

## 12. 将来コード変更が必要な箇所

このPhaseでは変更しません。

- `js/sound.js`: `captureSuccess`、`questComplete`、`achievementUnlock`、`ending`の定義追加
- `js/sound.js`: `ar:captured`、`quest:complete`、`achievement:unlock`、`ending:start`への接続
- `index.html`またはUI初期化: タイトルBGMの開始・画面遷移時のBGM切替
- `js/ar.js`: 発見音・到着音・取得音の重複タイミング整理
- `js/ar.js`: 個別音声を簡易ARでも再生するかの仕様決定
- `js/story.js`: 会話者とcharacter IDの対応付け、および同一画像の立ち絵利用
- `js/ending.js`: エンディングBGMの開始・終了
- GLBを使用する場合: `js/ar.js`へWebGL／WebXRレンダラーを別途導入

画像パスを既存IDのまま使用する限り、配置済み3画像をAR・図鑑へ表示するための追加コード変更は不要です。

## 13. JSONマニフェスト案

将来、定義を外部化する場合の案です。Version 1.0本番コードにはまだ導入しません。

```json
{
  "version": 1,
  "characters": {
    "ebi-maru": {
      "image": "images/characters/ebi-maru.webp",
      "voice": "sounds/characters/ebi-maru.mp3",
      "model": "models/ebi-maru.glb",
      "priority": "A"
    },
    "hino-gold": {
      "image": "images/characters/hino-gold.webp",
      "voice": "sounds/characters/hino-gold.mp3",
      "model": "models/hino-gold.glb",
      "priority": "A"
    }
  },
  "bgm": {
    "title": "sounds/bgm-title.mp3",
    "adventure": "sounds/bgm-adventure.mp3",
    "ending": "sounds/bgm-ending.mp3"
  },
  "se": {
    "characterFound": "sounds/se-character-found.mp3",
    "captureSuccess": "sounds/se-capture-success.mp3",
    "questComplete": "sounds/se-quest-complete.mp3",
    "achievementUnlock": "sounds/se-achievement-unlock.mp3",
    "button": "sounds/se-button.mp3"
  }
}
```
