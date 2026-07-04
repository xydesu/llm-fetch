<div align="center">

# 🤖 LLMFetch

**專為 LLM (大型語言模型) 打造的輕量級網頁資訊獲取工具集**

</div>

---

## 📖 專案介紹

本專案提供了一套實用的網路請求與網頁解析工具模組，主要設計用來為大語言模型 (LLM) 擴充外部世界知識與聯網能力（例如 RAG 應用）。它簡化了網頁搜尋與網址元資料的擷取流程，目前支援透過 DuckDuckGo 進行無縫的網頁及圖片搜尋，以及解析特定網站（如 Bilibili）或一般網站的 Open Graph (OG) 標籤。

---

## ✨ 包含的工具模組

目前提供的核心工具位於 `src/utils/` 目錄下：

### 1. DuckDuckGo 搜尋模組 (`search.js`)
用於進行網頁與圖片搜尋，並抓取搜尋結果的標題與摘要。
- **`searchWeb(query)`**: 進行文字搜尋，回傳前 5 筆摘要。
- **`searchImages(query)`**: 進行圖片搜尋，回傳前 5 張圖片網址與來源。

### 2. 網址元資料解析模組 (`urlMetadata/`)
用於自動讀取並解析文字中的 URL，提取網頁的 Open Graph (OG) 標籤或特定平台的詳細資訊。
- **支援 Facebook** 的貼文標題、描述與圖片解析。
- 支援 **YouTube** 的影片標題、頻道名稱、觀看次數與描述解析。（需要設定 `YOUTUBE_API_KEY` 環境變數）
- 支援 **Twitter/X** 的推文內容、作者名稱、轉推按讚數與媒體附件資訊解析。
- 支援 **Bilibili (B站)** 的影片標題、UP 主、觀看次數與簡介解析。（若設定 `.env` 可額外獲取 AI 影片總結與提綱）[API 參考](https://github.com/watermelon1024/bilibili-API-collect)
- 支援一般網站的標題與描述解析。

### 🔮 未來可能支援的平台解析

未來可能將以下平台的元資料解析整合至本工具集，主要參考來源如下：
- **Pixiv**: [Phixiv](https://github.com/thelaao/phixiv)
- **TikTok**: [fxTikTok](https://github.com/okdargy/fxTikTok)/[EmbedEZ](https://embedez.com)/[KKTikTok](https://kkscript.com/)
- **Reddit**: [FixReddit](https://github.com/MinnDevelopment/fxreddit)/[vxReddit](https://github.com/dylanpdx/vxReddit)/[EmbedEZ](https://embedez.com)
- **Instagram**: [InstaFix](https://github.com/Wikidepia/InstaFix)/[EmbedEZ](https://embedez.com)/[KKInstagram](https://kkscript.com/)/[vxinstagram](https://github.com/Lainmode/InstagramEmbed-vxinstagram)/[InstaEmbedRouter](https://github.com/Knoppiix/InstaEmbedRouter)
- **FurAffinity**: [xfuraffinity](https://github.com/FirraWoof/xfuraffinity)/[fxraffinity](https://fxraffinity.net/)
- **Twitch Clips**: [fxtwitch](https://github.com/seriaati/fxtwitch)
- **Iwara**: [fxiwara](https://github.com/seriaati/fxiwara)
- **Bluesky**: [VixBluesky](https://github.com/Lexedia/VixBluesky)/[FxEmbed](https://github.com/FxEmbed/FxEmbed)
- **Facebook**: [EmbedEZ](https://embedez.com)/[fxfacebook](https://github.com/seriaati/fxfacebook)/[facebed](https://github.com/4pii4/facebed)
- **Tumblr**: [fxtumblr](https://github.com/knuxify/fxtumblr)
- **Threads**: [FixThreads](https://github.com/milanmdev/fixthreads)/[vxThreads](https://github.com/everettsouthwick/vxThreads)/[EmbedEZ](https://embedez.com)/[FixEmbed](https://fixembed.app)
- **PTT**: [fxptt](https://github.com/seriaati/fxptt)
- **DeviantArt**: [fxdeviantart](https://github.com/Tschrock/fixdeviantart)

---

## 🚀 安裝與配置

```bash
# 安裝依賴套件 (如 cheerio 等)
npm install
```

### 環境變數設定 (.env)

若需要啟用 Bilibili (B站) 影片的 AI 總結功能，請在專案根目錄建立 `.env` 檔案並填寫：

```env
BILIBILI_SESSDATA=你的_Bilibili_SESSDATA_Cookie
```
> **提示**：登入 B站後，在瀏覽器開發者工具的 Application -> Cookies 中可找到 `SESSDATA`。DuckDuckGo 搜尋與一般網頁解析則完全**不需要**設定任何環境變數即可使用。

### 使用範例

**DuckDuckGo 網頁搜尋：**
```javascript
const { searchWeb } = require('./src/utils/search');

async function test() {
    const result = await searchWeb('Node.js 20 新特性');
    console.log(result);
}
test();
```

**解析文字中的網址：**
```javascript
const { extractUrlsMetadata } = require('./src/utils/urlMetadata');

async function test() {
    const text = "快看這個影片：https://www.bilibili.com/video/BV1xx411c7mD";
    const result = await extractUrlsMetadata(text);
    console.log(result);
}
test();
```

---

## 授權條款

本專案採用 [MIT License](LICENSE) 授權。
