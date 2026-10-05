# url_context_rules

社群與網頁連結解析結果的文字模板。JS 僅負責解析、判斷與插值執行期資料；
任何出現在輸出文字中的固定字串（含標示、括號、分隔符）都必須留在本檔案的具名區塊中。
區塊名稱僅使用英數字與底線。

## twitter_post
[Twitter 推文 (注意：作者僅為發布者帳號暱稱，非貼文主體內容) | 作者: {{author}} | 轉推: {{reposts}} 喜歡: {{likes}}{{media_text}}]
推文內文: {{content_text}}

## twitter_media_photo_count
{{count}} 張圖片

## twitter_media_video_count
{{count}} 個影片/動圖

## twitter_media_video_only
包含影片

## twitter_media_note
[附帶: {{media_items}}]

## twitter_media_only_text
(純影片/圖片推文，無文字說明)

## twitter_no_text
(無文字內文)

## bilibili_video
[Bilibili 影片 (注意：UP主僅為發布者帳號暱稱，非影片核心主題) | 標題: {{title}} | UP主: {{up_name}} | 描述: {{description}}]

## bilibili_ai_summary
[AI 總結: {{summary}}]

## bilibili_outline
[影片提綱:
{{outline}}]

## bilibili_outline_item
- {{title}}

## bilibili_sessdata_invalid
[系統提示: Bilibili SESSDATA 已失效，無法取得 AI 總結]

## bilibili_unknown_up
未知UP主

## bilibili_up_fallback
UP主

## youtube_video
[YouTube 影片 (注意：頻道名稱僅為發布者，非影片核心主題) | 頻道: {{channel_title}} | 觀看次數: {{view_count}}]
標題: {{title}}
描述: {{description}}

## youtube_no_description
(無影片說明)

## instagram_post
[Instagram 貼文 (注意：發布者僅為帳號名稱，非貼文主體內容) | 發布者: {{author}}{{media_text}}]
貼文內容: {{content_text}}

## instagram_default_title
Instagram 貼文

## instagram_media_count
[附帶: {{count}} 張圖片]

## instagram_media_only_text
(純圖片/影片貼文，無文字說明)

## instagram_no_text
(無文字內文)

## facebook_post
[Facebook 貼文 (注意：發布者僅為專頁或帳號名稱，非貼文主體內容) | 發布者: {{author}}{{media_text}}]
貼文內容: {{content_text}}

## facebook_media_count
[附帶: {{count}} 張圖片]

## facebook_media_only_text
(純圖片/影片貼文，無文字說明)

## facebook_no_text
(無文字內文)

## threads_post
[Threads 貼文 (注意：發布者僅為帳號名稱，非貼文主體內容) | 發布者: {{author}}{{media_text}}]
貼文內容: {{content_text}}

## threads_media_count
[附帶: {{count}} 張圖片]

## threads_media_only_text
(純圖片/影片貼文，無文字說明)

## threads_no_text
(無文字內文)

## webpage_link
[網頁連結: {{title}} | {{description}}{{media_text}}]

## webpage_media_count
[附帶: {{count}} 張圖片/網頁截圖]

## webpage_restricted_internal
[網頁連結: 該連結為內部服務或需要登入查看（看不到內容）]

## webpage_restricted_login
[網頁連結: 該連結需要登入或無權限查看（看不到內容）]

## discord_no_client
[Discord 內部連結: 機器人目前未連接 Discord 服務，無法讀取內容（看不到內容）]

## discord_cross_guild
[Discord 連結: 指向其他伺服器的頻道或訊息，小雪無權限跨伺服器查看（看不到內容）]

## discord_channel_unavailable
[Discord 連結: 指向私密頻道或已被刪除的頻道，小雪無權限查看（看不到內容）]

## discord_message_unavailable
[Discord 引用訊息 | 頻道: #{{channel_name}} | 訊息已刪除或無權限讀取（看不到內容）]

## discord_quoted_message
[Discord 引用訊息 | 頻道: #{{channel_name}} | 作者: {{author_name}}{{media_text}}]: {{content}}

## discord_media_count
[附帶: {{count}} 張圖片]

## discord_image_only_text
[純圖片/附件訊息]

## discord_no_text_content
[無文字內容]

## discord_channel_reference
[Discord 頻道參照 | #{{channel_name}}{{topic_text}}]

## discord_channel_topic
| 主題: {{topic}}

## discord_unknown_channel
未知頻道

## discord_unknown_user
未知使用者

## discord_read_error
[Discord 內部連結: 讀取時發生錯誤（看不到內容）]

## description_ellipsis
...

## google_maps_place
[Google 地圖地點: {{place_name}}{{extra_info}}]

## google_maps_coords_suffix
 (座標: {{coords}})

## google_maps_coords_only
[Google 地圖位置: (座標: {{coords}})]

## google_maps_directions
[Google 地圖路線規劃: {{origin}} 往 {{destination}}]

## google_maps_search
[Google 地圖搜尋: {{query}}{{extra_info}}]

## google_maps_fallback
[Google 地圖連結 (無法提取具體地點名稱)]
