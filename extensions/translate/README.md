# Translate

Translates the text you point at, right where you pointed at it.

- Select text and click **Translate** in the bar that appears: the translation opens beside
  the selection, with the original above it. **Replace** writes a translation back into the
  document you were editing; **Copy** puts it on the clipboard.
- The same button appears on a clipboard item and on a screenshot's card. A screenshot is
  read on-device with `ocr` first, so only words, never the image, reach the translators.
- Every service you turn on translates at once, each in its own card you can fold, with that
  card's buttons under its own translation: your agent, macOS's own translation, Google
  Translate, Microsoft Translator and DeepL. Turn services on or off on the Translate page
  in Settings.
  - Your agent needs nothing set up.
  - macOS translation works on-device and needs the language pair downloaded first; the
    button on its settings row opens System Settings › General › Language & Region.
  - Google Translate needs no account and no key.
  - Microsoft Translator uses a key and region from Azure; DeepL uses a key from your
    DeepL account. Keys are kept in your Keychain.
- The original shows the language it was recognized as. Click that to say otherwise, and the
  services translate from the one you pick.
- The language row under the original picks both sides: what it is being translated from
  (Auto Detect by default) and what it is being translated into, with a swap button between
  them. The target starts at Automatic: translations go into your primary language, and
  text already in it goes into your second language, both set on the extension's page.
- English, Simplified and Traditional Chinese, Japanese, Korean, French, Russian, German,
  Spanish, Italian, Portuguese, Polish, Dutch and Arabic are all offered on both sides.
- **Speak** reads the original or any translation aloud with the Mac's own voice, in that
  language's voice. Click again to stop.
- **Favorite** keeps a translation in Clipboard History's Favorites, where you can find it
  again later.
- The pin in the window's top bar keeps the window around: while it is pinned, clicking
  elsewhere, scrolling or switching apps does not close it. Esc or the close button does.
- Requests go only to the services you turned on. Your agent receives the text as data to
  translate, never as instructions.
- Nothing is saved. The original and the translations live in the window and go away with
  it; the only things that leave are the translation requests and whatever you copy or
  replace.
- Requires AtAt 1.2.0 or newer.

## 翻译

把你点到的文字就地翻译出来。

- 选中文字，点浮动条上的**翻译**：译文和原文一起出现在选区旁边。**替换**把译文写回你
  正在编辑的地方，**复制**把它放进剪贴板。
- 剪贴板条目和截图卡片上有同一个按钮。截图先用设备上的 `ocr` 读出文字，送出去的只有
  文字，不是图片。
- 你在设置里打开的每个服务都会同时翻译，各成一张能收起的卡片，卡片里的按钮就在译文下面：
  你的助手、macOS 自带翻译、Google 翻译、微软翻译和 DeepL。开关都在设置的「翻译」页里。
  - 你的助手不用配置。
  - macOS 自带翻译在设备上完成，需要先下载对应的语言；它那行的按钮直接打开系统设置 ›
    通用 › 语言与地区。
  - Google 翻译不用账号，也不用填密钥。
  - 微软翻译要填 Azure 的密钥和区域，DeepL 要填账号里的密钥。密钥存在钥匙串里。
- 原文下面会显示识别出的语言。点一下就能改成你选的语言，各服务按它翻译。
- 原文下方一行选两侧语言：从哪种语言（默认自动检测）、译成哪种语言，中间可以一键交换。
  目标语言默认是「自动」：译成你的主要语言，原文已经是主要语言时译成第二语言，两个语言
  在扩展的设置页里选。
- 英语、简体中文、繁体中文、日语、韩语、法语、俄语、德语、西班牙语、意大利语、葡萄牙语、
  波兰语、荷兰语和阿拉伯语，两侧都能选。
- **朗读**用 Mac 自带的语音读出原文或任一译文，并自动选对应语言的嗓音；再点一下停止。
- **收藏**把译文存进剪贴板历史的「收藏」，之后还能找到。
- 标题栏的图钉让窗口不再自动消失：钉住后点别处、滚动或切换应用都不会关掉它，Esc 或关闭按钮
  才会。
- 翻译请求只会发给你打开的服务。发给助手的内容是「要翻译的文字」，不是要执行的指令。
- 不保存任何东西：原文和译文只在这个窗口里，关掉就没了。真正出去的只有这些翻译请求，
  以及你自己复制或替换的内容。
- 需要 AtAt 1.2.0 或更新版本。

## Assets

The service logos are the vendors' own artwork, kept only to identify the service they belong
to: Google Translate, Microsoft Translator and Apple Translate app icons from Apple's App
Store listing artwork; DeepL from DeepL's official brand kit (2025).
