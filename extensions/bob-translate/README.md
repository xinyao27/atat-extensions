# Bob Translate

Select text, click **Translate with Bob**, and Bob opens with the translation. The same button
sits on text entries in Clipboard History.

## What it does

One action, on the selection bar and in Clipboard History. It hands the text to
[Bob](https://bobtranslate.com) through the same AppleScript you could paste into
Text Selection → Add action → AppleScript:

```applescript
on atatSelection(selectedText)
    tell application id "com.hezongyidev.Bob"
        launch
        translate selectedText
    end tell
end atatSelection
```

## What it touches

- **Bob has to be installed.** Without it the button is greyed out, and the extension's page in
  Settings links to Bob's website.
- **`automation`** is the one entitlement, for running that AppleScript. The first time it runs,
  macOS asks whether @@ may control Bob.
- No network, no storage, nothing written anywhere.

## 中文

选中文字，点「用 Bob 翻译」，Bob 弹出译文；剪贴板历史里的文字条目也有同一个按钮。
没装 Bob 时按钮是灰的，扩展页里有 Bob 官网链接。第一次运行 macOS 会问是否允许 @@ 控制 Bob。
